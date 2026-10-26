// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModeConfig } from '../../types'

const counters = vi.hoisted(() => ({ dashboard: 0, clock: 0 }))
vi.mock('../../components/DashboardHeader', () => ({ DashboardHeader: () => { counters.dashboard++; return null } }))
vi.mock('../../components/TimerHero', async () => {
  const { useTimerStore } = await import('../../store/timer')
  return { TimerHero: () => { const elapsed = useTimerStore(s => s.elapsedMs); counters.clock++; return <span>{elapsed}</span> } }
})
vi.mock('../../components/UpdatePrompt', () => ({ UpdatePrompt: () => null }))
vi.mock('../../components/Toast', () => ({ Toast: () => null }))
vi.mock('../../components/TimerTitleAndTraySync', () => ({ TimerTitleAndTraySync: () => null }))
vi.mock('../../lib/notifications', () => ({ unlockAudio: vi.fn(), notifySessionComplete: vi.fn() }))
vi.mock('../../lib/offlineSync', () => ({ initOfflineSync: vi.fn(), processQueue: vi.fn(), getQueueItems: async () => [] }))

afterEach(() => { document.body.replaceChildren() })

const modes: ModeConfig[] = [
  { mode: 'serbest' }, { mode: 'gerisayim', sureMs: 120_000 },
  { mode: 'ders60mola15', calismaMs: 120_000, molaMs: 30_000 },
  { mode: 'deneme', bolumler: [{ ad: 'A', surePlanMs: 120_000 }] },
  { mode: 'EXAM_SIMULATOR', sureMs: 120_000, startTimeHHmm: '12:00' },
]

it.each(modes)('$mode: 60 saniye / 120 tick: ana ekran render ve depolama ölçümü', async config => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const { default: App } = await import('../../App')
  const { useTimerStore } = await import('../../store/timer')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-26T12:00:00+03:00'))
  try {
    await act(async () => { root.render(<App />) })
    // IndexedDB açılışı bitmeden ölçüme başlama.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
    await act(async () => { useTimerStore.getState().start(config) })
    const initialDashboard = counters.dashboard
    const initialClock = counters.clock
    const writes = vi.spyOn(localStorage, 'setItem')
    for (let tick = 1; tick <= 120; tick++) {
      clock.mockReturnValue(Date.parse('2026-10-26T12:00:00+03:00') + tick * 500)
      // Worker'ın sıradan tick'i; syncTimer yaşam döngüsü checkpoint'idir.
      await act(async () => { useTimerStore.getState().syncOnVisibilityChange() })
    }
    const result = {
      rootRenders: counters.dashboard - initialDashboard,
      clockRenders: counters.clock - initialClock,
      storageWrites: writes.mock.calls.filter(([key]) => key === 'timer-storage').length,
    }
    console.info('TIMER_PERFORMANCE', JSON.stringify({ mode: config.mode, ...result }))
    expect(useTimerStore.getState().elapsedMs).toBe(60_000)
    expect(result.rootRenders).toBe(0)
    expect(result.storageWrites).toBe(12)
    expect(result.clockRenders).toBe(120)
    clock.mockReturnValue(Date.parse('2026-10-26T12:00:00+03:00') + 60_500)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(JSON.parse(localStorage.getItem('timer-storage')!).state.elapsedMs).toBe(60_500)
    clock.mockReturnValue(Date.parse('2026-10-26T12:00:00+03:00') + 61_000)
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    expect(JSON.parse(localStorage.getItem('timer-storage')!).state.elapsedMs).toBe(61_000)
  } finally {
    await act(async () => { useTimerStore.getState().reset() })
    await act(async () => { root.unmount() })
  }
})
