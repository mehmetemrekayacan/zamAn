import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Mode, ModeConfig, WorkBreakPhase, TimerSnapshot, TimerStatus } from '../types'

export const MODE_DEFAULTS: Record<Mode, ModeConfig> = {
  serbest: { mode: 'serbest' },
  gerisayim: { mode: 'gerisayim', sureMs: 40 * 60 * 1000 },
  ders60mola15: { mode: 'ders60mola15', calismaMs: 60 * 60 * 1000, molaMs: 15 * 60 * 1000 },
  deneme: {
    mode: 'deneme',
    bolumler: [
      { ad: 'AGS', surePlanMs: 110 * 60 * 1000 },
      { ad: 'ÖABT', surePlanMs: 90 * 60 * 1000 },
    ],
    currentSectionIndex: 0,
  },
}

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
      const nextPhase: WorkBreakPhase = isWork ? 'break' : 'work'
      const currentMola = state.molaToplamMs ?? 0
      const addMola = isWork ? 0 : elapsed
      const nextDersCycle = isWork ? (state.dersCycle ?? 0) + 1 : (state.dersCycle ?? 0)
      set({
        workBreakPhase: nextPhase,
        dersCycle: isWork ? nextDersCycle : state.dersCycle,
        molaToplamMs: currentMola + addMola,
        elapsedMs: 0,
        plannedMs: getPlannedMs(state.modeConfig, nextPhase, state.currentSectionIndex ?? 0),
        remainingMs: getPlannedMs(state.modeConfig, nextPhase, state.currentSectionIndex ?? 0),
        lastTickTs: now,
        status: 'running',
        running: true,
      })
      rafId = requestAnimationFrame(tick)
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
  getRemainingMs: () => number | undefined
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
      molaToplamMs: 0,
      denemeMolalarDakika: [],
      denemeBreakStartTs: null,
      pauses: 0,
      lastTickTs: null,

      setModeConfig: (config) => {
        stopRaf()
        const basePhase: WorkBreakPhase = config.mode === 'ders60mola15' ? 'work' : 'work'
        const sectionIdx = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : 0
        const plannedMs = getPlannedMs(config, basePhase, sectionIdx)
        const currentSectionIndex = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : undefined
        set({
          modeConfig: config,
          mode: config.mode,
          plannedMs,
          remainingMs: plannedMs,
          elapsedMs: 0,
          status: 'idle',
          running: false,
          pauses: 0,
          lastTickTs: null,
          currentSectionIndex,
          workBreakPhase: config.mode === 'ders60mola15' ? basePhase : undefined,
          dersCycle: config.mode === 'ders60mola15' ? 0 : undefined,
          molaToplamMs: config.mode === 'ders60mola15' ? 0 : undefined,
          denemeBreakStartTs: null,
        })
      },

      advanceFromDenemeBreak: () => {
        const state = get()
        if (state.modeConfig.mode !== 'deneme' || state.denemeBreakStartTs == null) return
        const breakMinutes = Math.round((performance.now() - state.denemeBreakStartTs) / 60000)
        const molalar = [...(state.denemeMolalarDakika ?? []), breakMinutes]
        const nextIdx = (state.currentSectionIndex ?? 0) + 1
        const plannedNext = getPlannedMs(state.modeConfig, 'work', nextIdx)
        const updatedConfig = { ...state.modeConfig, currentSectionIndex: nextIdx }
        const now = performance.now()
        set({
          modeConfig: updatedConfig,
          currentSectionIndex: nextIdx,
          denemeMolalarDakika: molalar,
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
        const cfg = config ?? get().modeConfig ?? MODE_DEFAULTS.serbest
        const basePhase: WorkBreakPhase = cfg.mode === 'ders60mola15' ? 'work' : 'work'
        const sectionIdx = cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : 0
        const plannedMs = getPlannedMs(cfg, basePhase, sectionIdx)
        stopRaf()
        const startTs = performance.now()
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
          workBreakPhase: cfg.mode === 'ders60mola15' ? basePhase : undefined,
          dersCycle: cfg.mode === 'ders60mola15' ? 0 : undefined,
          molaToplamMs: cfg.mode === 'ders60mola15' ? 0 : undefined,
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
        stopRaf()
        const cfg = get().modeConfig ?? MODE_DEFAULTS.serbest
        const basePhase: WorkBreakPhase = cfg.mode === 'ders60mola15' ? 'work' : 'work'
        const sectionIdx = cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : 0
        const plannedMs = getPlannedMs(cfg, basePhase, sectionIdx)
        set({
          status: 'idle',
          running: false,
          elapsedMs: 0,
          plannedMs,
          remainingMs: plannedMs,
          pauses: 0,
          lastTickTs: null,
          currentSectionIndex: cfg.mode === 'deneme' ? cfg.currentSectionIndex ?? 0 : undefined,
          workBreakPhase: cfg.mode === 'ders60mola15' ? basePhase : undefined,
          dersCycle: cfg.mode === 'ders60mola15' ? 0 : undefined,
          molaToplamMs: cfg.mode === 'ders60mola15' ? 0 : undefined,
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

      getRemainingMs: () => get().remainingMs,
    }),
    {
      name: 'timer-storage',
      partialize: (state) => ({
        modeConfig: state.modeConfig,
      }),
    }
  )
)
