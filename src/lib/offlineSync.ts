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
  /** Session verisi (upsert için) */
  payload?: SessionRecord
}

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

/* ─── Flush: kuyruktaki tüm işlemleri Supabase'e gönder ─── */

export async function flushSyncQueue(): Promise<{ flushed: number; failed: number }> {
  const supabase = getSupabase()
  if (!supabase) return { flushed: 0, failed: 0 }

  const user = await getCurrentUser()
  if (!user) return { flushed: 0, failed: 0 }

  const db = await getDb()
  const items = await db.getAll('sync-queue')
  if (items.length === 0) return { flushed: 0, failed: 0 }

  let flushed = 0
  let failed = 0
  const MAX_RETRIES = 5

  for (const item of items) {
    if (item.retryCount >= MAX_RETRIES) {
      // Çok fazla denendi — sil
      if (item.id != null) await db.delete('sync-queue', item.id)
      failed++
      continue
    }

    try {
      if (item.action === 'upsert_session' && item.payload) {
        const row = sessionToRow(item.payload, user.id)
        const { error } = await supabase.from('sessions').upsert(row, { onConflict: 'id,user_id' })
        if (error) throw error
      } else if (item.action === 'delete_session') {
        // Soft delete — deleted_at set et
        const { error } = await supabase
          .from('sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', item.sessionId)
          .eq('user_id', user.id)
        if (error) throw error
      }

      // Başarılı → kuyruktan sil
      if (item.id != null) await db.delete('sync-queue', item.id)
      flushed++
    } catch {
      // Hata → retry sayacını artır
      if (item.id != null) {
        await db.put('sync-queue', { ...item, retryCount: item.retryCount + 1 })
      }
      failed++
    }
  }

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

export function initOfflineSync(): void {
  if (listenerAttached) return
  listenerAttached = true

  window.addEventListener('online', () => {
    // Online olunca kuyruğu boşalt
    void flushSyncQueue().then(({ flushed }) => {
      if (flushed > 0) {
        console.log(`[offlineSync] ${flushed} bekleyen işlem buluta gönderildi.`)
      }
    })
  })

  // Uygulama açılışında online'sa kuyruğu boşalt
  if (navigator.onLine) {
    void flushSyncQueue()
  }
}
