// @vitest-environment jsdom
import { act, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LazyContent } from '../../components/LazyContent'

vi.mock('../../lib/notifications', () => ({ unlockAudio: vi.fn(), stopTitleFlash: vi.fn(), notifySessionComplete: vi.fn() }))
vi.mock('../../lib/offlineSync', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/offlineSync')>(), initOfflineSync: vi.fn(), processQueue: vi.fn(),
}))

async function settleUntil(check: () => boolean) {
  for (let attempt = 0; attempt < 100 && !check(); attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  }
  expect(check()).toBe(true)
}

it('istatistik, deneme ve ayarlar istekte yüklenir; gezinme ve kısayol engeli korunur', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('__APP_VERSION__', 'test')
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 400, x: 0, y: 0, top: 0, right: 800, bottom: 400, left: 0, toJSON: () => ({}) })
  const { default: App } = await import('../../App')
  const { useTimerStore } = await import('../../store/timer')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text)!
  try {
    await act(async () => { root.render(<App />) })
    await settleUntil(() => Boolean(button('İstatistikler')))
    await act(async () => { button('İstatistikler').click() })
    await settleUntil(() => container.textContent!.includes('Saatlere Göre Çalışma'))
    expect(container.querySelector('details')?.open).toBe(false)
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })) })
    expect(useTimerStore.getState().status).toBe('idle')
    await act(async () => { button('Denemelerim').click() })
    await settleUntil(() => container.textContent!.includes('Henüz deneme seansı yok'))
    await act(async () => { button('Zamanlayıcı').click() })
    await act(async () => { container.querySelector<HTMLButtonElement>('button[title="Ayarlar"]')!.click() })
    const settingsVisible = () => [...document.querySelectorAll('h2')].some(heading => heading.textContent === 'Ayarlar')
    await settleUntil(settingsVisible)
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })) })
    expect(useTimerStore.getState().status).toBe('idle')
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })) })
    expect(settingsVisible()).toBe(false)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

it('ekran paketi yüklenemezse uygulama hata ve geri dönüş kontrolü gösterir', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // Beklenen React error boundary raporu; diğer testlerde konsol bastırılmaz.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const BrokenView = lazy(() => Promise.reject(new Error('test chunk unavailable')))
  const onClose = vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => { root.render(<LazyContent fallback={<p>Yükleniyor</p>} onClose={onClose}><BrokenView /></LazyContent>) })
    await settleUntil(() => Boolean(container.querySelector('[role="alert"]')))
    expect(container.textContent).toContain('Bu ekran yüklenemedi')
    await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent === 'Geri dön')!.click() })
    expect(onClose).toHaveBeenCalledOnce()
  } finally {
    await act(async () => { root.unmount() })
  }
})
