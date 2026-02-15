/**
 * Vitest global setup: Node ortamında eksik browser API'leri
 */
import { vi } from 'vitest'

const noop = () => {}

if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: (i: number) => Object.keys(store)[i] ?? null,
    length: 0,
  }
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
