// @vitest-environment jsdom
import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ModalDialog } from '../../components/ModalDialog'
import { SessionHistory } from '../../components/SessionHistory'
import { hasOpenDialog } from '../../lib/dialogStack'
import { changeDataScope } from '../../lib/dataScope'
import { runTimerShortcut } from '../../lib/timerControls'
import { useTimerStore } from '../../store/timer'
import { makeSession } from '../helpers/fixtures'

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
  expect(hasOpenDialog()).toBe(false)
})
async function key(key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, shiftKey, bubbles: true, cancelable: true })
  await act(async () => { (document.activeElement ?? window).dispatchEvent(event) })
  return event
}

it('odak pencereye geçer, Tab/Shift+Tab sınırları aşmaz ve kapanınca açana döner', async () => {
  function Example() {
    const [open, setOpen] = useState(false)
    return <><button onClick={() => setOpen(true)}>Aç</button>{open && <ModalDialog label="Test" onClose={() => setOpen(false)}>
      <input aria-label="İsim" /><button disabled>Kapalı</button><button hidden>Gizli</button><button>Son</button>
    </ModalDialog>}</>
  }
  await act(async () => root.render(<Example />))
  const opener = container.querySelector('button')!
  opener.focus()
  await act(async () => opener.click())
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!
  const input = panel.querySelector('input')!
  const last = panel.querySelectorAll('button')[2]
  expect(document.activeElement).toBe(panel)
  expect(container.hasAttribute('inert')).toBe(true)
  expect(document.body.style.overflow).toBe('hidden')
  await key('Tab')
  expect(document.activeElement).toBe(input)
  await key('Tab', true)
  expect(document.activeElement).toBe(last)
  await key('Tab')
  expect(document.activeElement).toBe(input)
  opener.focus() // Programatik odak kaçışı da geri alınır.
  expect(document.activeElement).toBe(panel)
  input.focus()
  await key('Escape') // Yazı alanı içinden de kapanır.
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(opener)
  expect(container.hasAttribute('inert')).toBe(false)
  expect(document.body.style.overflow).toBe('')
})

it('iç içe pencerede yalnızca üstteki kapanır; önceki inert ve kaydırma korunur', async () => {
  document.body.style.overflow = 'scroll'
  container.setAttribute('inert', '')
  function Example() {
    const [nested, setNested] = useState(false)
    return <ModalDialog label="Ana"><button onClick={() => setNested(true)}>İç pencere</button>
      {nested && <ModalDialog label="İç" onClose={() => setNested(false)}><button>Kapat</button></ModalDialog>}
    </ModalDialog>
  }
  await act(async () => root.render(<StrictMode><Example /></StrictMode>))
  const parent = document.querySelector<HTMLElement>('[aria-label="Ana"]')!
  const opener = parent.querySelector('button')!
  opener.focus()
  await act(async () => opener.click())
  expect(parent.closest('[data-modal-overlay]')?.hasAttribute('inert')).toBe(true)
  await key('Escape')
  expect(document.querySelector('[aria-label="İç"]')).toBeNull()
  expect(document.activeElement).toBe(opener)
  expect(hasOpenDialog()).toBe(true)
  await act(async () => root.render(null))
  expect(container.hasAttribute('inert')).toBe(true)
  expect(document.body.style.overflow).toBe('scroll')
  document.body.style.overflow = ''
})

it('işlem sürerken Escape ve arka plan tıklaması kapatmaz; sonra tek kez kapatır', async () => {
  const close = vi.fn()
  const render = (busy: boolean) => <ModalDialog label="Sil" onClose={close} busy={busy} closeOnBackdrop><button>İptal</button></ModalDialog>
  await act(async () => root.render(render(true)))
  await key('Escape')
  await act(async () => document.querySelector<HTMLElement>('[data-modal-overlay]')!.click())
  expect(close).not.toHaveBeenCalled()
  await act(async () => root.render(render(false)))
  await key('Escape')
  expect(close).toHaveBeenCalledOnce()
})

it('kurtarma gibi karar gerektiren pencereler Escape ile kararsız kapatılamaz', async () => {
  await act(async () => root.render(<ModalDialog label="Kurtarma"><button>Devam</button></ModalDialog>))
  expect((await key('Escape')).defaultPrevented).toBe(true)
  expect(document.querySelector('[aria-label="Kurtarma"]')).not.toBeNull()
})

it('ayrıntı ve ünvan pencereleri açıkken Electron sayaç komutları engellenir', async () => {
  changeDataScope(null)
  useTimerStore.getState().reset()
  await act(async () => root.render(<ModalDialog label="Ayrıntı"><button>Kapat</button></ModalDialog>))
  expect(runTimerShortcut('startStop')).toBe(false)
  expect(runTimerShortcut('reset')).toBe(false)
  await act(async () => root.render(null))
  expect(runTimerShortcut('startStop')).toBe(true)
  useTimerStore.getState().reset()
})

it('seans kartı Space ile açılır; Escape kapatır ve kartın odağı korunur', async () => {
  await act(async () => root.render(<SessionHistory sessions={[makeSession()]} />))
  const card = container.querySelector<HTMLElement>('[role="button"]')!
  card.focus()
  const space = await key(' ')
  expect(space.defaultPrevented).toBe(true)
  expect(document.querySelector('[aria-label="Seans ayrıntıları"]')).not.toBeNull()
  await key('Escape')
  expect(document.activeElement).toBe(card)
})
