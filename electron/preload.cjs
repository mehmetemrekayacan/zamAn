/**
 * Electron Preload Script — contextBridge ile güvenli IPC köprüsü
 * Renderer'a (web sayfasına) window.electronAPI olarak expose eder.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Timer süre bilgisini tray'e gönder */
  sendTimerUpdate: (timeStr) => ipcRenderer.send('timer-update', timeStr),

  /** Mini-player modunu aç/kapat */
  toggleMiniPlayer: (enabled) => ipcRenderer.send('toggle-mini-player', enabled),

  /** Always on top modunu aç/kapat */
  toggleAlwaysOnTop: (enabled) => ipcRenderer.send('toggle-always-on-top', enabled),

  /** Global hotkey dinleyicisi */
  onGlobalHotkey: (callback) => {
    ipcRenderer.on('global-hotkey', (_event, action) => callback(action));
  },

  /** Mini-player değişim dinleyicisi */
  onMiniPlayerChanged: (callback) => {
    ipcRenderer.on('mini-player-changed', (_event, enabled) => callback(enabled));
  },

  /** Electron ortamında olduğumuzu belirtir */
  isElectron: true,
});
