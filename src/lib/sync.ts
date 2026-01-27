/**
 * Windows / Mobil senkron: Dışa aktar (JSON dosyası) ve dosyadan içe aktar.
 * Bir cihazda "Dışa aktar" → dosyayı USB/Drive/mail ile diğerine at → "İçe aktar".
 */
import { listSessions, clearAllSessions, saveSession } from './db'
import type { SessionRecord } from '../types'

const EXPORT_VERSION = 1
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
}

export async function exportData(): Promise<Blob> {
  const sessions = await listSessions()
  const timerStorage = localStorage.getItem(TIMER_STORAGE_KEY)
  const denemeConfig = localStorage.getItem(DENEME_CONFIG_KEY)
  const settingsStorage = localStorage.getItem(SETTINGS_STORAGE_KEY)

  const payload: ExportPayload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    timerStorage,
    denemeConfig,
    settingsStorage,
  }

  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

/**
 * İndirilecek dosya adı (tarayıcıda "indir" için).
 */
export function exportFileName(): string {
  return `zaman-yedek-${new Date().toISOString().slice(0, 10)}.json`
}

/**
 * Payload'u yerel verilere uygular (bulut veya dosyadan gelen veri için).
 */
export async function applyPayload(payload: ExportPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await clearAllSessions()
    for (const s of payload.sessions ?? []) {
      if (s?.id && typeof s.tarihISO === 'string') {
        await saveSession(s as SessionRecord)
      }
    }
    if (payload.timerStorage != null) localStorage.setItem(TIMER_STORAGE_KEY, payload.timerStorage)
    if (payload.denemeConfig != null) localStorage.setItem(DENEME_CONFIG_KEY, payload.denemeConfig)
    if (payload.settingsStorage != null) localStorage.setItem(SETTINGS_STORAGE_KEY, payload.settingsStorage)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'İçe aktarma hatası.' }
  }
}

/**
 * JSON dosyasını parse edip içe aktar. Mevcut verilerin üzerine yazar; sonra sayfa yenilenir.
 */
export async function importFromFile(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  let text: string
  try {
    text = await file.text()
  } catch (e) {
    return { ok: false, error: 'Dosya okunamadı.' }
  }

  let payload: ExportPayload
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || !('sessions' in parsed)) {
      return { ok: false, error: 'Geçersiz yedek formatı.' }
    }
    payload = parsed as ExportPayload
  } catch {
    return { ok: false, error: 'Geçersiz JSON.' }
  }

  return applyPayload(payload)
}
