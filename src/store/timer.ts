import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getLocalDateString } from '../lib/time'
import type { Mode, ModeConfig, Section, WorkBreakPhase, TimerSnapshot, TimerStatus } from '../types'

// Test için: 10 sn ders, 5 sn mola (normal: 60*60*1000, 15*60*1000)
// ders60mola15: 60 dakika ders, 15 dakika mola


const DERS_MS = 60 * 60 * 1000
const MOLA_MS = 15 * 60 * 1000

const DERS60_PAUSE_STORAGE_KEY = 'zaman-ders60-pause-state'

export const MODE_DEFAULTS: Record<Mode, ModeConfig> = {
  serbest: { mode: 'serbest' },
  gerisayim: { mode: 'gerisayim', sureMs: 40 * 60 * 1000 },
  ders60mola15: { mode: 'ders60mola15', calismaMs: DERS_MS, molaMs: MOLA_MS },
  deneme: {
    mode: 'deneme',
    bolumler: [
      { ad: 'AGS', surePlanMs: 110 * 60 * 1000 },
      { ad: 'ÖABT', surePlanMs: 90 * 60 * 1000 },
    ],
    currentSectionIndex: 0,
  },
}

/** Deneme şablonları — iki ana başlık: KPSS (Genel Yetenek 60 + Genel Kültür 60), ÖABT+AGS. */
export const DENEME_TEMPLATES: { id: string; label: string; bolumler: Section[] }[] = [
  {
    id: 'kpss',
    label: 'KPSS',
    bolumler: [
      { ad: 'Genel Yetenek', surePlanMs: 60 * 60 * 1000 },
      { ad: 'Genel Kültür', surePlanMs: 60 * 60 * 1000 },
    ],
  },
  {
    id: 'oabt-ags',
    label: 'ÖABT + AGS',
    bolumler: [
      { ad: 'AGS', surePlanMs: 110 * 60 * 1000 },
      { ad: 'ÖABT', surePlanMs: 90 * 60 * 1000 },
    ],
  },
]

const getPlannedMs = (config: ModeConfig, phase: WorkBreakPhase = 'work', currentSectionIndex = 0): number | undefined => {
  switch (config.mode) {
    case 'gerisayim':
      return config.sureMs
    case 'serbest':
      return undefined
    case 'ders60mola15':
      return phase === 'work' ? config.calismaMs : config.molaMs
    case 'deneme': {
      return config.bolumler[currentSectionIndex]?.surePlanMs
    }
    default:
      return undefined
  }
}

function deriveDers6015PhaseAndPlan(
  config: ModeConfig,
  state: { modeConfig?: ModeConfig; workBreakPhase?: WorkBreakPhase; dersCycleDate?: string | null; currentSectionIndex?: number },
  today: string,
  forcedPhase?: WorkBreakPhase,
): { phase: WorkBreakPhase; plannedMs: number | undefined } {
  const isDersMode = config.mode === 'ders60mola15'
  const phase: WorkBreakPhase = forcedPhase
    ?? (isDersMode && state.dersCycleDate === today && state.modeConfig?.mode === 'ders60mola15'
      ? (state.workBreakPhase ?? 'work')
      : 'work')

  return {
    phase,
    plannedMs: getPlannedMs(config, phase, state.currentSectionIndex ?? 0),
  }
}

let rafId: number | null = null

const stopRaf = () => {
  if (rafId != null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

type GetState = () => TimerSnapshot & { modeConfig: ModeConfig }
type SetState = (partial: Partial<TimerSnapshot & { modeConfig: ModeConfig }>) => void

function createTick(get: GetState, set: SetState): () => void {
  return function tick() {
    const state = get()
    if (state.status !== 'running' || state.lastTickTs == null) return
    const now = performance.now()
    const delta = now - state.lastTickTs
    const elapsed = state.elapsedMs + delta
    const remaining = state.plannedMs != null ? Math.max(0, state.plannedMs - elapsed) : undefined
    const finished = state.plannedMs != null && remaining === 0

    if (finished && state.mode === 'deneme' && state.modeConfig.mode === 'deneme') {
      const nextIdx = (state.currentSectionIndex ?? 0) + 1
      if (state.modeConfig.bolumler[nextIdx]) {
        set({
          status: 'paused',
          running: false,
          elapsedMs: state.plannedMs ?? elapsed,
          remainingMs: 0,
          lastTickTs: null,
          denemeBreakStartTs: now,
        })
        stopRaf()
        return
      }
    }

    if (finished && state.mode === 'ders60mola15' && state.modeConfig.mode === 'ders60mola15') {
      const phase = state.workBreakPhase ?? 'work'
      const isWork = phase === 'work'
      const currentMola = state.molaToplamMs ?? 0
      const nextDersCycle = isWork ? (state.dersCycle ?? 0) + 1 : (state.dersCycle ?? 0)
      const bugun = getLocalDateString()
      const molaMs = getPlannedMs(state.modeConfig, 'break', state.currentSectionIndex ?? 0) ?? MOLA_MS

      if (isWork) {
        /*
         * Asenkron Oturum Geçişi (Work → Break):
         *
         * Action A (Foreground): status='finished' → FinishScreen/Kayıt ekranı gösterilir
         * Action B (Background): backgroundBreakStartTs kaydedilir → 15dk mola
         *   arka planda saymaya başlar. Kullanıcı kayıt ekranındayken
         *   mola süresi de ilerler.
         *
         * elapsedMs: hedef çalışma süresi (net work time, pause dahil değil)
         */
        const netWorkMs = state.modeConfig.calismaMs ?? DERS_MS
        set({
          status: 'finished',
          running: false,
          elapsedMs: netWorkMs,
          remainingMs: 0,
          lastTickTs: null,
          wasEarlyFinish: false,
          workBreakPhase: 'work',
          dersCycle: nextDersCycle,
          dersCycleDate: bugun,
          molaToplamMs: currentMola,
          backgroundBreakStartTs: now,
          backgroundBreakPlannedMs: molaMs,
        })
        stopRaf()
        return
      }

      /*
       * Mola bitti → Sonraki tura hazırlan (FinishScreen YOK).
       * Mola süresi "çalışma" metriklerine eklenmez — ayrı bir state.
       */
      set({
        status: 'idle',
        running: false,
        elapsedMs: 0,
        plannedMs: getPlannedMs(state.modeConfig, 'work', state.currentSectionIndex ?? 0),
        remainingMs: getPlannedMs(state.modeConfig, 'work', state.currentSectionIndex ?? 0),
        lastTickTs: null,
        workBreakPhase: 'work',
        dersCycle: nextDersCycle,
        dersCycleDate: bugun,
        molaToplamMs: currentMola + elapsed,
        totalPauseDurationMs: 0,
        pauses: 0,
        pauseStartTs: null,
        wasEarlyFinish: undefined,
        backgroundBreakStartTs: null,
        backgroundBreakPlannedMs: undefined,
      })
      stopRaf()
      return
    }

    set({
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: now,
      status: finished ? ('finished' as TimerStatus) : state.status,
      running: !finished,
      ...(finished ? { wasEarlyFinish: false } : {}),
    })

    if (!finished) {
      rafId = requestAnimationFrame(tick)
    } else {
      stopRaf()
    }
  }
}

export type TimerState = TimerSnapshot & {
  modeConfig: ModeConfig
  start: (config?: ModeConfig) => void
  pause: () => void
  resume: () => void
  reset: () => void
  setModeConfig: (config: ModeConfig) => void
  jumpToSection: (index: number) => void
  /** Deneme modunda bölüm arası moladan sonraki bölüme geçer, mola süresini kaydeder */
  advanceFromDenemeBreak: () => void
  /** Herhangi bir vakitte erken bitir; o ana kadar geçen süreyi kaydetmek için status'u finished yapar */
  finishEarly: () => void
  getRemainingMs: () => number | undefined
  /** Sekme tekrar görünür olduğunda çağrılır; tüm modlarda (gerisayim, 60/15, deneme, serbest) arkadayken kaçan tick'leri yakalar */
  syncOnVisibilityChange: () => void
  /** ders60mola15: FinishScreen kapatıldıktan sonra arka plandaki molaya geçiş yapar */
  transitionToBreak: () => void
  /** ders60mola15: Mola sırasında erken bitirip sonraki tura geçer */
  finishBreakEarly: () => void
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      running: false,
      status: 'idle',
      elapsedMs: 0,
      plannedMs: undefined,
      remainingMs: undefined,
      mode: MODE_DEFAULTS.serbest.mode,
      modeConfig: MODE_DEFAULTS.serbest,
      currentSectionIndex: 0,
      workBreakPhase: 'work',
      dersCycle: 0,
      dersCycleDate: null,
      molaToplamMs: 0,
      denemeMolalarSaniye: [],
      denemeBreakStartTs: null,
      pauses: 0,
      lastTickTs: null,
      pauseStartTs: null,
      wasEarlyFinish: undefined,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,

      setModeConfig: (config) => {
        stopRaf()
        const state = get()
        const bugun = getLocalDateString()
        const denemeRawIdx = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : 0
        const sectionIdx = config.mode === 'deneme'
          ? Math.max(0, Math.min(denemeRawIdx, Math.max(0, config.bolumler.length - 1)))
          : 0
        const normalizedConfig: ModeConfig = config.mode === 'deneme'
          ? { ...config, currentSectionIndex: sectionIdx }
          : config
        const plannedMs = getPlannedMs(normalizedConfig, 'work', sectionIdx)
        const currentSectionIndex = normalizedConfig.mode === 'deneme' ? sectionIdx : undefined

        if (state.mode === 'ders60mola15' && state.modeConfig.mode === 'ders60mola15' && normalizedConfig.mode !== 'ders60mola15') {
          if ((state.status === 'paused' || state.status === 'running') && state.dersCycleDate === bugun) {
            try {
              localStorage.setItem(DERS60_PAUSE_STORAGE_KEY, JSON.stringify({
                elapsedMs: state.elapsedMs,
                remainingMs: state.remainingMs,
                plannedMs: state.plannedMs,
                workBreakPhase: state.workBreakPhase ?? 'work',
                status: state.status,
                pauses: state.pauses,
                dersCycle: state.dersCycle ?? 0,
                molaToplamMs: state.molaToplamMs ?? 0,
                savedAt: bugun,
              }))
            } catch { /* ignore */ }
          }
        }

        let workBreakPhase: WorkBreakPhase | undefined = normalizedConfig.mode === 'ders60mola15' ? 'work' : undefined
        let dersCycle: number | undefined = normalizedConfig.mode === 'ders60mola15' ? 0 : undefined
        let molaToplamMs: number | undefined = normalizedConfig.mode === 'ders60mola15' ? 0 : undefined
        let dersCycleDate: string | null = normalizedConfig.mode === 'ders60mola15' ? bugun : null
        let elapsedMs = 0
        let restoredPlannedMs = plannedMs
        let restoredRemainingMs = plannedMs
        let status: TimerStatus = 'idle'
        let restoredPauses = 0

        if (normalizedConfig.mode === 'ders60mola15') {
          if (state.dersCycleDate === bugun) {
            workBreakPhase = state.workBreakPhase ?? 'work'
            dersCycle = state.dersCycle ?? 0
            molaToplamMs = state.molaToplamMs ?? 0
            dersCycleDate = bugun
          }
          try {
            const saved = localStorage.getItem(DERS60_PAUSE_STORAGE_KEY)
            if (saved) {
              const parsed = JSON.parse(saved) as { elapsedMs?: number; remainingMs?: number; plannedMs?: number; workBreakPhase?: WorkBreakPhase; status?: TimerStatus; pauses?: number; dersCycle?: number; molaToplamMs?: number; savedAt?: string }
              if (parsed.savedAt === bugun && parsed.elapsedMs != null && parsed.plannedMs != null) {
                elapsedMs = parsed.elapsedMs
                restoredPlannedMs = parsed.plannedMs
                restoredRemainingMs = parsed.remainingMs ?? Math.max(0, parsed.plannedMs - parsed.elapsedMs)
                workBreakPhase = (parsed.workBreakPhase ?? 'work') as WorkBreakPhase
                status = (parsed.status === 'paused' ? 'paused' : 'idle') as TimerStatus
                restoredPauses = parsed.pauses ?? 0
                dersCycle = parsed.dersCycle ?? dersCycle ?? 0
                molaToplamMs = parsed.molaToplamMs ?? molaToplamMs ?? 0
                dersCycleDate = bugun
                localStorage.removeItem(DERS60_PAUSE_STORAGE_KEY)
              }
            }
          } catch { /* ignore */ }
        }

        const updates: Partial<TimerSnapshot & { modeConfig: ModeConfig }> = {
          modeConfig: normalizedConfig,
          mode: normalizedConfig.mode,
          plannedMs: elapsedMs > 0 ? restoredPlannedMs : plannedMs,
          remainingMs: elapsedMs > 0 ? restoredRemainingMs : plannedMs,
          elapsedMs,
          status,
          running: false,
          pauses: elapsedMs > 0 ? restoredPauses : 0,
          lastTickTs: null,
          currentSectionIndex,
          denemeBreakStartTs: null,
        }
        if (normalizedConfig.mode === 'ders60mola15') {
          updates.workBreakPhase = workBreakPhase
          updates.dersCycle = dersCycle
          updates.molaToplamMs = molaToplamMs
          updates.dersCycleDate = dersCycleDate
        }
        set(updates)
      },

      advanceFromDenemeBreak: () => {
        const state = get()
        if (state.modeConfig.mode !== 'deneme' || state.denemeBreakStartTs == null) return
        const breakSeconds = Math.round((performance.now() - state.denemeBreakStartTs) / 1000)
        const molalar = [...(state.denemeMolalarSaniye ?? []), breakSeconds]
        const nextIdx = (state.currentSectionIndex ?? 0) + 1
        const plannedNext = getPlannedMs(state.modeConfig, 'work', nextIdx)
        const updatedConfig = { ...state.modeConfig, currentSectionIndex: nextIdx }
        const now = performance.now()
        set({
          modeConfig: updatedConfig,
          currentSectionIndex: nextIdx,
          denemeMolalarSaniye: molalar,
          denemeBreakStartTs: null,
          elapsedMs: 0,
          plannedMs: plannedNext,
          remainingMs: plannedNext,
          lastTickTs: now,
          status: 'running',
          running: true,
        })
        const tick = createTick(get as GetState, set)
        rafId = requestAnimationFrame(tick)
      },

      start: (config) => {
        const state = get()
        const cfg = config ?? state.modeConfig ?? MODE_DEFAULTS.serbest
        const bugun = getLocalDateString()
        const sectionIdx = cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : 0
        const { phase: derivedPhase, plannedMs } = deriveDers6015PhaseAndPlan(cfg, {
          modeConfig: state.modeConfig,
          workBreakPhase: state.workBreakPhase,
          dersCycleDate: state.dersCycleDate,
          currentSectionIndex: sectionIdx,
        }, bugun)
        stopRaf()
        const startTs = performance.now()

        let workBreakPhase: WorkBreakPhase | undefined = cfg.mode === 'ders60mola15' ? derivedPhase : undefined
        let dersCycle: number | undefined = cfg.mode === 'ders60mola15' ? 0 : undefined
        let molaToplamMs: number | undefined = cfg.mode === 'ders60mola15' ? 0 : undefined
        let dersCycleDate: string | null = cfg.mode === 'ders60mola15' ? bugun : null

        if (cfg.mode === 'ders60mola15') {
          if (state.dersCycleDate === bugun && state.modeConfig.mode === 'ders60mola15') {
            workBreakPhase = state.workBreakPhase ?? 'work'
            dersCycle = state.dersCycle ?? 0
            molaToplamMs = state.molaToplamMs ?? 0
            dersCycleDate = bugun
          }
        }

        set({
          modeConfig: cfg,
          mode: cfg.mode,
          plannedMs,
          remainingMs: plannedMs,
          elapsedMs: 0,
          status: 'running',
          running: true,
          pauses: 0,
          lastTickTs: startTs,
          currentSectionIndex: cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : undefined,
          workBreakPhase,
          dersCycle,
          molaToplamMs,
          dersCycleDate,
          denemeBreakStartTs: null,
          wasEarlyFinish: undefined,
          totalPauseDurationMs: 0,
          backgroundBreakStartTs: null,
          backgroundBreakPlannedMs: undefined,
        })

        const tick = createTick(get as GetState, set)
        rafId = requestAnimationFrame(tick)
      },

      pause: () => {
        const state = get()
        if (state.status !== 'running') return
        // Hard Limit: Mola sırasında DURAKLAT butonu devre dışı
        if (state.mode === 'ders60mola15' && state.workBreakPhase === 'break') return
        stopRaf()
        const now = performance.now()
        const delta = state.lastTickTs ? now - state.lastTickTs : 0
        set({
          status: 'paused',
          running: false,
          elapsedMs: state.elapsedMs + delta,
          lastTickTs: null,
          pauses: state.pauses + 1,
          pauseStartTs: now,
          remainingMs: state.plannedMs != null ? Math.max(0, (state.plannedMs - state.elapsedMs - delta)) : undefined,
        })
      },

      resume: () => {
        const state = get()
        if (state.status !== 'paused') return
        const resumeTs = performance.now()
        const pauseStartTs = state.pauseStartTs ?? resumeTs
        const pauseDurationMs = resumeTs - pauseStartTs

        /*
         * BUG FIX: Önceki kod plannedMs/remainingMs'i pause süresi kadar uzatıyordu.
         * Bu, kullanıcının fazladan çalışma yapmasına neden oluyordu.
         *
         * Wall-Clock vs Net-Time mantığı:
         * - elapsedMs: sadece NET çalışma süresi (pause sırasında donmuş kalır)
         * - remainingMs = plannedMs - elapsedMs → countdown doğru kalır
         * - totalPauseDurationMs: birikmiş tüm duraklama süreleri (final rapor için)
         *
         * Örnek: 45dk çalış → 15dk duraklat → 15dk çalış
         *   Net çalışma = 60dk, Toplam süre = 75dk, Duraklama = 15dk
         */
        const newTotalPause = (state.totalPauseDurationMs ?? 0) + pauseDurationMs

        set({
          status: 'running',
          running: true,
          lastTickTs: resumeTs,
          pauseStartTs: null,
          totalPauseDurationMs: newTotalPause,
        })

        const tick = createTick(get as GetState, set)
        rafId = requestAnimationFrame(tick)
      },

      reset: () => {
        const state = get()
        const cfg = state.modeConfig ?? MODE_DEFAULTS.serbest
        const sectionIdx = cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : 0
        const plannedMs = getPlannedMs(cfg, 'work', sectionIdx)
        const bugun = getLocalDateString()
        stopRaf()

        const isDers60Mola15 = cfg.mode === 'ders60mola15'
        /** Reset: ders60mola15 modunda aynı gündeki dersCycle'\u0131 koru, gün değişmişse sıfırla */
        const preservedDersCycle = isDers60Mola15 && state.dersCycleDate === bugun
          ? (state.dersCycle ?? 0) : 0
        set({
          status: 'idle',
          running: false,
          elapsedMs: 0,
          plannedMs,
          remainingMs: plannedMs,
          pauses: 0,
          lastTickTs: null,
          currentSectionIndex: cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : undefined,
          workBreakPhase: isDers60Mola15 ? 'work' : undefined,
          dersCycle: isDers60Mola15 ? preservedDersCycle : undefined,
          dersCycleDate: isDers60Mola15 ? bugun : null,
          molaToplamMs: isDers60Mola15 ? 0 : undefined,
          denemeMolalarSaniye: [],
          denemeBreakStartTs: null,
          pauseStartTs: null,
          wasEarlyFinish: undefined,
          totalPauseDurationMs: 0,
          backgroundBreakStartTs: null,
          backgroundBreakPlannedMs: undefined,
        })
      },

      jumpToSection: (index) => {
        const state = get()
        if (state.modeConfig.mode !== 'deneme') return
        const clamped = Math.max(0, Math.min(index, state.modeConfig.bolumler.length - 1))
        const updatedConfig = { ...state.modeConfig, currentSectionIndex: clamped }
        const plannedMs = getPlannedMs(updatedConfig)
        stopRaf()
        set({
          modeConfig: updatedConfig,
          mode: 'deneme',
          currentSectionIndex: clamped,
          status: 'idle',
          running: false,
          elapsedMs: 0,
          plannedMs,
          remainingMs: plannedMs,
          lastTickTs: null,
          pauses: 0,
          denemeBreakStartTs: null,
        })
      },

      finishEarly: () => {
        const state = get()
        if (state.status !== 'running' && state.status !== 'paused') return
        stopRaf()
        const now = performance.now()
        const delta = state.lastTickTs ? now - state.lastTickTs : 0
        let finalElapsed = state.elapsedMs + (state.status === 'running' ? delta : 0)

        // Eğer paused durumdaysa, son pause süresini de totalPauseDurationMs'e ekle
        let totalPause = state.totalPauseDurationMs ?? 0
        if (state.status === 'paused' && state.pauseStartTs) {
          totalPause += now - state.pauseStartTs
        }

        if (state.mode === 'ders60mola15' && state.modeConfig.mode === 'ders60mola15') {
          if (state.workBreakPhase === 'break') {
            // Mola fazında erken bitir → sonraki tura geç (finishBreakEarly ile aynı)
            const bugun = getLocalDateString()
            set({
              status: 'idle',
              running: false,
              elapsedMs: 0,
              plannedMs: getPlannedMs(state.modeConfig, 'work', state.currentSectionIndex ?? 0),
              remainingMs: getPlannedMs(state.modeConfig, 'work', state.currentSectionIndex ?? 0),
              lastTickTs: null,
              workBreakPhase: 'work',
              totalPauseDurationMs: 0,
              pauses: 0,
              pauseStartTs: null,
              wasEarlyFinish: undefined,
              backgroundBreakStartTs: null,
              backgroundBreakPlannedMs: undefined,
              molaToplamMs: (state.molaToplamMs ?? 0) + finalElapsed,
              dersCycleDate: bugun,
            })
            return
          }
          // Çalışma fazında erken bitir: sadece kısmi çalışma süresi
          // Arka plan molası BAŞLAMAZ (erken bitirildi, doğal tamamlama değil)
        }

        set({
          status: 'finished',
          running: false,
          elapsedMs: finalElapsed,
          remainingMs: 0,
          lastTickTs: null,
          wasEarlyFinish: true,
          totalPauseDurationMs: totalPause,
        })
      },

      getRemainingMs: () => get().remainingMs,

      /**
       * ders60mola15: FinishScreen kapatıldıktan sonra arka plandaki molaya geçiş.
       *
       * Arka plandaki mola (backgroundBreakStartTs) sürerken kullanıcı kayıt ekranını
       * kapattığında çağrılır. Kalan mola süresini hesaplayıp gerçek break countdown başlatır.
       * Eğer mola zaten bitmiş ise direkt sonraki tura (idle/work) geçer.
       */
      transitionToBreak: () => {
        const state = get()
        if (state.backgroundBreakStartTs == null || state.backgroundBreakPlannedMs == null) return

        const now = performance.now()
        const breakElapsed = now - state.backgroundBreakStartTs
        const breakRemaining = Math.max(0, state.backgroundBreakPlannedMs - breakElapsed)
        const bugun = getLocalDateString()

        if (breakRemaining <= 0) {
          const { plannedMs: nextWorkPlannedMs } = deriveDers6015PhaseAndPlan(
            state.modeConfig,
            state,
            bugun,
            'work',
          )
          // Mola zaten bitmiş — direkt sonraki çalışma turuna geç
          set({
            status: 'idle',
            running: false,
            elapsedMs: 0,
            plannedMs: nextWorkPlannedMs,
            remainingMs: nextWorkPlannedMs,
            lastTickTs: null,
            workBreakPhase: 'work',
            backgroundBreakStartTs: null,
            backgroundBreakPlannedMs: undefined,
            totalPauseDurationMs: 0,
            pauseStartTs: null,
            pauses: 0,
            molaToplamMs: (state.molaToplamMs ?? 0) + (state.backgroundBreakPlannedMs ?? 0),
            dersCycleDate: bugun,
          })
          return
        }

        // Mola hâlâ devam ediyor — kalan süreyle break countdown başlat
        stopRaf()
        set({
          workBreakPhase: 'break',
          status: 'running',
          running: true,
          elapsedMs: breakElapsed,
          plannedMs: state.backgroundBreakPlannedMs,
          remainingMs: breakRemaining,
          lastTickTs: now,
          backgroundBreakStartTs: null,
          backgroundBreakPlannedMs: undefined,
          totalPauseDurationMs: 0,
          pauseStartTs: null,
          pauses: 0,
        })

        const tick = createTick(get as GetState, set)
        rafId = requestAnimationFrame(tick)
      },

      /**
       * ders60mola15: Mola sırasında "Molayı Bitir / Sonraki Tur" butonu.
       * Break state'i keser ve sonraki çalışma turunu idle olarak hazırlar.
       * Mola süresi çalışma metriklerine DAHİL EDİLMEZ.
       */
      finishBreakEarly: () => {
        const state = get()
        if (state.mode !== 'ders60mola15') return
        if (state.workBreakPhase !== 'break' && state.backgroundBreakStartTs == null) return

        stopRaf()
        const bugun = getLocalDateString()
        const { plannedMs: nextWorkPlannedMs } = deriveDers6015PhaseAndPlan(
          state.modeConfig,
          state,
          bugun,
          'work',
        )
        const currentElapsed = state.elapsedMs ?? 0
        const rawBreak = state.backgroundBreakStartTs != null
          ? performance.now() - state.backgroundBreakStartTs
          : currentElapsed
        const plannedBreak = state.backgroundBreakPlannedMs
          ?? (state.modeConfig.mode === 'ders60mola15' ? state.modeConfig.molaMs : MOLA_MS)
        const breakMola = Math.max(0, Math.min(rawBreak, plannedBreak))

        set({
          status: 'idle',
          running: false,
          elapsedMs: 0,
          plannedMs: nextWorkPlannedMs,
          remainingMs: nextWorkPlannedMs,
          lastTickTs: null,
          workBreakPhase: 'work',
          totalPauseDurationMs: 0,
          pauses: 0,
          pauseStartTs: null,
          wasEarlyFinish: undefined,
          backgroundBreakStartTs: null,
          backgroundBreakPlannedMs: undefined,
          molaToplamMs: (state.molaToplamMs ?? 0) + breakMola,
          dersCycleDate: bugun,
        })
      },

      syncOnVisibilityChange: () => {
        const state = get()
        if (state.status !== 'running' || state.lastTickTs == null) return
        stopRaf()
        const tick = createTick(get as GetState, set)
        tick()
      },
    }),
    {
      name: 'timer-storage',
      partialize: (state) => ({
        modeConfig: state.modeConfig,
        dersCycle: state.dersCycle,
        dersCycleDate: state.dersCycleDate,
        workBreakPhase: state.workBreakPhase,
        molaToplamMs: state.molaToplamMs,
        totalPauseDurationMs: state.totalPauseDurationMs,
      }),
    }
  )
)
