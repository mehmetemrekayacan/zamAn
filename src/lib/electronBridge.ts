/**
 * Electron Bridge — Renderer tarafında Electron IPC kullanımı
 *
 * Electron ortamındaysa window.electronAPI üzerinden iletişim kurar.
 * Web/Mobil'de çağrılar sessizce görmezden gelinir (no-op).
 */

export interface ElectronAPI {
  sendTimerUpdate: (timeStr: string) => void
  toggleMiniPlayer: (enabled: boolean) => void
  toggleAlwaysOnTop: (enabled: boolean) => void
  onGlobalHotkey: (callback: (action: string) => void) => void
  onMiniPlayerChanged: (callback: (enabled: boolean) => void) => void
  isElectron: boolean
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

/** Electron ortamında mıyız? */
export function isElectron(): boolean {
  return Boolean(window.electronAPI?.isElectron)
}

/** Timer süresini tray tooltip'e gönder */
export function sendTimerUpdate(timeStr: string): void {
  window.electronAPI?.sendTimerUpdate(timeStr)
}

/** Mini-player modunu aç/kapat */
export function toggleMiniPlayer(enabled: boolean): void {
  window.electronAPI?.toggleMiniPlayer(enabled)
}

/** Always-on-top modunu aç/kapat */
export function toggleAlwaysOnTop(enabled: boolean): void {
  window.electronAPI?.toggleAlwaysOnTop(enabled)
}

/** Global hotkey dinle (başlat/duraklat, sıfırla vb.) */
export function onGlobalHotkey(callback: (action: string) => void): void {
  window.electronAPI?.onGlobalHotkey(callback)
}

/** Mini-player değişim dinle */
export function onMiniPlayerChanged(callback: (enabled: boolean) => void): void {
  window.electronAPI?.onMiniPlayerChanged(callback)
}
