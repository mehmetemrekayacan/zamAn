/**
 * IndexedDB: Tüm seans kayıtları burada kalıcı tutulur.
 * Uygulama kapatılsa da, sayfa yenilense de veriler silinmez.
 * Sadece kullanıcı “Tüm verileri temizle” (Ayarlar) derse silinir.
 *
 * v2: Seans kaydedildiğinde/silindiğinde offline sync kuyruğuna da eklenir.
 */
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb'
import type { Mode, SessionRecord } from '../types'
import { enqueueSync } from './offlineSync'
import { isCloudSyncEnabled } from './supabase'
import { getDataScope, type DataScope } from './dataScope'
import { newMutationId, sessionFingerprint, type SessionSyncState, type SettingsSyncState, type SyncConflict } from './syncProtocol'

interface TimerDB extends DBSchema {
  'sync-state': { key: string; value: SessionSyncState }
  'settings-sync': { key: string; value: SettingsSyncState }
  'sync-conflicts': { key: string; value: SyncConflict }
  'sync-cursors': { key: string; value: { id: string; sequence: number } }
  sessions: {
    key: string
    value: SessionRecord
    indexes: { 'by-date': string; 'by-mod': string }
  }
}

const DB_NAME = 'zaman-olcer-v1'
const DB_VERSION = 3

const connections = new Map<string, Promise<IDBPDatabase<TimerDB>>>()

/** Callback içinde yalnızca IndexedDB ve senkron işlemler yapılmalıdır. */
export async function runLocalTransaction<T>(
  db: IDBPDatabase<TimerDB>, stores: StoreNames<TimerDB>[],
  operation: (transaction: IDBPTransaction<TimerDB, StoreNames<TimerDB>[], 'readwrite'>) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new Error('Hesap değişti. İşlem iptal edildi.')
  const transaction = db.transaction(stores, 'readwrite')
  const done = transaction.done
  void done.catch(() => {})
  const abort = () => { try { transaction.abort() } catch { /* Tamamlandı. */ } }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const result = await operation(transaction)
    await done
    return result
  } catch (error) { abort(); await done.catch(() => {}); throw error }
  finally { signal?.removeEventListener('abort', abort) }
}

export async function initDb(scope: DataScope = getDataScope()): Promise<IDBPDatabase<TimerDB>> {
  const name = scope.ownerId === null ? DB_NAME : `${DB_NAME}:account:${encodeURIComponent(scope.ownerId)}`
  const existing = connections.get(name)
  if (existing) return existing

  const opening = openDB<TimerDB>(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' })
        store.createIndex('by-date', 'tarihISO')
        store.createIndex('by-mod', 'mod')
      }
      if (!db.objectStoreNames.contains('sync-state')) db.createObjectStore('sync-state', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings-sync')) db.createObjectStore('settings-sync', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('sync-conflicts')) db.createObjectStore('sync-conflicts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('sync-cursors')) db.createObjectStore('sync-cursors', { keyPath: 'id' })
    },
  })
  connections.set(name, opening)
  try { return await opening } catch (error) {
    connections.delete(name)
    throw error
  }
}

export async function saveSession(session: SessionRecord, scope: DataScope = getDataScope()): Promise<void> {
  const db = await initDb(scope)
  const { record, pending } = await runLocalTransaction(db, ['sessions','sync-state'], async (transaction) => {
  const old = await transaction.objectStore('sessions').get(session.id)
  const record = {
    ...session,
    createdAt: old?.createdAt || session.createdAt || session.tarihISO,
    updatedAt: new Date().toISOString(),
  } as SessionRecord
  await transaction.objectStore('sessions').put(record)
  let pending: SessionSyncState['pending']
  if (scope.ownerId !== null) {
    const previous = await transaction.objectStore('sync-state').get(record.id)
    const samePending = previous?.pending?.action === 'upsert_session' && previous.pending.payload && sessionFingerprint(previous.pending.payload) === sessionFingerprint(record)
    pending = samePending ? previous.pending : previous?.fingerprint === sessionFingerprint(record) && !previous.pending
      ? undefined : { mutationId: newMutationId(), baseVersion: previous?.pending?.baseVersion ?? previous?.version ?? 0, action: 'upsert_session', payload: record }
    await transaction.objectStore('sync-state').put({ id: record.id, version: previous?.version ?? 0, fingerprint: previous?.fingerprint ?? null, remote: previous?.remote, pending })
  }
    return { record, pending }
  })

  // Bulut sync aktifse kuyruğa ekle (online olunca gönderilir)
  if (pending && isCloudSyncEnabled()) {
    await enqueueSync(pending.action, record.id, pending.payload, scope, pending)
  }
}

export async function getSession(id: string, scope: DataScope = getDataScope()): Promise<SessionRecord | undefined> {
  const db = await initDb(scope)
  return db.get('sessions', id)
}

export async function listSessions(filter?: {
  mod?: Mode
  from?: string
  to?: string
}, scope: DataScope = getDataScope()): Promise<SessionRecord[]> {
  const db = await initDb(scope)

  if (filter?.mod) {
    const sessions = await db.getAllFromIndex('sessions', 'by-mod', filter.mod)
    return sessions.filter((s) => {
      if (filter.from && s.tarihISO < filter.from) return false
      if (filter.to && s.tarihISO > filter.to) return false
      return true
    })
  }

  if (filter?.from || filter?.to) {
    const sessions = await db.getAll('sessions')
    return sessions.filter((s) => {
      if (filter.from && s.tarihISO < filter.from) return false
      if (filter.to && s.tarihISO > filter.to) return false
      return true
    })
  }

  return db.getAll('sessions')
}

export async function deleteSession(id: string, scope: DataScope = getDataScope()): Promise<void> {
  const db = await initDb(scope)
  const { record, pending } = await runLocalTransaction(db, ['sessions','sync-state'], async (transaction) => {
  const record = await transaction.objectStore('sessions').get(id)
  const previous = await transaction.objectStore('sync-state').get(id)
  await transaction.objectStore('sessions').delete(id)
  const pending = { mutationId: newMutationId(), baseVersion: previous?.pending?.baseVersion ?? previous?.version ?? 0, action: 'delete_session' as const, payload: record }
  if (scope.ownerId !== null) await transaction.objectStore('sync-state').put({ id, version: previous?.version ?? 0, fingerprint: previous?.fingerprint ?? null, remote: previous?.remote, pending })
    return { record, pending }
  })

  // Bulut sync aktifse silme işlemini kuyruğa ekle
  if (scope.ownerId !== null && isCloudSyncEnabled()) {
    await enqueueSync('delete_session', id, record, scope, pending)
  }
}

export async function clearAllSessions(scope: DataScope = getDataScope()): Promise<void> {
  const db = await initDb(scope)
  await runLocalTransaction(db, ['sessions','sync-state','sync-cursors'], async (transaction) => {
    await transaction.objectStore('sessions').clear()
    await transaction.objectStore('sync-state').clear()
    await transaction.objectStore('sync-cursors').clear()
  })
}
