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

/* ─── DB Şeması ─── */

export type SyncAction = 'upsert_session' | 'delete_session'

export interface SyncQueueItem {
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
    indexes: { 'by-session': string }
  }
}

const DB_NAME = 'zaman-sync-queue'
const DB_VERSION = 1

let dbInstance: IDBPDatabase<SyncQueueDB> | null = null
let flushInFlight = false

const BASE_DELAY_MS = 1_500
const MAX_DELAY_MS = 5 * 60_000
const MAX_RETRIES = 8

function computeBackoffMs(retryCount: number): number {
  const expDelay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** retryCount))
  const jitter = Math.floor(Math.random() * 500)
  return expDelay + jitter
}

async function getDb(): Promise<IDBPDatabase<SyncQueueDB>> {
  if (dbInstance) return dbInstance
  dbInstance = await openDB<SyncQueueDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sync-queue')) {
        const store = db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true })
        store.createIndex('by-session', 'sessionId')
      }
    },
  })
  return dbInstance
}

/* ─── Kuyruğa ekleme ─── */

export async function enqueueSync(action: SyncAction, sessionId: string, payload?: SessionRecord): Promise<void> {
  const db = await getDb()

  // Aynı session için önceki bekleyen kayıtları sil (dedupe)
  const existing = await db.getAllFromIndex('sync-queue', 'by-session', sessionId)
  for (const item of existing) {
    if (item.id != null) await db.delete('sync-queue', item.id)
  }

  await db.add('sync-queue', {
    action,
    sessionId,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: undefined,
    nextAttemptAt: undefined,
    isFailed: false,
    payload,
  })
}

/* ─── Kuyruk bilgisi ─── */

export async function getQueueLength(): Promise<number> {
  const db = await getDb()
  return db.count('sync-queue')
}

export async function getQueueItems(): Promise<SyncQueueItem[]> {
  const db = await getDb()
  return db.getAll('sync-queue')
}

async function executeQueueItem(item: RetryableQueueItem, userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase unavailable')

  if (item.action === 'upsert_session' && item.payload) {
    const row = sessionToRow(item.payload, userId)
    const { error } = await supabase.from('sessions').upsert(row, { onConflict: 'id,user_id' })
    if (error) throw error
    return
  }

  if (item.action === 'delete_session') {
    const { error } = await supabase
      .from('sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', item.sessionId)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
}

/* ─── Process: kuyruktaki işlemleri backoff+jitter ile işle ─── */

export async function processQueue(): Promise<{ flushed: number; failed: number; scheduled: number }> {
  if (flushInFlight) return { flushed: 0, failed: 0, scheduled: 0 }
  flushInFlight = true

  try {
    const supabase = getSupabase()
    if (!supabase) return { flushed: 0, failed: 0, scheduled: 0 }

    const user = await getCurrentUser()
    if (!user) return { flushed: 0, failed: 0, scheduled: 0 }

    const db = await getDb()
    const items = (await db.getAll('sync-queue')) as RetryableQueueItem[]
    if (items.length === 0) return { flushed: 0, failed: 0, scheduled: 0 }

    const now = Date.now()
    const sorted = [...items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )

    let flushed = 0
    let failed = 0
    let scheduled = 0

    for (const item of sorted) {
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
        await executeQueueItem(item, user.id)
        if (item.id != null) await db.delete('sync-queue', item.id)
        flushed++
      } catch (error) {
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
          await db.put('sync-queue', {
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

    return { flushed, failed, scheduled }
  } finally {
    flushInFlight = false
  }
}

/* ─── Geriye uyumluluk: eski API ─── */

export async function flushSyncQueue(): Promise<{ flushed: number; failed: number }> {
  const { flushed, failed } = await processQueue()
  return { flushed, failed }
}

/* ─── Yardımcı: SessionRecord → DB satırı ─── */

function sessionToRow(s: SessionRecord, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    mod: s.mod,
    sure_plan: s.surePlan ?? null,
    sure_gercek: s.sureGercek,
    puan: s.puan,
    tarih_iso: s.tarihISO,
    not_text: s.not ?? null,
    duraklatma: s.duraklatmaSayisi,
    erken_bitirme: s.erkenBitirmeSuresi ?? null,
    odak_skoru: s.odakSkoru ?? null,
    mola_saniye: s.molaSaniye ?? null,
    deneme_molalar: s.denemeMolalarSaniye ?? null,
    dogru_sayisi: s.dogruSayisi ?? null,
    yanlis_sayisi: s.yanlisSayisi ?? null,
    bos_sayisi: s.bosSayisi ?? null,
    bolumler: s.bolumler ?? null,
    platform: s.platform ?? null,
    ruh_hali: s.ruhHali ?? null,
    created_at: s.createdAt || new Date().toISOString(),
    updated_at: s.updatedAt || new Date().toISOString(),
    deleted_at: null,
  }
}

/* ─── Online/Offline Dinleyici ─── */

let listenerAttached = false

export function initOfflineSync(onProcessed?: (result: { flushed: number; failed: number; scheduled: number }) => void): void {
  if (listenerAttached) return
  listenerAttached = true

  const runQueue = () => {
    void processQueue().then((result) => {
      if (result.flushed > 0) {
        console.log(`[offlineSync] ${result.flushed} bekleyen işlem buluta gönderildi.`)
      }
      onProcessed?.(result)
    })
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
