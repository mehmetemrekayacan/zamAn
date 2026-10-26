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
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('global-hotkey', listener);
    return () => ipcRenderer.removeListener('global-hotkey', listener);
  },

  /** Mini-player değişim dinleyicisi */
  onMiniPlayerChanged: (callback) => {
    const listener = (_event, enabled) => callback(enabled);
    ipcRenderer.on('mini-player-changed', listener);
    return () => ipcRenderer.removeListener('mini-player-changed', listener);
  },

  /** Electron ortamında olduğumuzu belirtir */
  isElectron: true,
});
