// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { changeDataScope } from '../../lib/dataScope'
import * as cloud from '../../lib/cloudSync'
import { useSessionsStore } from '../../store/sessions'

vi.mock('../../lib/cloudSync', async original => ({
  ...await original<typeof import('../../lib/cloudSync')>(),
  isCloudSyncEnabled: () => true,
  getCurrentUser: vi.fn(async () => ({ id: 'ui-test-user', email: 'test@example.invalid', displayName: null })),
  checkSupabaseHealth: vi.fn(async () => ({ ok: true, message: '' })),
  pushCloud: vi.fn(), pullCloud: vi.fn(), syncCloud: vi.fn(),
}))
vi.mock('../../lib/offlineSync', async original => ({
  ...await original<typeof import('../../lib/offlineSync')>(), getUnownedQueueItems: async () => [],
}))
vi.mock('../../components/SyncConflictPanel', () => ({ SyncConflictPanel: () => null }))

let container: HTMLDivElement
let root: Root
let SettingsModal: typeof import('../../components/SettingsModal')['SettingsModal']
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('__APP_VERSION__', 'test')
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  SettingsModal = (await import('../../components/SettingsModal')).SettingsModal
  changeDataScope('ui-test-user')
  vi.spyOn(useSessionsStore.getState(), 'refreshSyncStatuses').mockResolvedValue(undefined)
  vi.mocked(cloud.pushCloud).mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<SettingsModal onClose={() => {}} />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
function button(text: string) {
  return [...container.querySelectorAll('button')].find(item => item.textContent === text)!
}

it('giriş yapılmış hesapta başarısız eşitlemeyi görünür kılar; yeniden denemede hatayı temizler', async () => {
  vi.mocked(cloud.pushCloud).mockResolvedValueOnce({ ok: false, error: 'Bağlantı kesildi' })
  await act(async () => button('⬆ Gönder').click())
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Bağlantı kesildi')
  expect(button('⬆ Gönder').disabled).toBe(false)
  vi.mocked(cloud.pushCloud).mockResolvedValueOnce({ ok: true, pushed: 2, pulled: 0, merged: 0, conflicts: 0 })
  await act(async () => button('⬆ Gönder').click())
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Gönderme tamamlandı: 2 seans')
  expect(container.textContent).not.toContain('Tüm verileriniz bulutla eşitlendi')
})

it('beklenmeyen eşitleme hatasında düğmeleri açar; çift tıklamayı tek isteğe indirir', async () => {
  let fail!: (error: Error) => void
  vi.mocked(cloud.pushCloud).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  await act(async () => { button('⬆ Gönder').click(); button('⬆ Gönder').click() })
  expect(cloud.pushCloud).toHaveBeenCalledOnce()
  await act(async () => fail(new Error('Beklenmeyen hata')))
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Beklenmeyen hata')
  expect(button('⬆ Gönder').disabled).toBe(false)
})

it('ayar anahtarları erişilebilir ada ve duruma sahiptir; desteklenmeyen bildirim açıklanır', async () => {
  const switches = container.querySelectorAll('[role="switch"]')
  expect(switches).toHaveLength(4)
  for (const control of switches) {
    expect(control.getAttribute('aria-label')).toBeTruthy()
    expect(['true', 'false']).toContain(control.getAttribute('aria-checked'))
  }
  vi.stubGlobal('Notification', undefined)
  // Özelliğin hiç bulunmadığı tarayıcı, tanımlı fakat undefined olandan farklıdır.
  const descriptor = Object.getOwnPropertyDescriptor(window, 'Notification')
  Reflect.deleteProperty(window, 'Notification')
  try {
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Tarayıcı bildirimi"]')!.click())
    expect(container.textContent).toContain('Bu tarayıcı bildirimleri desteklemiyor')
  } finally {
    if (descriptor) Object.defineProperty(window, 'Notification', descriptor)
  }
})
