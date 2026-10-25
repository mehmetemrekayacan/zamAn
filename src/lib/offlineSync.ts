/**
 * Offline Sync Kuyruğu
 *
 * Kullanıcı çevrimdışıyken yapılan mutasyonları (seans kaydet, sil)
 * kuyruğa ekler. Online olunca otomatik olarak buluta gönderir.
 *
 * Akış:
 * 1. saveSession() çağrıldığında → IndexedDB'ye yaz + kuyruğa ekle
 * 2. Online olunca → flushSyncQueue() → Supabase'e upsert
 * 3. Başarılı olanları kuyruktan sil
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { getSupabase } from './supabase'
import { getCurrentUser } from './cloudSync'
import type { SessionRecord } from '../types'
import { assertCurrentScope, getDataScope, isCurrentScope, scopeKey, type DataScope } from './dataScope'
import { initDb } from './db'
import { acceptMissingRemote, acceptRemoteSession, getPendingSessions, reconcileLocalSessions, seedPendingSession } from './localSync'
import { assertRemoteRow, newMutationId, sessionFingerprint, sessionToRow, type PendingSessionMutation } from './syncProtocol'
import { cloudError, ensureSyncProtocol } from './cloudProtocol'
import { isSyncActive } from './syncActivity'

/* ─── DB Şeması ─── */

export type SyncAction = 'upsert_session' | 'delete_session'

export interface SyncQueueItem {
  /** undefined olan eski girdiler karantinada kalır; hesaba tahminle atanmaz. */
  ownerId?: string | null
  ownerKey?: string
  mutationId?: string
  baseVersion?: number
  /** Auto-increment key */
  id?: number
  action: SyncAction
  /** SessionRecord ID */
  sessionId: string
  /** Kuyruğa eklenme zamanı */
  createdAt: string
  /** Kaç kez denendi */
  retryCount: number
  /** Son hata mesajı (debug/UI amaçlı) */
  lastError?: string
  /** Bir sonraki deneme zamanı (ISO) */
  nextAttemptAt?: string
  /** Kalıcı başarısızlık (max retry aşıldı) */
  isFailed?: boolean
  /** Session verisi (upsert için) */
  payload?: SessionRecord
}

export type RetryableQueueItem = SyncQueueItem

interface SyncQueueDB extends DBSchema {
  'sync-queue': {
    key: number
    value: SyncQueueItem
    indexes: { 'by-session': string; 'by-owner': string; 'by-owner-session': [string, string] }
  }
}

const DB_NAME = 'zaman-sync-queue'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<SyncQueueDB>> | null = null
export type QueueResult = { flushed: number; failed: number; scheduled: number; conflicts: number }
const flushes = new Map<DataScope, Promise<QueueResult>>()
let queueTail: Promise<unknown> = Promise.resolve()

/** İçe aktarma ile kuyruk mutasyonları aynı sekmede birbirine karışmaz. */
function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueTail.then(operation)
  queueTail = result.catch(() => {})
  return result
}

export function withEmptySyncQueue<T>(operation: () => Promise<T>, scope: DataScope = getDataScope()): Promise<T> {
  return withQueueLock(async () => {
    assertCurrentScope(scope)
    if (flushes.has(scope) || isSyncActive(scope)) {
      throw new Error('Senkronizasyon devam ediyor. Tamamlandıktan sonra içe aktarmayı yeniden dene.')
    }
    if (await getQueueLength(scope) > 0 || (await getPendingSessions(scope)).length > 0) {
      throw new Error('Bekleyen senkronizasyon işlemleri var. Önce senkronizasyonu tamamlayıp yeniden dene.')
    }
    assertCurrentScope(scope)
    return operation()
  })
}

export function waitForQueueIdle(scope: DataScope) {
  return withQueueLock(async () => { assertCurrentScope(scope) })
}

const BASE_DELAY_MS = 1_500
const MAX_DELAY_MS = 5 * 60_000
const MAX_RETRIES = 8

function computeBackoffMs(retryCount: number): number {
  const expDelay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** retryCount))
  const jitter = Math.floor(Math.random() * 500)
  return expDelay + jitter
}

async function getDb(): Promise<IDBPDatabase<SyncQueueDB>> {
  if (dbPromise) return dbPromise
  dbPromise = openDB<SyncQueueDB>(DB_NAME, DB_VERSION, {
    upgrade(db, _old, _new, transaction) {
      if (!db.objectStoreNames.contains('sync-queue')) {
        const store = db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true })
        store.createIndex('by-session', 'sessionId')
      }
      const store = transaction.objectStore('sync-queue')
      if (!store.indexNames.contains('by-owner')) store.createIndex('by-owner', 'ownerKey')
      if (!store.indexNames.contains('by-owner-session')) store.createIndex('by-owner-session', ['ownerKey', 'sessionId'])
    },
  })
  try { return await dbPromise } catch (error) { dbPromise = null; throw error }
}

/* ─── Kuyruğa ekleme ─── */

export async function enqueueSync(action: SyncAction, sessionId: string, payload?: SessionRecord, scope: DataScope = getDataScope(), mutation?: PendingSessionMutation): Promise<void> {
  let pending = mutation
  if (!pending && scope.ownerId !== null) {
    const local = await initDb(scope)
    const state = await local.get('sync-state', sessionId)
    const same = state?.pending?.action === action && (action === 'delete_session' || (payload && state.pending.payload && sessionFingerprint(payload) === sessionFingerprint(state.pending.payload)))
    pending = same ? state.pending : { mutationId: newMutationId(), baseVersion: state?.pending?.baseVersion ?? state?.version ?? 0, action, payload }
    await seedPendingSession(sessionId, pending!, scope, true)
  }
  return withQueueLock(async () => {
    const db = await getDb()
    const ownerKey = scopeKey(scope)
    const transaction = db.transaction('sync-queue', 'readwrite')
    const done = transaction.done
    void done.catch(() => {})
    try {

      // Aynı session için önceki bekleyen kayıtları sil (dedupe)
      const existing = await transaction.store.index('by-owner-session').getAll([ownerKey, sessionId])
      if (pending && existing.length === 1 && existing[0].mutationId === pending.mutationId) {
        await done
        return
      }
      for (const item of existing) {
        if (item.id != null) await transaction.store.delete(item.id)
      }

      await transaction.store.add({
        ownerId: scope.ownerId,
        ownerKey,
        mutationId: pending?.mutationId,
        baseVersion: pending?.baseVersion,
        action,
        sessionId,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: undefined,
        nextAttemptAt: undefined,
        isFailed: false,
        payload,
      })
      await done
    } catch (error) {
      try { transaction.abort() } catch { /* Zaten iptal edilmiş olabilir. */ }
      await done.catch(() => {})
      throw error
    }
  })
}

/* ─── Kuyruk bilgisi ─── */

export async function getQueueLength(scope: DataScope = getDataScope()): Promise<number> {
  const db = await getDb()
  return db.countFromIndex('sync-queue', 'by-owner', scopeKey(scope))
}

export async function getQueueItems(scope: DataScope = getDataScope()): Promise<SyncQueueItem[]> {
  const db = await getDb()
  return db.getAllFromIndex('sync-queue', 'by-owner', scopeKey(scope))
}

export async function getUnownedQueueItems(): Promise<SyncQueueItem[]> {
  const db = await getDb()
  return (await db.getAll('sync-queue')).filter((item) => item.ownerId === undefined)
}

/** Otomatik denemelerin durduğu girdileri yalnızca açık hesap için yeniden açar. */
export function retryFailedQueue(scope: DataScope = getDataScope()): Promise<number> {
  return withQueueLock(async () => {
    assertCurrentScope(scope)
    const db = await getDb()
    const transaction = db.transaction('sync-queue', 'readwrite')
    const done = transaction.done
    void done.catch(() => {})
    const abort = () => { try { transaction.abort() } catch { /* Tamamlandı. */ } }
    scope.signal.addEventListener('abort', abort, { once: true })
    try {
      let retried = 0
      for (const item of await transaction.store.index('by-owner').getAll(scopeKey(scope))) {
        if (!item.isFailed) continue
        await transaction.store.put({ ...item, isFailed: false, retryCount: 0, lastError: undefined, nextAttemptAt: undefined })
        retried++
      }
      await done
      return retried
    } catch (error) { abort(); await done.catch(() => {}); throw error }
    finally { scope.signal.removeEventListener('abort', abort) }
  })
}

async function executeQueueItem(item: RetryableQueueItem, scope: DataScope): Promise<'applied' | 'conflict' | 'stale'> {
  assertCurrentScope(scope)
  if (scope.ownerId === null || item.ownerId !== scope.ownerId) throw new Error('Kuyruk hesabı uyuşmuyor.')
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase unavailable')

  const db = await initDb(scope)
  const state = await db.get('sync-state', item.sessionId)
  const pending = state?.pending
  if (!pending || pending.mutationId !== item.mutationId) return 'stale'
  assertCurrentScope(scope)
  const { data, error } = await supabase.rpc('zaman_apply_session', {
    p_id: item.sessionId, p_mutation_id: pending.mutationId, p_expected_version: pending.baseVersion,
    p_action: pending.action, p_payload: pending.payload ? sessionToRow(pending.payload) : null,
  }).abortSignal(scope.signal)
  assertCurrentScope(scope)
  if (error) throw error
  if (!data || !['applied', 'conflict'].includes(data.status)) throw new Error('Geçersiz senkronizasyon yanıtı.')
  if (data.row === null && data.status === 'conflict') await acceptMissingRemote(item.sessionId, scope)
  else {
    assertRemoteRow(data.row, item.sessionId)
    await acceptRemoteSession(data.row, scope, data.status === 'applied' ? pending : undefined, data.status === 'conflict')
  }
  return data.status
}

/* ─── Process: kuyruktaki işlemleri backoff+jitter ile işle ─── */

export async function processQueue(scope: DataScope = getDataScope()): Promise<QueueResult> {
  if (scope.ownerId === null || !isCurrentScope(scope)) return { flushed: 0, failed: 0, scheduled: 0, conflicts: 0 }
  const existing = flushes.get(scope)
  if (existing) return existing
  const processing = processQueuedItems(scope)
  flushes.set(scope, processing)

  try {
    return await processing
  } finally {
    flushes.delete(scope)
  }
}

async function processQueuedItems(scope: DataScope): Promise<QueueResult> {
  const supabase = getSupabase()
  if (!supabase) return { flushed: 0, failed: 0, scheduled: 0, conflicts: 0 }

  const user = await getCurrentUser()
  if (!user || user.id !== scope.ownerId || !isCurrentScope(scope)) return { flushed: 0, failed: 0, scheduled: 0, conflicts: 0 }
  await ensureSyncProtocol(supabase, scope)
  // Eski, sahibi belli kuyruk girdileri sıfır sürümle güvenli biçimde devralınır.
  const local = await initDb(scope)
  for (const item of await getQueueItems(scope)) {
    if (!item.mutationId && !await local.get('sync-state', item.sessionId)) {
      await seedPendingSession(item.sessionId, { mutationId: newMutationId(), baseVersion: 0, action: item.action, payload: item.payload }, scope)
    }
  }
  await reconcileLocalSessions(scope)
  for (const state of await getPendingSessions(scope)) {
    const pending = state.pending!
    await enqueueSync(pending.action, state.id, pending.payload, scope, pending)
  }

  const db = await getDb()
  // Ağ beklenirken enqueue kilitlenmez: yeni değişiklikler hemen kalıcılaşır.
  // İçe aktarma açıksa ilk kuyruk okuması onun tamamlanmasını bekler.
  const items = await withQueueLock(() => getQueueItems(scope))
  if (items.length === 0) return { flushed: 0, failed: 0, scheduled: 0, conflicts: 0 }

  const now = Date.now()
  const sorted = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  let flushed = 0
  let failed = 0
  let scheduled = 0
  let conflicts = 0

  for (const item of sorted) {
    if (!isCurrentScope(scope)) break
    const current = await local.get('sync-state', item.sessionId)
    if (!current?.pending || current.pending.mutationId !== item.mutationId) {
      if (item.id != null) await db.delete('sync-queue', item.id)
      continue
    }
    if (item.isFailed) {
      failed++
      continue
    }

    const dueAt = item.nextAttemptAt ? new Date(item.nextAttemptAt).getTime() : 0
    if (dueAt > now) {
      scheduled++
      continue
    }

    try {
      const outcome = await executeQueueItem(item, scope)
      if (!isCurrentScope(scope)) break
      if (item.id != null) await db.delete('sync-queue', item.id)
      if (outcome === 'applied') flushed++
      if (outcome === 'conflict') conflicts++
    } catch (error) {
      if (!isCurrentScope(scope)) break
      const nextRetry = item.retryCount + 1
      const errMessage = (error as Error)?.message ?? 'Unknown sync error'

      if (nextRetry >= MAX_RETRIES) {
        if (item.id != null) {
          await db.put('sync-queue', {
            ...item,
            retryCount: nextRetry,
            isFailed: true,
            lastError: errMessage,
            nextAttemptAt: undefined,
          })
        }
        failed++
        continue
      }

      const delay = computeBackoffMs(nextRetry)
      if (item.id != null) {
        if (await db.get('sync-queue', item.id)) await db.put('sync-queue', {
          ...item,
          retryCount: nextRetry,
          isFailed: false,
          lastError: errMessage,
          nextAttemptAt: new Date(now + delay).toISOString(),
        })
      }
      scheduled++
    }
  }

  return { flushed, failed, scheduled, conflicts }
}

/* ─── Geriye uyumluluk: eski API ─── */

export async function flushSyncQueue(): Promise<{ flushed: number; failed: number }> {
  const { flushed, failed } = await processQueue()
  return { flushed, failed }
}

/* ─── Yardımcı: SessionRecord → DB satırı ─── */

/* ─── Online/Offline Dinleyici ─── */

let listenerAttached = false

export function initOfflineSync(onProcessed?: (result: { flushed: number; failed: number; scheduled: number }) => void): void {
  if (listenerAttached) return
  listenerAttached = true

  const runQueue = () => {
    if (getDataScope().ownerId === null) return
    void import('./sessionSync').then(({ syncCloud }) => syncCloud()).then(() => {
      onProcessed?.({ flushed: 0, failed: 0, scheduled: 0 })
    }).catch((error) => console.error('[sync]', cloudError(error)))
  }

  window.addEventListener('online', () => {
    runQueue()
  })

  // Uygulama açılışında online'sa kuyruğu boşalt
  if (navigator.onLine) {
    runQueue()
  }

  // Periyodik deneme (ör. geçici ağ/supabase timeout sonrası)
  window.setInterval(() => {
    if (!navigator.onLine) return
    runQueue()
  }, 30_000)
}
