/**
 * Timer store birim testleri: start/pause/reset, sekme görünür olunca senkron (tüm modlar)
 *
 * Web Worker refactor sonrası: performance.now() yerine Date.now() kullanılır.
 * Worker doğrudan test edilmez — store fonksiyonları syncOnVisibilityChange/syncTimer
 * üzerinden dolaylı olarak test edilir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTimerStore, MODE_DEFAULTS } from './timer'
import { getLocalDateString } from '../lib/time'

const DERS_MS = 60 * 60 * 1000
const MOLA_MS = 15 * 60 * 1000

describe('timer store', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(0)
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

      vi.mocked(Date.now).mockReturnValue(sureMs + 100)
      useTimerStore.getState().syncOnVisibilityChange()
      expect(useTimerStore.getState().status).toBe('finished')
      expect(useTimerStore.getState().remainingMs).toBe(0)
    })
  })

  describe('ders60mola15 — asenkron oturum geçişi (work → break)', () => {
    it('60 dk ders bitince status finished olur, arka planda mola başlar', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'ders60mola15',
        calismaMs: DERS_MS,
        molaMs: MOLA_MS,
      })
      useTimerStore.getState().start()

      expect(useTimerStore.getState().workBreakPhase).toBe('work')
      expect(useTimerStore.getState().status).toBe('running')
      expect(useTimerStore.getState().plannedMs).toBe(DERS_MS)

      // Çalışma süresi doluyor
      vi.mocked(Date.now).mockReturnValue(DERS_MS)
      useTimerStore.getState().syncOnVisibilityChange()

      // Action A: status='finished' → FinishScreen gösterilir
      expect(useTimerStore.getState().status).toBe('finished')
      expect(useTimerStore.getState().elapsedMs).toBe(DERS_MS)
      // Action B: Arka planda mola başladı
      expect(useTimerStore.getState().backgroundBreakStartTs).toBe(DERS_MS)
      expect(useTimerStore.getState().backgroundBreakPlannedMs).toBe(MOLA_MS)
    })

    it('transitionToBreak() ile arka plandaki molaya geçilir', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'ders60mola15',
        calismaMs: DERS_MS,
        molaMs: MOLA_MS,
      })
      useTimerStore.getState().start()

      // Ders bitiyor
      vi.mocked(Date.now).mockReturnValue(DERS_MS)
      useTimerStore.getState().syncOnVisibilityChange()

      // Kullanıcı 2 dakika kayıt ekranında kaldı
      const saveScreenTime = 2 * 60 * 1000
      vi.mocked(Date.now).mockReturnValue(DERS_MS + saveScreenTime)
      useTimerStore.getState().transitionToBreak()

      expect(useTimerStore.getState().workBreakPhase).toBe('break')
      expect(useTimerStore.getState().status).toBe('running')
      expect(useTimerStore.getState().plannedMs).toBe(MOLA_MS)
      // Kalan mola = 15dk - 2dk = 13dk
      expect(useTimerStore.getState().remainingMs).toBeCloseTo(MOLA_MS - saveScreenTime, -2)
    })

    it('mola sırasında pause() engellenir', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'ders60mola15',
        calismaMs: DERS_MS,
        molaMs: MOLA_MS,
      })
      useTimerStore.getState().start()

      vi.mocked(Date.now).mockReturnValue(DERS_MS)
      useTimerStore.getState().syncOnVisibilityChange()

      vi.mocked(Date.now).mockReturnValue(DERS_MS + 1000)
      useTimerStore.getState().transitionToBreak()

      // Break running — pause çağrılsa da status değişmemeli
      expect(useTimerStore.getState().workBreakPhase).toBe('break')
      expect(useTimerStore.getState().status).toBe('running')
      useTimerStore.getState().pause()
      expect(useTimerStore.getState().status).toBe('running')
    })

    it('finishBreakEarly() ile sonraki tura geçilir', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'ders60mola15',
        calismaMs: DERS_MS,
        molaMs: MOLA_MS,
      })
      useTimerStore.getState().start()

      vi.mocked(Date.now).mockReturnValue(DERS_MS)
      useTimerStore.getState().syncOnVisibilityChange()

      vi.mocked(Date.now).mockReturnValue(DERS_MS + 1000)
      useTimerStore.getState().transitionToBreak()

      vi.mocked(Date.now).mockReturnValue(DERS_MS + 5 * 60 * 1000)
      useTimerStore.getState().finishBreakEarly()

      expect(useTimerStore.getState().status).toBe('idle')
      expect(useTimerStore.getState().workBreakPhase).toBe('work')
      expect(useTimerStore.getState().plannedMs).toBe(DERS_MS)
    })

    it('start() aynı gün break fazını koruduğunda plannedMs mola süresi olur (regression)', () => {
      // getLocalDateString() ile aynı günün string'ini kullan
      const today = getLocalDateString()
      useTimerStore.getState().setModeConfig({
        mode: 'ders60mola15',
        calismaMs: DERS_MS,
        molaMs: MOLA_MS,
      })

      useTimerStore.setState({
        mode: 'ders60mola15',
        modeConfig: { mode: 'ders60mola15', calismaMs: DERS_MS, molaMs: MOLA_MS },
        workBreakPhase: 'break',
        dersCycleDate: today,
        dersCycle: 2,
        molaToplamMs: 30000,
      })

      useTimerStore.getState().start()
      const state = useTimerStore.getState()
      expect(state.status).toBe('running')
      expect(state.workBreakPhase).toBe('break')
      expect(state.plannedMs).toBe(MOLA_MS)
      expect(state.remainingMs).toBe(MOLA_MS)
    })

    it('finishBreakEarly() arka plan molasında planı aşan süreyi clamp eder (regression)', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'ders60mola15',
        calismaMs: DERS_MS,
        molaMs: MOLA_MS,
      })

      useTimerStore.setState({
        mode: 'ders60mola15',
        modeConfig: { mode: 'ders60mola15', calismaMs: DERS_MS, molaMs: MOLA_MS },
        status: 'finished',
        running: false,
        workBreakPhase: 'work',
        backgroundBreakStartTs: 0,
        backgroundBreakPlannedMs: MOLA_MS,
        molaToplamMs: 0,
        elapsedMs: 0,
      })

      vi.mocked(Date.now).mockReturnValue(MOLA_MS + 5 * 60 * 1000)
      useTimerStore.getState().finishBreakEarly()

      const state = useTimerStore.getState()
      expect(state.status).toBe('idle')
      expect(state.workBreakPhase).toBe('work')
      expect(state.molaToplamMs).toBe(MOLA_MS)
      expect(state.plannedMs).toBe(DERS_MS)
    })
  })

  describe('pause / resume', () => {
    it('pause sonrası status paused, running false', () => {
      useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 60000 })
      useTimerStore.getState().start()
      vi.mocked(Date.now).mockReturnValue(10000)
      useTimerStore.getState().pause()
      const state = useTimerStore.getState()
      expect(state.status).toBe('paused')
      expect(state.running).toBe(false)
      expect(state.lastTickTs).toBeNull()
      expect(state.elapsedMs).toBeGreaterThanOrEqual(0)
    })

    it('resume sonrası tekrar running', () => {
      useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 60000 })
      useTimerStore.getState().start()
      vi.mocked(Date.now).mockReturnValue(5000)
      useTimerStore.getState().pause()
      vi.mocked(Date.now).mockReturnValue(5000)
      useTimerStore.getState().resume()
      expect(useTimerStore.getState().status).toBe('running')
    })

    it('resume sırasında totalPauseDurationMs birikir, plannedMs değişmez', () => {
      const sureMs = 60000
      useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs })
      useTimerStore.getState().start()

      // 10sn çalış, duraklat
      vi.mocked(Date.now).mockReturnValue(10000)
      useTimerStore.getState().pause()

      // 5sn duraklat, devam et
      vi.mocked(Date.now).mockReturnValue(15000)
      useTimerStore.getState().resume()

      const state = useTimerStore.getState()
      expect(state.totalPauseDurationMs).toBe(5000)
      // plannedMs uzatılmamalı (eski bug düzeltildi)
      expect(state.plannedMs).toBe(sureMs)
    })
  })

  describe('deneme — regression', () => {
    it('bölüm bitişi sonrası advanceFromDenemeBreak ile sıradaki bölüme geçer ve mola süresini kaydeder', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Türkçe', surePlanMs: 10_000 },
          { ad: 'Matematik', surePlanMs: 20_000 },
        ],
        currentSectionIndex: 0,
      })
      useTimerStore.getState().start()

      vi.mocked(Date.now).mockReturnValue(10_000)
      useTimerStore.getState().syncOnVisibilityChange()

      let state = useTimerStore.getState()
      expect(state.status).toBe('paused')
      expect(state.denemeBreakStartTs).toBe(10_000)
      expect(state.currentSectionIndex).toBe(0)

      vi.mocked(Date.now).mockReturnValue(13_000)
      useTimerStore.getState().advanceFromDenemeBreak()

      state = useTimerStore.getState()
      expect(state.status).toBe('running')
      expect(state.currentSectionIndex).toBe(1)
      expect(state.plannedMs).toBe(20_000)
      expect(state.remainingMs).toBe(20_000)
      expect(state.denemeMolalarSaniye).toEqual([3])
      expect(state.denemeBreakStartTs).toBeNull()
    })

    it('setModeConfig deneme currentSectionIndex değerini sınırlar (index clamp)', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Türkçe', surePlanMs: 30_000 },
          { ad: 'Matematik', surePlanMs: 45_000 },
        ],
        currentSectionIndex: 999,
      })

      let state = useTimerStore.getState()
      expect(state.currentSectionIndex).toBe(1)
      expect(state.modeConfig.mode).toBe('deneme')
      if (state.modeConfig.mode === 'deneme') {
        expect(state.modeConfig.currentSectionIndex).toBe(1)
      }
      expect(state.plannedMs).toBe(45_000)

      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Fen', surePlanMs: 15_000 },
          { ad: 'Sosyal', surePlanMs: 25_000 },
        ],
        currentSectionIndex: -5,
      })

      state = useTimerStore.getState()
      expect(state.currentSectionIndex).toBe(0)
      expect(state.plannedMs).toBe(15_000)
    })

    it('deneme analitiği için denemeMolalarSaniye verisini bölüm geçişlerinde maplenebilir tutar', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Türkçe', surePlanMs: 5_000 },
          { ad: 'Matematik', surePlanMs: 7_000 },
        ],
        currentSectionIndex: 0,
      })
      useTimerStore.getState().start()

      vi.mocked(Date.now).mockReturnValue(5_000)
      useTimerStore.getState().syncOnVisibilityChange()
      vi.mocked(Date.now).mockReturnValue(9_000)
      useTimerStore.getState().advanceFromDenemeBreak()

      const state = useTimerStore.getState()
      expect(state.denemeMolalarSaniye).toEqual([4])
      expect(Array.isArray(state.denemeMolalarSaniye)).toBe(true)
    })
  })

  describe('deneme — overtime (uzatma)', () => {
    it('son bölüm bittiğinde otomatik bitmemeli — isOvertime = true olmalı', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Türkçe', surePlanMs: 10_000 },
        ],
        currentSectionIndex: 0,
      })
      useTimerStore.getState().start()

      // Süre doluyor
      vi.mocked(Date.now).mockReturnValue(10_000)
      useTimerStore.getState().syncOnVisibilityChange()

      const state = useTimerStore.getState()
      // status 'finished' olmamalı — overtime moduna geçmeli
      expect(state.status).toBe('running')
      expect(state.isOvertime).toBe(true)
      expect(state.remainingMs).toBe(0)
    })

    it('overtime sırasında elapsedMs artmaya devam etmeli', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Matematik', surePlanMs: 10_000 },
        ],
        currentSectionIndex: 0,
      })
      useTimerStore.getState().start()

      // Süre doluyor — overtime başlıyor
      vi.mocked(Date.now).mockReturnValue(10_000)
      useTimerStore.getState().syncOnVisibilityChange()
      expect(useTimerStore.getState().isOvertime).toBe(true)

      // 5 saniye fazla geçiyor
      vi.mocked(Date.now).mockReturnValue(15_000)
      useTimerStore.getState().syncOnVisibilityChange()

      const state = useTimerStore.getState()
      expect(state.elapsedMs).toBe(15_000) // plannedMs(10k) + overtime(5k)
      expect(state.remainingMs).toBe(0)
      expect(state.status).toBe('running')
    })

    it('overtime sırasında finishEarly çağrıldığında status finished olmalı', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Fen', surePlanMs: 10_000 },
        ],
        currentSectionIndex: 0,
      })
      useTimerStore.getState().start()

      vi.mocked(Date.now).mockReturnValue(10_000)
      useTimerStore.getState().syncOnVisibilityChange()
      expect(useTimerStore.getState().isOvertime).toBe(true)

      vi.mocked(Date.now).mockReturnValue(13_000)
      useTimerStore.getState().syncOnVisibilityChange()
      useTimerStore.getState().finishEarly()

      const state = useTimerStore.getState()
      expect(state.status).toBe('finished')
      expect(state.isOvertime).toBe(false)
      expect(state.wasEarlyFinish).toBe(false) // Overtime bitti = tam tamamlandı
      expect(state.elapsedMs).toBe(13_000) // Toplam süre
    })

    it('çok bölümlü denemede ara bölüm bittiğinde overtime değil mola olmalı', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Türkçe', surePlanMs: 10_000 },
          { ad: 'Matematik', surePlanMs: 20_000 },
        ],
        currentSectionIndex: 0,
      })
      useTimerStore.getState().start()

      vi.mocked(Date.now).mockReturnValue(10_000)
      useTimerStore.getState().syncOnVisibilityChange()

      const state = useTimerStore.getState()
      // Ara bölüm — mola ekranı, overtime değil
      expect(state.status).toBe('paused')
      expect(state.isOvertime).toBe(false)
      expect(state.denemeBreakStartTs).toBe(10_000)
    })

    it('overtime sırasında pause ve resume yapıldığında süre kaybolmamalı', () => {
      useTimerStore.getState().setModeConfig({
        mode: 'deneme',
        bolumler: [
          { ad: 'Fizik', surePlanMs: 10_000 },
        ],
        currentSectionIndex: 0,
      })
      useTimerStore.getState().start()

      // 1. Süre dolar ve overtime başlar (Date.now: 10_000, expected: 10_000)
      vi.mocked(Date.now).mockReturnValue(10_000)
      useTimerStore.getState().syncOnVisibilityChange()
      expect(useTimerStore.getState().isOvertime).toBe(true)

      // 2. 5 sn daha geçer (Date.now: 15_000, elapsed: 15_000) => Pause
      vi.mocked(Date.now).mockReturnValue(15_000)
      useTimerStore.getState().syncOnVisibilityChange()
      useTimerStore.getState().pause()
      
      expect(useTimerStore.getState().status).toBe('paused')
      expect(useTimerStore.getState().elapsedMs).toBe(15_000)

      // 3. 5 sn duraklatmada kalınır, sonra Resume (Date.now: 20_000, expectedEndTime 15_000 olmalı)
      vi.mocked(Date.now).mockReturnValue(20_000)
      useTimerStore.getState().resume()
      
      expect(useTimerStore.getState().status).toBe('running')
      expect(useTimerStore.getState().elapsedMs).toBe(15_000) // resume anında süre artmaz

      // 4. 2 sn daha çalışır (Date.now: 22_000)
      vi.mocked(Date.now).mockReturnValue(22_000)
      useTimerStore.getState().syncOnVisibilityChange()

      // Toplam süre: 15_000 (pause anında) + 2_000 = 17_000 olmalı
      expect(useTimerStore.getState().elapsedMs).toBe(17_000)
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
