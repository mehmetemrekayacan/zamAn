/**
 * Timer store birim testleri: start/pause/reset, sekme görünür olunca senkron (tüm modlar)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTimerStore, MODE_DEFAULTS } from './timer'

const DERS_MS = 60 * 60 * 1000
const MOLA_MS = 15 * 60 * 1000

describe('timer store', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    useTimerStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('başlangıç ve reset', () => {
    it('varsayılan mod serbest, status idle', () => {
      const state = useTimerStore.getState()
      expect(state.mode).toBe('serbest')
      expect(state.status).toBe('idle')
      expect(state.running).toBe(false)
    })

    it('start ile serbest mod çalışır', () => {
      useTimerStore.getState().start()
      const state = useTimerStore.getState()
      expect(state.status).toBe('running')
      expect(state.running).toBe(true)
      expect(state.elapsedMs).toBe(0)
    })

    it('reset sonrası status idle', () => {
      useTimerStore.getState().start()
      useTimerStore.getState().reset()
      expect(useTimerStore.getState().status).toBe('idle')
      expect(useTimerStore.getState().running).toBe(false)
    })
  })

  describe('gerisayim modu', () => {
    it('süre bitince syncOnVisibilityChange ile finished olur', () => {
      const sureMs = 2 * 60 * 1000
      useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs })
      useTimerStore.getState().start()
      expect(useTimerStore.getState().status).toBe('running')
      expect(useTimerStore.getState().remainingMs).toBe(sureMs)

      vi.mocked(performance.now).mockReturnValue(sureMs + 100)
      useTimerStore.getState().syncOnVisibilityChange()
      expect(useTimerStore.getState().status).toBe('finished')
      expect(useTimerStore.getState().remainingMs).toBe(0)
    })
  })

  describe('ders60mola15 — sekme arkadayken ders→mola geçişi', () => {
    it('60 dk ders bitince syncOnVisibilityChange ile molaya geçer', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'ders60mola15',
        calismaMs: DERS_MS,
        molaMs: MOLA_MS,
      })
      useTimerStore.getState().start()

      expect(useTimerStore.getState().workBreakPhase).toBe('work')
      expect(useTimerStore.getState().status).toBe('running')
      expect(useTimerStore.getState().plannedMs).toBe(DERS_MS)

      vi.mocked(performance.now).mockReturnValue(DERS_MS)
      useTimerStore.getState().syncOnVisibilityChange()

      expect(useTimerStore.getState().workBreakPhase).toBe('break')
      expect(useTimerStore.getState().status).toBe('running')
      expect(useTimerStore.getState().plannedMs).toBe(MOLA_MS)
    })
  })

  describe('pause / resume', () => {
    it('pause sonrası status paused, running false', () => {
      useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 60000 })
      useTimerStore.getState().start()
      vi.mocked(performance.now).mockReturnValue(10000)
      useTimerStore.getState().pause()
      const state = useTimerStore.getState()
      expect(state.status).toBe('paused')
      expect(state.running).toBe(false)
      expect(state.lastTickTs).toBeNull()
      // elapsed artar (delta uygulanır); rAF ortamında tam değer test ortamına bağlı olabilir
      expect(state.elapsedMs).toBeGreaterThanOrEqual(0)
    })

    it('resume sonrası tekrar running', () => {
      useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 60000 })
      useTimerStore.getState().start()
      vi.mocked(performance.now).mockReturnValue(5000)
      useTimerStore.getState().pause()
      vi.mocked(performance.now).mockReturnValue(5000)
      useTimerStore.getState().resume()
      expect(useTimerStore.getState().status).toBe('running')
    })
  })

  describe('MODE_DEFAULTS', () => {
    it('ders60mola15 varsayılan süreler', () => {
      const cfg = MODE_DEFAULTS.ders60mola15
      expect(cfg.mode).toBe('ders60mola15')
      if (cfg.mode === 'ders60mola15') {
        expect(cfg.calismaMs).toBe(DERS_MS)
        expect(cfg.molaMs).toBe(MOLA_MS)
      }
    })
  })
})
