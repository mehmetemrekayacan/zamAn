/**
 * IndexedDB: Tüm seans kayıtları burada kalıcı tutulur.
 * Uygulama kapatılsa da, sayfa yenilense de veriler silinmez.
 * Sadece kullanıcı “Tüm verileri temizle” (Ayarlar) derse silinir.
 *
 * v2: Seans kaydedildiğinde/silindiğinde offline sync kuyruğuna da eklenir.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Mode, SessionRecord } from '../types'
import { enqueueSync } from './offlineSync'
import { isCloudSyncEnabled } from './supabase'

interface TimerDB extends DBSchema {
  sessions: {
    key: string
    value: SessionRecord
    indexes: { 'by-date': string; 'by-mod': string }
  }
}

const DB_NAME = 'zaman-olcer-v1'
const DB_VERSION = 1

let dbInstance: IDBPDatabase<TimerDB> | null = null

export async function initDb(): Promise<IDBPDatabase<TimerDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<TimerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' })
        store.createIndex('by-date', 'tarihISO')
        store.createIndex('by-mod', 'mod')
      }
    },
  })

  return dbInstance
}

export async function saveSession(session: SessionRecord): Promise<void> {
  const db = await initDb()
  const record = {
    ...session,
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as SessionRecord
  await db.put('sessions', record)

  // Bulut sync aktifse kuyruğa ekle (online olunca gönderilir)
  if (isCloudSyncEnabled()) {
    void enqueueSync('upsert_session', record.id, record)
  }
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  const db = await initDb()
  return db.get('sessions', id)
}

export async function listSessions(filter?: {
  mod?: Mode
  from?: string
  to?: string
}): Promise<SessionRecord[]> {
  const db = await initDb()

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

export async function deleteSession(id: string): Promise<void> {
  const db = await initDb()
  await db.delete('sessions', id)

  // Bulut sync aktifse silme işlemini kuyruğa ekle
  if (isCloudSyncEnabled()) {
    void enqueueSync('delete_session', id)
  }
}

export async function clearAllSessions(): Promise<void> {
  const db = await initDb()
  await db.clear('sessions')
}
