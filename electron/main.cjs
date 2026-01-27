const { app, BrowserWindow } = require('electron');
const path = require('path');

function getIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  const buildIcon = path.join(__dirname, '..', 'build', 'icon.ico');
  const fs = require('fs');
  if (fs.existsSync(buildIcon)) return buildIcon;
  return path.join(__dirname, '..', 'public', 'icon-192x192.png');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'zamAn',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
