import { describe, expect, it, vi } from 'vitest'
import { onGlobalHotkey, onMiniPlayerChanged, type ElectronAPI } from './electronBridge'

describe('Electron IPC dinleyici yaşam döngüsü', () => {
  it.each([false, true])('yeniden bağlanan hotkey tek kez çalışır; preload unsubscribe desteği: %s', (supportsUnsubscribe) => {
    const listeners = new Set<(action: string) => void>()
    const removed = vi.fn()
    vi.stubGlobal('window', { electronAPI: {
      onGlobalHotkey: (callback) => {
        listeners.add(callback)
        return supportsUnsubscribe ? () => { listeners.delete(callback); removed() } : undefined
      },
    } as Pick<ElectronAPI, 'onGlobalHotkey'> })
    const action = vi.fn()
    const old = onGlobalHotkey(action)
    old()
    const current = onGlobalHotkey(action)
    for (const listener of listeners) listener('startStop')
    expect(action).toHaveBeenCalledTimes(1)
    current()
    for (const listener of listeners) listener('reset')
    expect(action).toHaveBeenCalledTimes(1)
    expect(removed).toHaveBeenCalledTimes(supportsUnsubscribe ? 2 : 0)
  })

  it('kaldırılmış mini-player dinleyicisi eski ekranı güncellemez', () => {
    let listener: ((enabled: boolean) => void) | undefined
    vi.stubGlobal('window', { electronAPI: {
      onMiniPlayerChanged: (callback: (enabled: boolean) => void) => { listener = callback },
    } })
    const render = vi.fn()
    const stop = onMiniPlayerChanged(render)
    listener?.(true)
    stop()
    listener?.(false)
    expect(render).toHaveBeenCalledExactlyOnceWith(true)
  })
})
