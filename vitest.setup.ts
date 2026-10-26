import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, vi } from 'vitest'
import { createMemoryStorage } from './src/test/helpers/storage'

// Gerçek SDK istemcisini kullanmak testlerde açıkça yasak. Veri testleri
// getSupabase sınırına kontrollü bir test istemcisi yerleştirir.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    throw new Error('Testte gerçek Supabase istemcisi kullanılamaz; createSupabaseStub kullanın.')
  },
  navigatorLock: () => { throw new Error('Testte SDK tarayıcı kilidi açık bir test taklidi gerektirir.') },
  processLock: () => { throw new Error('Testte SDK süreç kilidi açık bir test taklidi gerektirir.') },
}))

// Store'lar bu nesnelere referans tutar; her testte nesneyi değiştirmek
// yerine içeriğini temizleriz. Tarayıcının depolamasına erişim yoktur.
globalThis.localStorage = createMemoryStorage()
globalThis.sessionStorage = createMemoryStorage()
if (typeof window === 'undefined') globalThis.window = globalThis as typeof globalThis & Window

globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => (
  setTimeout(() => callback(performance.now()), 0) as unknown as number
)
globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('Testte ağ isteği engellendi; kontrollü bir test yanıtı kullanın.')
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
