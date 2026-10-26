import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

/** Gerçek main.cjs, pencere/sistem tepsisi açmadan kontrollü Electron API'siyle çalışır. */
async function startDesktop() {
  const windows: TestWindow[] = []
  const ipc = new Map<string, (event: unknown, value: unknown) => void>()
  const shortcuts = new Map<string, () => void>()
  class TestWindow {
    bounds = { x: 40, y: 80, width: 500, height: 800 }
    maximized = false
    webContents = { on: vi.fn(), send: vi.fn() }
    loadURL = vi.fn()
    loadFile = vi.fn()
    destroy = vi.fn()
    removeAllListeners = vi.fn()
    setSize = vi.fn()
    setMinimumSize = vi.fn()
    setResizable = vi.fn()
    setMaximizable = vi.fn()
    setAlwaysOnTop = vi.fn()
    setBounds = vi.fn((bounds: TestWindow['bounds']) => { this.bounds = bounds })
    center = vi.fn()
    show = vi.fn()
    focus = vi.fn()
    on = vi.fn()
    isFocused = () => true
    getNormalBounds = () => ({ ...this.bounds })
    isMaximized = () => this.maximized
    unmaximize = vi.fn(() => { this.maximized = false })
    maximize = vi.fn(() => { this.maximized = true })
    constructor() { windows.push(this) }
    static getAllWindows() { return windows }
  }
  class TestTray { setToolTip() {} setContextMenu() {} on() {} }
  const electron = {
    app: { isPackaged: true, whenReady: () => Promise.resolve(), on: vi.fn(), quit: vi.fn() },
    BrowserWindow: TestWindow, Tray: TestTray,
    Menu: { buildFromTemplate: (value: unknown) => value },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    globalShortcut: { register: (key: string, action: () => void) => { shortcuts.set(key, action) }, unregisterAll: vi.fn() },
    ipcMain: { on: (name: string, action: (event: unknown, value: unknown) => void) => { ipc.set(name, action) } },
  }
  runInNewContext(readFileSync(resolve('electron/main.cjs'), 'utf8'), {
    require: (name: string) => {
      if (name === 'electron') return electron
      if (name === '../app-config.cjs') return { APP_URL: 'https://example.invalid' }
      if (name === 'path') return { join: (...parts: string[]) => parts.join('/') }
      throw new Error(`Beklenmeyen bağımlılık: ${name}`)
    },
    __dirname: '/test/electron', process: { platform: 'win32', resourcesPath: '/test/resources' },
  })
  await Promise.resolve()
  return { windows, ipc, shortcuts }
}

it('mini/normal geçişi sayfayı yeniden yüklemez; aynı pencere ve boyut/konum korunur', async () => {
  const app = await startDesktop()
  const win = app.windows[0]
  const normal = { ...win.bounds }
  app.ipc.get('toggle-mini-player')!(null, true)
  expect(win.destroy).not.toHaveBeenCalled()
  expect(app.windows).toHaveLength(1)
  expect(win.setMinimumSize).toHaveBeenLastCalledWith(300, 200)
  expect(win.setSize).toHaveBeenLastCalledWith(300, 200)
  expect(win.setResizable).toHaveBeenLastCalledWith(false)
  expect(win.webContents.send).toHaveBeenLastCalledWith('mini-player-changed', true)
  app.ipc.get('toggle-mini-player')!(null, false)
  expect(win.setBounds).toHaveBeenLastCalledWith(normal)
  expect(win.setResizable).toHaveBeenLastCalledWith(true)
  expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
  expect(win.loadURL).toHaveBeenCalledOnce()
})

it('büyütülmüş pencere/üstte tut tercihi geri gelir; hotkey mevcut sayfaya gider', async () => {
  const app = await startDesktop()
  const win = app.windows[0]
  win.maximized = true
  app.ipc.get('toggle-always-on-top')!(null, true)
  app.shortcuts.get('CommandOrControl+Shift+M')!()
  expect(win.unmaximize).toHaveBeenCalledOnce()
  app.shortcuts.get('CommandOrControl+Shift+Space')!()
  expect(win.webContents.send).toHaveBeenLastCalledWith('global-hotkey', 'startStop')
  app.shortcuts.get('CommandOrControl+Shift+R')!()
  expect(win.webContents.send).toHaveBeenLastCalledWith('global-hotkey', 'reset')
  app.shortcuts.get('CommandOrControl+Shift+M')!()
  expect(win.maximize).toHaveBeenCalledOnce()
  expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(true)
  expect(win.loadURL).toHaveBeenCalledOnce()
})
