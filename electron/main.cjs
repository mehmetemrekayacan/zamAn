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
const NORMAL_SIZE = { width: 420, height: 800 };
const MINI_SIZE = { width: 340, height: 100 };

/* ─── Pencere ─── */

function createWindow() {
  win = new BrowserWindow({
    width: NORMAL_SIZE.width,
    height: NORMAL_SIZE.height,
    minWidth: 360,
    minHeight: 600,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'zamAn',
    autoHideMenuBar: true,
  });

  // Paketlenmiş (production) sürümde remote URL'den yükle → deploy sonrası otomatik güncelleme
  if (app.isPackaged) {
    win.loadURL(APP_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Pencere kapatıldığında tray'e küçült (çıkış yapmak için tray → Çıkış)
  win.on('close', (e) => {
    if (!app.isQuitting && tray) {
      e.preventDefault();
      win.hide();
    }
  });
}

/* ─── System Tray ─── */

function createTray() {
  const iconPath = getIconPath();
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
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
      checked: false,
      click: (item) => toggleMiniPlayer(item.checked),
    },
    {
      label: 'Her Zaman Üstte',
      type: 'checkbox',
      checked: false,
      click: (item) => {
        if (win) win.setAlwaysOnTop(item.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Göster',
      click: () => {
        if (win) { win.show(); win.focus(); }
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

  tray.setToolTip('zamAn — Çalışma Zamanlayıcı');
  tray.setContextMenu(contextMenu);

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
  isMiniPlayer = enabled;

  if (enabled) {
    win.setMinimumSize(MINI_SIZE.width, MINI_SIZE.height);
    win.setSize(MINI_SIZE.width, MINI_SIZE.height);
    win.setAlwaysOnTop(true);
    win.setResizable(false);
  } else {
    win.setMinimumSize(360, 600);
    win.setSize(NORMAL_SIZE.width, NORMAL_SIZE.height);
    win.setAlwaysOnTop(false);
    win.setResizable(true);
  }

  sendToRenderer('mini-player-changed', enabled);
}

/* ─── IPC ─── */

function sendToRenderer(channel, data) {
  if (win && win.webContents) {
    win.webContents.send(channel, data);
  }
}

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
  if (win) win.setAlwaysOnTop(enabled);
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
