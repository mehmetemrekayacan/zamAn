// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DenemeManager } from '../../components/DenemeManager'
import { useSessionsStore } from '../../store/sessions'
import { makeSession } from '../helpers/fixtures'

it('1000 denemenin ilk liste çizim maliyeti', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  useSessionsStore.setState({ sessions: Array.from({ length: 1000 }, (_, index) => makeSession({
    id: String(index), mod: 'EXAM_SIMULATOR', tarihISO: new Date(Date.parse('2026-10-26T12:00:00Z') - index * 60_000).toISOString(),
  })) })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    const start = performance.now()
    await act(async () => { root.render(<DenemeManager onClose={() => {}} />) })
    const cards = [...container.querySelectorAll('button')].filter(button => button.textContent === 'Düzenle').length
    console.info('DENEME_PERFORMANCE', JSON.stringify({ total: 1000, mountedCards: cards, ms: +(performance.now() - start).toFixed(2) }))
    expect(cards).toBe(20)
    const next = [...container.querySelectorAll('button')].find(button => button.textContent === 'Sonraki')!
    await act(async () => { next.click() })
    expect(container.querySelector('nav')?.textContent).toContain('21–40 / 1000 deneme')
    const filter = container.querySelector('select')!
    await act(async () => { filter.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('nav')?.textContent).toContain('1–20 / 1000 deneme')
    // Son sayfa silme/bulut güncellemesi sonrasında geçerli sayfaya döner.
    await act(async () => { next.click() })
    await act(async () => { useSessionsStore.setState(state => ({ sessions: state.sessions.slice(0, 21) })) })
    expect(container.querySelector('nav')?.textContent).toContain('21–21 / 21 deneme')
    await act(async () => { useSessionsStore.setState(state => ({ sessions: state.sessions.slice(0, 20) })) })
    expect(container.querySelector('nav')).toBeNull()
    expect([...container.querySelectorAll('button')].filter(button => button.textContent === 'Düzenle')).toHaveLength(20)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
