import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Mode, ModeConfig, PomodoroPhase, TimerSnapshot, TimerStatus } from '../types'

export const MODE_DEFAULTS: Record<Mode, ModeConfig> = {
  serbest: { mode: 'serbest' },
  gerisayim: { mode: 'gerisayim', sureMs: 40 * 60 * 1000 },
  pomodoro: { mode: 'pomodoro', calismaMs: 25 * 60 * 1000, dinlenmeMs: 5 * 60 * 1000, dongu: 4 },
  deneme: {
    mode: 'deneme',
    bolumler: [
      { ad: 'Türkçe', surePlanMs: 40 * 60 * 1000 },
      { ad: 'Matematik', surePlanMs: 60 * 60 * 1000 },
      { ad: 'Fen', surePlanMs: 40 * 60 * 1000 },
    ],
    currentSectionIndex: 0,
  },
}

const getPlannedMs = (config: ModeConfig, phase: PomodoroPhase = 'work', currentSectionIndex = 0): number | undefined => {
  switch (config.mode) {
    case 'gerisayim':
      return config.sureMs
    case 'serbest':
      return undefined
    case 'pomodoro':
      return phase === 'work' ? config.calismaMs : config.dinlenmeMs
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
        const plannedNext = getPlannedMs(state.modeConfig, 'work', nextIdx)
        const updatedConfig = { ...state.modeConfig, currentSectionIndex: nextIdx }
        set({
          modeConfig: updatedConfig,
          currentSectionIndex: nextIdx,
          elapsedMs: 0,
          plannedMs: plannedNext,
          remainingMs: plannedNext,
          lastTickTs: now,
          status: 'running',
          running: true,
        })
        rafId = requestAnimationFrame(tick)
        return
      }
    }

    if (finished && state.mode === 'pomodoro' && state.modeConfig.mode === 'pomodoro') {
      const phase = state.pomodoroPhase ?? 'work'
      const cycle = state.pomodoroCycle ?? 0
      const isWork = phase === 'work'
      const nextPhase: PomodoroPhase = isWork ? 'break' : 'work'
      const nextCycle = isWork ? cycle : cycle + 1
      const hasMore = nextCycle < state.modeConfig.dongu || nextPhase === 'break'

      if (hasMore && !(nextPhase === 'work' && nextCycle >= state.modeConfig.dongu)) {
        const plannedNext = getPlannedMs(state.modeConfig, nextPhase, state.currentSectionIndex ?? 0)
        set({
          pomodoroPhase: nextPhase,
          pomodoroCycle: nextCycle,
          elapsedMs: 0,
          plannedMs: plannedNext,
          remainingMs: plannedNext,
          lastTickTs: now,
          status: 'running',
          running: true,
        })
        rafId = requestAnimationFrame(tick)
        return
      }
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
      pomodoroPhase: 'work',
      pomodoroCycle: 0,
      pauses: 0,
      lastTickTs: null,

      setModeConfig: (config) => {
    stopRaf()
    const basePhase: PomodoroPhase = config.mode === 'pomodoro' ? 'work' : 'work'
    const baseCycle = 0
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
      pomodoroPhase: config.mode === 'pomodoro' ? basePhase : undefined,
      pomodoroCycle: config.mode === 'pomodoro' ? baseCycle : undefined,
    })
  },

  start: (config) => {
    const cfg = config ?? get().modeConfig ?? MODE_DEFAULTS.serbest
    const basePhase: PomodoroPhase = cfg.mode === 'pomodoro' ? 'work' : 'work'
    const baseCycle = 0
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
      pomodoroPhase: cfg.mode === 'pomodoro' ? basePhase : undefined,
      pomodoroCycle: cfg.mode === 'pomodoro' ? baseCycle : undefined,
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
    const basePhase: PomodoroPhase = cfg.mode === 'pomodoro' ? 'work' : 'work'
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
      pomodoroPhase: cfg.mode === 'pomodoro' ? basePhase : undefined,
      pomodoroCycle: cfg.mode === 'pomodoro' ? 0 : undefined,
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
