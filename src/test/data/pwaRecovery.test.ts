// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const source = readFileSync('public/app-recovery.js', 'utf8')
const html = readFileSync('index.html', 'utf8')

function setup() {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const base = doc.createElement('base')
  base.href = 'https://zaman.test/'
  doc.head.prepend(base)
  const listeners = new Map<string, (event: object) => void>()
  const timeouts: (() => void)[] = []
  const unregister = vi.fn(async () => true)
  const registration = { scope: base.href, unregister }
  const reload = vi.fn()
  const removeCache = vi.fn<(key: string) => Promise<boolean>>().mockResolvedValue(true)
  const keys = vi.fn(async () => ['app-shell', 'workbox-precache-v2-https://zaman.test/', 'workbox-precache-v2-https://zaman.test/other/', 'other-app-cache'])
  const fetchProbe = vi.fn<(url: string, options: RequestInit) => Promise<Response>>().mockImplementation(async () => new Response(source, { status: 200 }))
  runInNewContext(source, {
    document: doc, HTMLScriptElement, URL, AbortController,
    window: { location: { protocol: 'https:', reload }, addEventListener: (name: string, listener: (event: object) => void) => listeners.set(name, listener) },
    navigator: { serviceWorker: { getRegistration: async () => registration } },
    caches: { keys, delete: removeCache }, fetch: fetchProbe,
    setTimeout: (callback: () => void) => { timeouts.push(callback); return timeouts.length }, clearTimeout: vi.fn(),
  })
  const button = doc.getElementById('app-startup-retry') as HTMLButtonElement
  const panel = doc.getElementById('app-startup-recovery')!
  return { doc, button, panel, listeners, timeouts, reload, unregister, registration, removeCache, keys, fetchProbe }
}

it('giriş modülünün bağımlılığı yüklenemezse React olmadan kurtarma gösterilir', () => {
  const env = setup()
  expect(env.panel.hidden).toBe(true)
  env.listeners.get('error')!({ target: env.doc.querySelector('script[type="module"]') })
  expect(env.panel.hidden).toBe(false)
  expect(env.doc.getElementById('app-startup-message')!.textContent).toContain('başlatılamadı')
  expect(env.unregister).not.toHaveBeenCalled()
  expect(env.removeCache).not.toHaveBeenCalled()
})

it('yanıtsız başlangıçta çıkış yolu gösterilir; başarılı açılıştan sonra müdahale edilmez', () => {
  const env = setup()
  env.timeouts[0]()
  expect(env.panel.hidden).toBe(false)
  env.panel.hidden = true
  env.doc.getElementById('app-startup')!.remove()
  env.listeners.get('unhandledrejection')!({ reason: 'Failed to fetch dynamically imported module' })
  expect(env.panel.hidden).toBe(true)
  expect(env.reload).not.toHaveBeenCalled()
})

it('kullanıcı onarımı yalnızca uygulama dosya önbelleklerini yeniler, seans/oturum verisini korur', async () => {
  const env = setup()
  localStorage.setItem('timer-storage', 'çalışma taslağı')
  localStorage.setItem('auth-session', 'oturum')
  env.button.click()
  env.button.click()
  await vi.waitFor(() => expect(env.reload).toHaveBeenCalledOnce())
  expect(env.fetchProbe).toHaveBeenCalledOnce()
  expect(env.fetchProbe.mock.calls[0][0]).toContain('__zaman_recovery=')
  expect(env.unregister).toHaveBeenCalledOnce()
  expect(env.removeCache.mock.calls.map(([key]) => key)).toEqual(['app-shell', 'workbox-precache-v2-https://zaman.test/'])
  expect(localStorage.getItem('timer-storage')).toBe('çalışma taslağı')
  expect(localStorage.getItem('auth-session')).toBe('oturum')
})

it.each(['offline', 'html'])('%s yanıtında önbellek silinmez, tekrar deneme açık kalır', async kind => {
  const env = setup()
  if (kind === 'offline') env.fetchProbe.mockRejectedValueOnce(new Error('offline'))
  else env.fetchProbe.mockResolvedValueOnce(new Response('<html>SPA fallback</html>'))
  env.button.click()
  await vi.waitFor(() => expect(env.doc.getElementById('app-startup-message')!.textContent).toContain('Onarım tamamlanamadı'))
  expect(env.button.disabled).toBe(false)
  expect(env.unregister).not.toHaveBeenCalled()
  expect(env.removeCache).not.toHaveBeenCalled()
  expect(env.reload).not.toHaveBeenCalled()
})

it('başka kapsamdaki worker kaydını kaldırmaz; bozuk Cache API açılışı engellemez', async () => {
  const env = setup()
  env.registration.scope = 'https://zaman.test/other/'
  env.keys.mockRejectedValueOnce(new Error('cache unavailable'))
  env.button.click()
  await vi.waitFor(() => expect(env.reload).toHaveBeenCalledOnce())
  expect(env.unregister).not.toHaveBeenCalled()
})
