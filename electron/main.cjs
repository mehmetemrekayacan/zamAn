const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { APP_URL } = require('../app-config.cjs');

/* ─── Icon ─── */

function getIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  const buildIcon = path.join(__dirname, '..', 'build', 'icon.ico');
  const fs = require('fs');
  if (fs.existsSync(buildIcon)) return buildIcon;
  return path.join(__dirname, '..', 'public', 'icon-192x192.png');
}

let win = null;
let tray = null;
let isMiniPlayer = false;
let alwaysOnTopEnabled = false;
const NORMAL_SIZE = { width: 400, height: 750 };
const MINI_SIZE = { width: 300, height: 200 };

function loadRenderer(windowRef) {
  if (app.isPackaged) {
    windowRef.loadURL(APP_URL);
  } else {
    windowRef.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function sendToRenderer(channel, data) {
  if (win && win.webContents) {
    win.webContents.send(channel, data);
  }
}

function bindWindowLifecycle(windowRef) {
  windowRef.on('close', (e) => {
    if (!app.isQuitting && tray) {
      e.preventDefault();
      windowRef.hide();
    }
  });

  windowRef.webContents.on('did-finish-load', () => {
    if (windowRef === win) {
      sendToRenderer('mini-player-changed', isMiniPlayer);
    }
  });
}

/* ─── Pencere ─── */

function createWindow(options = {}) {
  const {
    mini = false,
  } = options;
  const width = mini ? MINI_SIZE.width : NORMAL_SIZE.width;
  const height = mini ? MINI_SIZE.height : NORMAL_SIZE.height;

  win = new BrowserWindow({
    width,
    height,
    minWidth: mini ? MINI_SIZE.width : 360,
    minHeight: mini ? MINI_SIZE.height : 600,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'zamAn',
    autoHideMenuBar: true,
    frame: !mini,
    transparent: false,
    alwaysOnTop: mini || alwaysOnTopEnabled,
    resizable: !mini,
  });

  win.setSize(width, height);
  win.center();
  win.show();

  loadRenderer(win);
  bindWindowLifecycle(win);
}

/* ─── System Tray ─── */

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '⏱ zamAn', enabled: false },
    { type: 'separator' },
    {
      label: 'Başlat / Duraklat',
      accelerator: 'CmdOrCtrl+Shift+Space',
      click: () => sendToRenderer('global-hotkey', 'startStop'),
    },
    {
      label: 'Sıfırla',
      accelerator: 'CmdOrCtrl+Shift+R',
      click: () => sendToRenderer('global-hotkey', 'reset'),
    },
    { type: 'separator' },
    {
      label: 'Mini Player',
      type: 'checkbox',
      checked: isMiniPlayer,
      click: (item) => toggleMiniPlayer(item.checked),
    },
    {
      label: 'Her Zaman Üstte',
      type: 'checkbox',
      checked: Boolean(alwaysOnTopEnabled || isMiniPlayer),
      click: (item) => {
        alwaysOnTopEnabled = item.checked;
        if (win) win.setAlwaysOnTop(isMiniPlayer || alwaysOnTopEnabled);
      },
    },
    { type: 'separator' },
    {
      label: 'Göster',
      click: () => {
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    {
      label: 'Çıkış',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const iconPath = getIconPath();
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);

  tray.setToolTip('zamAn — Çalışma Zamanlayıcı');
  refreshTrayMenu();

  tray.on('click', () => {
    if (win) {
      if (win.isVisible()) {
        win.focus();
      } else {
        win.show();
        win.focus();
      }
    }
  });
}

/* ─── Mini Player ─── */

function toggleMiniPlayer(enabled) {
  if (!win) return;
  if (enabled === isMiniPlayer) {
    sendToRenderer('mini-player-changed', enabled);
    return;
  }

  const previousWindow = win;
  const wasFocused = previousWindow.isFocused();

  previousWindow.removeAllListeners('close');
  previousWindow.destroy();

  isMiniPlayer = enabled;
  createWindow({ mini: enabled });

  if (win) {
    const targetSize = enabled ? MINI_SIZE : NORMAL_SIZE;
    win.setSize(targetSize.width, targetSize.height);
    win.center();
    win.setAlwaysOnTop(enabled || alwaysOnTopEnabled);
    win.show();
  }

  refreshTrayMenu();

  if (wasFocused && win) {
    win.focus();
  }

  sendToRenderer('mini-player-changed', enabled);
}

/* ─── IPC ─── */

// Renderer'dan gelen timer güncellemesi → tray tooltip
ipcMain.on('timer-update', (_e, timeStr) => {
  if (tray) tray.setToolTip(`zamAn — ${timeStr}`);
  if (win) win.setTitle(timeStr ? `${timeStr} — zamAn` : 'zamAn');
});

// Renderer'dan mini-player toggle isteği
ipcMain.on('toggle-mini-player', (_e, enabled) => {
  toggleMiniPlayer(enabled);
});

// Renderer'dan always-on-top toggle isteği
ipcMain.on('toggle-always-on-top', (_e, enabled) => {
  const isTop = Boolean(enabled);
  alwaysOnTopEnabled = isTop;
  if (win) win.setAlwaysOnTop(isMiniPlayer || isTop);
  refreshTrayMenu();
});

/* ─── Global Shortcuts ─── */

function registerGlobalShortcuts() {
  // Ctrl+Shift+Space → Başlat / Duraklat
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    sendToRenderer('global-hotkey', 'startStop');
  });

  // Ctrl+Shift+R → Sıfırla
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    sendToRenderer('global-hotkey', 'reset');
  });

  // Ctrl+Shift+M → Mini Player toggle
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    toggleMiniPlayer(!isMiniPlayer);
  });
}

/* ─── App Lifecycle ─── */

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerGlobalShortcuts();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
