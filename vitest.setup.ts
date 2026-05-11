/**
 * Vitest global setup: Node ortamında eksik browser API'leri
 */
import { vi } from 'vitest'

const noop = () => {}

function createMemoryStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = createMemoryStorage()
}

if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = createMemoryStorage()
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis as typeof globalThis & Window
}

if (!globalThis.window.localStorage) {
  globalThis.window.localStorage = globalThis.localStorage
}

if (!globalThis.window.sessionStorage) {
  globalThis.window.sessionStorage = globalThis.sessionStorage
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    setTimeout(() => cb(performance.now()), 0)
    return 0
  }) as unknown as typeof requestAnimationFrame
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = vi.fn(noop) as unknown as typeof cancelAnimationFrame
}
