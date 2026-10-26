// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Toast } from '../../components/Toast'
import { UpdatePrompt } from '../../components/UpdatePrompt'
import { useTimerStore } from '../../store/timer'

const pwa = vi.hoisted(() => ({ update: vi.fn(), dismiss: vi.fn() }))
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [true, pwa.dismiss], updateServiceWorker: pwa.update }) }))
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

it('yeni mesaj eski kapanış zamanlayıcısını iptal eder; unmount sonrası bildirim kalmaz', async () => {
  vi.useFakeTimers()
  const dismiss = vi.fn()
  await act(async () => root.render(<Toast message="Bir" visible onDismiss={dismiss} duration={1000} />))
  await act(async () => vi.advanceTimersByTime(900))
  await act(async () => root.render(<Toast message="İki" visible onDismiss={dismiss} duration={1000} />))
  await act(async () => vi.advanceTimersByTime(400))
  expect(dismiss).not.toHaveBeenCalled()
  expect(container.textContent).toBe('İki')
  await act(async () => vi.advanceTimersByTime(880))
  expect(dismiss).toHaveBeenCalledOnce()
  await act(async () => root.render(<Toast message="Üç" visible onDismiss={dismiss} duration={1000} />))
  await act(async () => root.render(null))
  await act(async () => vi.runAllTimers())
  expect(dismiss).toHaveBeenCalledOnce()
})

it('güncelleme öncesi sayaç kontrol noktası yazılır; hatada yeniden deneme sunulur', async () => {
  const checkpoint = vi.spyOn(useTimerStore.getState(), 'syncTimer').mockImplementation(() => {})
  pwa.update.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  await act(async () => root.render(<UpdatePrompt />))
  const updateButton = () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Güncelle')!
  await act(async () => updateButton().click())
  expect(checkpoint).toHaveBeenCalledOnce()
  expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(pwa.update.mock.invocationCallOrder[0])
  expect(container.textContent).toContain('Güncelleme uygulanamadı')
  expect(updateButton().disabled).toBe(false)
  await act(async () => updateButton().click())
  expect(pwa.update).toHaveBeenCalledTimes(2)
  expect(container.textContent).not.toContain('Güncelleme uygulanamadı')
})
