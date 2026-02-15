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
      const addMola = isWork ? 0 : elapsed
      const nextDersCycle = isWork ? (state.dersCycle ?? 0) + 1 : (state.dersCycle ?? 0)
      const bugun = getLocalDateString()

      if (isWork) {
        set({
          workBreakPhase: 'break',
          dersCycle: nextDersCycle,
          dersCycleDate: bugun,
          molaToplamMs: currentMola,
          elapsedMs: 0,
          plannedMs: getPlannedMs(state.modeConfig, 'break', state.currentSectionIndex ?? 0),
          remainingMs: getPlannedMs(state.modeConfig, 'break', state.currentSectionIndex ?? 0),
          lastTickTs: now,
          status: 'running',
          running: true,
        })
        rafId = requestAnimationFrame(tick)
        return
      }

      const calismaMs = state.modeConfig.calismaMs ?? 60 * 60 * 1000
      const toplamElapsed = nextDersCycle * calismaMs + (currentMola + addMola)
      set({
        status: 'finished',
        running: false,
        elapsedMs: toplamElapsed,
        remainingMs: 0,
        lastTickTs: null,
        workBreakPhase: 'work',
        dersCycle: nextDersCycle,
        dersCycleDate: bugun,
        molaToplamMs: currentMola + addMola,
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

      setModeConfig: (config) => {
        stopRaf()
        const state = get()
        const bugun = getLocalDateString()
        const basePhase: WorkBreakPhase = config.mode === 'ders60mola15' ? 'work' : 'work'
        const sectionIdx = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : 0
        const plannedMs = getPlannedMs(config, basePhase, sectionIdx)
        const currentSectionIndex = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : undefined

        if (state.mode === 'ders60mola15' && state.modeConfig.mode === 'ders60mola15' && config.mode !== 'ders60mola15') {
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

        let workBreakPhase: WorkBreakPhase | undefined = config.mode === 'ders60mola15' ? basePhase : undefined
        let dersCycle: number | undefined = config.mode === 'ders60mola15' ? 0 : undefined
        let molaToplamMs: number | undefined = config.mode === 'ders60mola15' ? 0 : undefined
        let dersCycleDate: string | null = config.mode === 'ders60mola15' ? bugun : null
        let elapsedMs = 0
        let restoredPlannedMs = plannedMs
        let restoredRemainingMs = plannedMs
        let status: TimerStatus = 'idle'
        let restoredPauses = 0

        if (config.mode === 'ders60mola15') {
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
          modeConfig: config,
          mode: config.mode,
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
        if (config.mode === 'ders60mola15') {
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
        const basePhase: WorkBreakPhase = cfg.mode === 'ders60mola15' ? 'work' : 'work'
        const sectionIdx = cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : 0
        const plannedMs = getPlannedMs(cfg, basePhase, sectionIdx)
        stopRaf()
        const startTs = performance.now()

        let workBreakPhase: WorkBreakPhase | undefined = cfg.mode === 'ders60mola15' ? basePhase : undefined
        let dersCycle: number | undefined = cfg.mode === 'ders60mola15' ? 0 : undefined
        let molaToplamMs: number | undefined = cfg.mode === 'ders60mola15' ? 0 : undefined
        let dersCycleDate: string | null = cfg.mode === 'ders60mola15' ? getLocalDateString() : null

        if (cfg.mode === 'ders60mola15') {
          const bugun = getLocalDateString()
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
        })

        const tick = createTick(get as GetState, set)
        rafId = requestAnimationFrame(tick)
      },

      pause: () => {
        const state = get()
        if (state.status !== 'running') return
        stopRaf()
        const now = performance.now()
        const delta = state.lastTickTs ? now - state.lastTickTs : 0
        set({
          status: 'paused',
          running: false,
          elapsedMs: state.elapsedMs + delta,
          lastTickTs: null,
          pauses: state.pauses + 1,
          remainingMs: state.plannedMs != null ? Math.max(0, (state.plannedMs - state.elapsedMs - delta)) : undefined,
        })
      },

      resume: () => {
        const state = get()
        if (state.status !== 'paused') return
        const resumeTs = performance.now()
        set({ status: 'running', running: true, lastTickTs: resumeTs })

        const tick = createTick(get as GetState, set)
        rafId = requestAnimationFrame(tick)
      },

      reset: () => {
        const state = get()
        const cfg = state.modeConfig ?? MODE_DEFAULTS.serbest
        const basePhase: WorkBreakPhase = cfg.mode === 'ders60mola15' ? 'work' : 'work'
        const sectionIdx = cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : 0
        const plannedMs = getPlannedMs(cfg, basePhase, sectionIdx)
        const bugun = getLocalDateString()
        stopRaf()

        const isDers60Mola15 = cfg.mode === 'ders60mola15'
        /** Reset her zaman tur bilgisini sıfırlar; kayıt sonrası birikimli süre hatasını önler */
        set({
          status: 'idle',
          running: false,
          elapsedMs: 0,
          plannedMs,
          remainingMs: plannedMs,
          pauses: 0,
          lastTickTs: null,
          currentSectionIndex: cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : undefined,
          workBreakPhase: isDers60Mola15 ? basePhase : undefined,
          dersCycle: isDers60Mola15 ? 0 : undefined,
          dersCycleDate: isDers60Mola15 ? bugun : null,
          molaToplamMs: isDers60Mola15 ? 0 : undefined,
          denemeBreakStartTs: null,
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
        })
      },

      finishEarly: () => {
        const state = get()
        if (state.status !== 'running' && state.status !== 'paused') return
        stopRaf()
        const now = performance.now()
        const delta = state.lastTickTs ? now - state.lastTickTs : 0
        let finalElapsed = state.elapsedMs + (state.status === 'running' ? delta : 0)

        if (state.mode === 'ders60mola15' && state.modeConfig.mode === 'ders60mola15' && state.workBreakPhase === 'break') {
          const calismaMs = state.modeConfig.calismaMs ?? 60 * 60 * 1000
          finalElapsed = (state.dersCycle ?? 0) * calismaMs
        }

        set({
          status: 'finished',
          running: false,
          elapsedMs: finalElapsed,
          remainingMs: 0,
          lastTickTs: null,
        })
      },

      getRemainingMs: () => get().remainingMs,

      syncOnVisibilityChange: () => {
        const state = get()
        if (state.status !== 'running' || state.lastTickTs == null) return
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
      }),
    }
  )
)
