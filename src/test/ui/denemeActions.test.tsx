// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DenemeManager } from '../../components/DenemeManager'
import { useSessionsStore } from '../../store/sessions'
import { makeSession } from '../helpers/fixtures'
import * as db from '../../lib/db'

let container: HTMLDivElement
let root: Root
const originalState = useSessionsStore.getState()
const update = vi.fn()
const remove = vi.fn()
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  update.mockReset()
  remove.mockReset()
  useSessionsStore.setState({ sessions: [makeSession({ mod: 'deneme' })], updateSession: update, deleteSession: remove })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<DenemeManager onClose={() => {}} />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useSessionsStore.setState(originalState, true)
})
function button(text: string, parent: ParentNode = document) {
  return [...parent.querySelectorAll('button')].find(item => item.textContent === text)!
}
async function changeInput(value: string) {
  const input = container.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('silme hatası pencereyi açık tutar; yeniden deneme bitene kadar çift istek göndermez', async () => {
  remove.mockRejectedValueOnce(new Error('Disk dolu'))
  await act(async () => button('Sil', container).click())
  const modal = () => document.querySelector('[role="alertdialog"]')!
  expect(document.activeElement).toBe(button('İptal', modal()))
  await act(async () => button('Sil', modal()).click())
  expect(modal().textContent).toContain('Disk dolu')
  let done!: () => void
  remove.mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve }))
  await act(async () => { button('Sil', modal()).click(); button('Sil', modal()).click() })
  expect(remove).toHaveBeenCalledTimes(2)
  expect(button('İptal', modal()).disabled).toBe(true)
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  expect(modal()).not.toBeNull()
  await act(async () => done())
  expect(document.querySelector('[role="alertdialog"]')).toBeNull()
})

it('düzenleme hatasında girilen sayılar korunur; başarılı yeniden denemede kapanır', async () => {
  update.mockRejectedValueOnce(new Error('Kayıt yazılamadı'))
  await act(async () => button('Düzenle').click())
  await changeInput('25')
  await act(async () => button('✓ Kaydet').click())
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Kayıt yazılamadı')
  expect(container.querySelector('input')?.value).toBe('25')
  update.mockResolvedValueOnce(undefined)
  await act(async () => button('✓ Kaydet').click())
  expect(update.mock.calls[1][0].dogruSayisi).toBe(25)
  expect(container.querySelector('input')).toBeNull()
})

it.each(['-1', '1.5', '1000'])('geçersiz analiz sayısını kaydetmez: %s', async value => {
  await act(async () => button('Düzenle').click())
  await changeInput(value)
  await act(async () => button('✓ Kaydet').click())
  expect(update).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('tam sayı')
})

it('store silme başarısızlığını çağırana iletir ve listeden kayıt çıkarmaz', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(db, 'deleteSession').mockRejectedValueOnce(new Error('DB hatası'))
  await expect(originalState.deleteSession('test-session')).rejects.toThrow('DB hatası')
  expect(useSessionsStore.getState().sessions).toHaveLength(1)
})
