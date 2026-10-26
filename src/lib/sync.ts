/**
 * Windows / Mobil senkron: Dışa aktar (JSON dosyası) ve dosyadan içe aktar.
 * Bir cihazda "Dışa aktar" → dosyayı USB/Drive/mail ile diğerine at → "İçe aktar".
 */
import { initDb, listSessions } from './db'
import { validateBackup } from './backupValidation'
import { getUnownedQueueItems, withEmptySyncQueue } from './offlineSync'
import type { SessionRecord } from '../types'
import { assertCurrentScope, getDataScope } from './dataScope'
import { getScopedStorage } from './accountStorage'
import type { SyncConflict } from './syncProtocol'
import { getLocalDateString } from './time'

const EXPORT_VERSION = 2
const TIMER_STORAGE_KEY = 'timer-storage'
const DENEME_CONFIG_KEY = 'deneme-config'
const SETTINGS_STORAGE_KEY = 'zaman-olcer-settings'

export interface ExportPayload {
  version: number
  exportedAt: string
  sessions: SessionRecord[]
  timerStorage: string | null
  denemeConfig: string | null
  settingsStorage: string | null
  conflicts?: SyncConflict[]
}

export async function exportData(): Promise<Blob> {
  const scope = getDataScope()
  const sessions = await listSessions(undefined, scope)
  const db = await initDb(scope)
  const conflicts = await db.getAll('sync-conflicts')
  assertCurrentScope(scope)
  const storage = getScopedStorage(scope)
  const timerStorage = storage.getItem(TIMER_STORAGE_KEY)
  const denemeConfig = storage.getItem(DENEME_CONFIG_KEY)
  const settingsStorage = storage.getItem(SETTINGS_STORAGE_KEY)

  const payload: ExportPayload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    timerStorage,
    denemeConfig,
    settingsStorage,
    conflicts,
  }

  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

/**
 * İndirilecek dosya adı (tarayıcıda "indir" için).
 */
export function exportFileName(): string {
  return `zaman-yedek-${getLocalDateString()}.json`
}

/** Sahibi bilinmeyen eski işlemler ham arşivdir; normal yedek gibi içe alınmaz. */
export async function exportUnownedQueue(): Promise<Blob> {
  const scope = getDataScope()
  if (scope.ownerId !== null) throw new Error('Eski işlemler arşivine misafir alanından ulaşabilirsin.')
  const items = await getUnownedQueueItems()
  assertCurrentScope(scope)
  return new Blob([JSON.stringify({
    kind: 'zaman-unowned-sync-queue', version: 1,
    exportedAt: new Date().toISOString(), items,
  }, null, 2)], { type: 'application/json' })
}

/**
 * Tam doğrulanmış yedekle yerel veriyi değiştirir. Normal kayıt yolunu
 * kullanmaz: tarihleri korur, buluta gönderim veya silme işlemi üretmez.
 * IndexedDB atomiktir; Storage değişiklikleri yakalanan hatada geri alınır.
 */
export async function applyPayload(input: unknown, scope = getDataScope()): Promise<{ ok: true } | { ok: false; error: string }> {
  const storage = getScopedStorage(scope)
  try {
    assertCurrentScope(scope)
    const payload = validateBackup(input)
    await withEmptySyncQueue(async () => {
      const changes: [string, string | null][] = [
        [TIMER_STORAGE_KEY, payload.timerStorage],
        [DENEME_CONFIG_KEY, payload.denemeConfig],
        [SETTINGS_STORAGE_KEY, payload.settingsStorage],
        ['zaman-ders60-pause-state', null],
      ]
      const previous = new Map(changes.map(([key]) => [key, storage.getItem(key)]))
      const changedKeys: string[] = []
      const db = await initDb(scope)
      assertCurrentScope(scope)
      const transaction = db.transaction(['sessions','sync-conflicts'], 'readwrite')
      const abort = () => { try { transaction.abort() } catch { /* Tamamlanmış olabilir. */ } }
      scope.signal.addEventListener('abort', abort, { once: true })
      // Abort daha erken gerçekleşse bile done reddi işlenmiş olur.
      const done = transaction.done
      void done.catch(() => {})
      try {
        await transaction.objectStore('sessions').clear()
        for (const session of payload.sessions) await transaction.objectStore('sessions').put(session)
        // Eski v1 yedeği, içermediği çakışma arşivini silmez.
        if (payload.conflicts !== undefined) {
          await transaction.objectStore('sync-conflicts').clear()
          for (const conflict of payload.conflicts) await transaction.objectStore('sync-conflicts').put(conflict)
        }
        assertCurrentScope(scope)
        // Burada yalnızca senkron Storage çağrıları var: transaction açık kalır.
        for (const [key, value] of changes) {
          if (previous.get(key) === value) continue
          if (value === null) storage.removeItem(key)
          else storage.setItem(key, value)
          changedKeys.push(key)
        }
        await done
      } catch (error) {
        try { transaction.abort() } catch { /* Zaten iptal edilmiş olabilir. */ }
        await done.catch(() => {})
        // Veritabanı iptal edilir; sadece gerçekten değiştirilen Storage alanları geri alınır.
        let rollbackFailed = false
        for (const key of changedKeys.reverse()) {
          try {
            const value = previous.get(key) ?? null
            if (value === null) storage.removeItem(key)
            else storage.setItem(key, value)
          } catch { rollbackFailed = true }
        }
        if (rollbackFailed) throw new Error('Seanslar korundu ancak ayarlar geri yüklenemedi. Depolama erişimini kontrol edip yeniden dene.')
        throw error
      } finally {
        scope.signal.removeEventListener('abort', abort)
      }
    }, scope)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'İçe aktarma hatası.' }
  }
}

/**
 * JSON dosyasını parse edip içe aktar. Mevcut verilerin üzerine yazar; sonra sayfa yenilenir.
 */
export async function importFromFile(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = getDataScope()
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: 'Dosya okunamadı.' }
  }

  let payload: unknown
  try {
    payload = JSON.parse(text) as unknown
  } catch {
    return { ok: false, error: 'Geçersiz JSON.' }
  }

  return applyPayload(payload, scope)
}
