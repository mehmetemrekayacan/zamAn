import type { ModeConfig, TimerSnapshot, WorkBreakPhase } from '../types'
import { getLocalDateString } from './time'
import { notifyOvertimeStarted } from './notifications'

const DERS_MS = 60 * 60 * 1000
const MOLA_MS = 15 * 60 * 1000

type TimerStateWithConfig = TimerSnapshot & { modeConfig: ModeConfig }

export interface TimerModeStrategy {
  getPlannedMs(config: ModeConfig, phase?: WorkBreakPhase, currentSectionIndex?: number): number | undefined
  onStart(config: ModeConfig, state: TimerStateWithConfig, today: string, pomodoroRound: number): Partial<TimerSnapshot>
  onTick(now: number, state: TimerStateWithConfig): Partial<TimerSnapshot> & { finished: boolean }
  canPause(state: TimerStateWithConfig): boolean
  onPause(now: number, state: TimerStateWithConfig): Partial<TimerSnapshot>
  onResume(now: number, state: TimerStateWithConfig, pauseDurationMs: number): Partial<TimerSnapshot>
  onReset(state: TimerStateWithConfig, today: string, pomodoroRound: number): Partial<TimerSnapshot>
  onFinishEarly(
    now: number,
    state: TimerStateWithConfig,
    totalPause: number,
    finalElapsed: number,
    today: string,
    pomodoroRound: number
  ): Partial<TimerSnapshot> & { customTransitionHandled?: boolean }
}

// ----------------------------------------------------
// 1. FREE MODE STRATEGY (serbest)
// ----------------------------------------------------
export const FreeTimerStrategy: TimerModeStrategy = {
  getPlannedMs() {
    return undefined
  },
  onStart(_config, _state) {
    const now = Date.now()
    return {
      plannedMs: undefined,
      remainingMs: undefined,
      elapsedMs: 0,
      status: 'running',
      running: true,
      pauses: 0,
      lastTickTs: now,
      expectedEndTime: undefined,
      startWallTime: now,
      currentSectionIndex: undefined,
      denemeBreakStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onTick(now, state) {
    const elapsed = state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
    return {
      elapsedMs: elapsed,
      lastTickTs: now,
      finished: false,
    }
  },
  canPause() {
    return true
  },
  onPause(now, state) {
    const elapsed = state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
    return {
      status: 'paused',
      running: false,
      elapsedMs: elapsed,
      remainingMs: undefined,
      lastTickTs: null,
      expectedEndTime: undefined,
      pauses: state.pauses + 1,
      pauseStartTs: now,
    }
  },
  onResume(now, state, pauseDurationMs) {
    const newStartWallTime = state.startWallTime != null
      ? state.startWallTime + pauseDurationMs
      : now
    return {
      status: 'running',
      running: true,
      lastTickTs: now,
      pauseStartTs: null,
      totalPauseDurationMs: (state.totalPauseDurationMs ?? 0) + pauseDurationMs,
      expectedEndTime: undefined,
      startWallTime: newStartWallTime,
    }
  },
  onReset() {
    return {
      status: 'idle',
      running: false,
      elapsedMs: 0,
      plannedMs: undefined,
      remainingMs: undefined,
      pauses: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      currentSectionIndex: undefined,
      workBreakPhase: undefined,
      dersCycle: undefined,
      dersCycleDate: null,
      molaToplamMs: undefined,
      denemeMolalarSaniye: [],
      denemeBreakStartTs: null,
      pauseStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onFinishEarly(_now, _state, totalPause, finalElapsed) {
    return {
      status: 'finished',
      running: false,
      elapsedMs: finalElapsed,
      remainingMs: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      wasEarlyFinish: false,
      isOvertime: false,
      totalPauseDurationMs: totalPause,
    }
  },
}

// ----------------------------------------------------
// 2. COUNTDOWN MODE STRATEGY (gerisayim)
// ----------------------------------------------------
export const CountdownTimerStrategy: TimerModeStrategy = {
  getPlannedMs(config) {
    return config.mode === 'gerisayim' ? config.sureMs : undefined
  },
  onStart(config, _state) {
    const plannedMs = config.mode === 'gerisayim' ? config.sureMs : undefined
    const now = Date.now()
    return {
      plannedMs,
      remainingMs: plannedMs,
      elapsedMs: 0,
      status: 'running',
      running: true,
      pauses: 0,
      lastTickTs: now,
      expectedEndTime: plannedMs != null ? now + plannedMs : undefined,
      startWallTime: now,
      currentSectionIndex: undefined,
      denemeBreakStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onTick(now, state) {
    if (state.plannedMs == null || state.expectedEndTime == null) {
      return { finished: false }
    }

    const remaining = Math.max(0, state.expectedEndTime - now)
    const elapsed = state.plannedMs - remaining
    const finished = remaining === 0

    if (finished) {
      if (!state.isOvertime) {
        notifyOvertimeStarted()
        return {
          isOvertime: true,
          elapsedMs: elapsed,
          remainingMs: 0,
          finished: false,
        }
      }
      const overtimeExtra = now - state.expectedEndTime
      const totalElapsed = state.plannedMs + Math.max(0, overtimeExtra)
      return {
        elapsedMs: totalElapsed,
        remainingMs: 0,
        lastTickTs: now,
        finished: false,
      }
    }

    return {
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: now,
      status: 'running',
      running: true,
      finished: false,
    }
  },
  canPause() {
    return true
  },
  onPause(now, state) {
    let elapsed: number
    let remaining: number | undefined

    if (state.isOvertime) {
      elapsed = state.elapsedMs
      remaining = 0
    } else if (state.plannedMs != null && state.expectedEndTime != null) {
      remaining = Math.max(0, state.expectedEndTime - now)
      elapsed = state.plannedMs - remaining
    } else {
      elapsed = state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
      remaining = undefined
    }

    return {
      status: 'paused',
      running: false,
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: null,
      expectedEndTime: state.isOvertime ? state.expectedEndTime : undefined,
      pauses: state.pauses + 1,
      pauseStartTs: now,
    }
  },
  onResume(now, state, pauseDurationMs) {
    let newExpectedEndTime: number | undefined
    if (state.isOvertime && state.expectedEndTime != null) {
      newExpectedEndTime = state.expectedEndTime + pauseDurationMs
    } else {
      newExpectedEndTime = state.remainingMs != null ? now + state.remainingMs : undefined
    }

    const newStartWallTime = state.startWallTime != null
      ? state.startWallTime + pauseDurationMs
      : now

    return {
      status: 'running',
      running: true,
      lastTickTs: now,
      pauseStartTs: null,
      totalPauseDurationMs: (state.totalPauseDurationMs ?? 0) + pauseDurationMs,
      expectedEndTime: newExpectedEndTime,
      startWallTime: newStartWallTime,
    }
  },
  onReset(state) {
    const plannedMs = state.modeConfig.mode === 'gerisayim' ? state.modeConfig.sureMs : undefined
    return {
      status: 'idle',
      running: false,
      elapsedMs: 0,
      plannedMs,
      remainingMs: plannedMs,
      pauses: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      currentSectionIndex: undefined,
      workBreakPhase: undefined,
      dersCycle: undefined,
      dersCycleDate: null,
      molaToplamMs: undefined,
      denemeMolalarSaniye: [],
      denemeBreakStartTs: null,
      pauseStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onFinishEarly(_now, state, totalPause, finalElapsed) {
    return {
      status: 'finished',
      running: false,
      elapsedMs: finalElapsed,
      remainingMs: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      wasEarlyFinish: !state.isOvertime,
      isOvertime: false,
      totalPauseDurationMs: totalPause,
    }
  },
}

// ----------------------------------------------------
// 3. POMODORO 60/15 STRATEGY (ders60mola15)
// ----------------------------------------------------
export const PomodoroTimerStrategy: TimerModeStrategy = {
  getPlannedMs(config, phase = 'work') {
    if (config.mode !== 'ders60mola15') return undefined
    return phase === 'work' ? config.calismaMs : config.molaMs
  },
  onStart(config, state, today, pomodoroRound) {
    const isDers60 = config.mode === 'ders60mola15'
    const phase: WorkBreakPhase = isDers60 && state.dersCycleDate === today && state.modeConfig?.mode === 'ders60mola15'
      ? (state.workBreakPhase ?? 'work')
      : 'work'

    const plannedMs = isDers60 ? (phase === 'work' ? config.calismaMs : config.molaMs) : undefined
    const now = Date.now()

    let workBreakPhase: WorkBreakPhase | undefined = isDers60 ? phase : undefined
    let dersCycle: number | undefined = isDers60 ? Math.max(0, pomodoroRound - 1) : undefined
    let molaToplamMs: number | undefined = isDers60 ? 0 : undefined
    let dersCycleDate: string | null = isDers60 ? today : null

    if (isDers60 && state.dersCycleDate === today && state.modeConfig.mode === 'ders60mola15') {
      workBreakPhase = state.workBreakPhase ?? 'work'
      dersCycle = state.dersCycle ?? 0
      molaToplamMs = state.molaToplamMs ?? 0
      dersCycleDate = today
    }

    return {
      plannedMs,
      remainingMs: plannedMs,
      elapsedMs: 0,
      status: 'running',
      running: true,
      pauses: 0,
      lastTickTs: now,
      expectedEndTime: plannedMs != null ? now + plannedMs : undefined,
      startWallTime: now,
      currentSectionIndex: undefined,
      workBreakPhase,
      dersCycle,
      molaToplamMs,
      dersCycleDate,
      denemeBreakStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onTick(now, state) {
    if (state.plannedMs == null || state.expectedEndTime == null) {
      return { finished: false }
    }

    const remaining = Math.max(0, state.expectedEndTime - now)
    const elapsed = state.plannedMs - remaining
    const finished = remaining === 0

    if (finished) {
      const phase = state.workBreakPhase ?? 'work'
      const isWork = phase === 'work'
      const currentMola = state.molaToplamMs ?? 0
      const bugun = getLocalDateString()

      if (isWork) {
        if (!state.isOvertime) {
          notifyOvertimeStarted()
          return {
            isOvertime: true,
            elapsedMs: elapsed,
            remainingMs: 0,
            finished: false,
          }
        }
        const overtimeExtra = now - state.expectedEndTime
        const totalElapsed = state.plannedMs + Math.max(0, overtimeExtra)
        return {
          elapsedMs: totalElapsed,
          remainingMs: 0,
          lastTickTs: now,
          finished: false,
        }
      }

      // Mola bitti -> sonraki tura hazırlan
      const nextWorkPlannedMs = state.modeConfig.mode === 'ders60mola15' ? state.modeConfig.calismaMs : DERS_MS
      return {
        status: 'idle',
        running: false,
        elapsedMs: 0,
        plannedMs: nextWorkPlannedMs,
        remainingMs: nextWorkPlannedMs,
        lastTickTs: null,
        expectedEndTime: undefined,
        startWallTime: undefined,
        workBreakPhase: 'work',
        dersCycleDate: bugun,
        molaToplamMs: currentMola + elapsed,
        totalPauseDurationMs: 0,
        pauses: 0,
        pauseStartTs: null,
        wasEarlyFinish: undefined,
        backgroundBreakStartTs: null,
        backgroundBreakPlannedMs: undefined,
        finished: true,
      }
    }

    // Overtime sırasında her tikte elapsed'i artır
    if (state.isOvertime && state.workBreakPhase === 'work') {
      const overtimeExtra = now - state.expectedEndTime
      const totalElapsed = state.plannedMs + Math.max(0, overtimeExtra)
      return {
        elapsedMs: totalElapsed,
        remainingMs: 0,
        lastTickTs: now,
        finished: false,
      }
    }

    return {
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: now,
      status: 'running',
      running: true,
      finished: false,
    }
  },
  canPause(state) {
    // Hard Limit: Mola sırasında DURAKLAT butonu devre dışı
    return state.workBreakPhase !== 'break'
  },
  onPause(now, state) {
    let elapsed: number
    let remaining: number | undefined

    if (state.isOvertime) {
      elapsed = state.elapsedMs
      remaining = 0
    } else if (state.plannedMs != null && state.expectedEndTime != null) {
      remaining = Math.max(0, state.expectedEndTime - now)
      elapsed = state.plannedMs - remaining
    } else {
      elapsed = state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
      remaining = undefined
    }

    return {
      status: 'paused',
      running: false,
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: null,
      expectedEndTime: state.isOvertime ? state.expectedEndTime : undefined,
      pauses: state.pauses + 1,
      pauseStartTs: now,
    }
  },
  onResume(now, state, pauseDurationMs) {
    let newExpectedEndTime: number | undefined
    if (state.isOvertime && state.expectedEndTime != null) {
      newExpectedEndTime = state.expectedEndTime + pauseDurationMs
    } else {
      newExpectedEndTime = state.remainingMs != null ? now + state.remainingMs : undefined
    }

    const newStartWallTime = state.startWallTime != null
      ? state.startWallTime + pauseDurationMs
      : now

    return {
      status: 'running',
      running: true,
      lastTickTs: now,
      pauseStartTs: null,
      totalPauseDurationMs: (state.totalPauseDurationMs ?? 0) + pauseDurationMs,
      expectedEndTime: newExpectedEndTime,
      startWallTime: newStartWallTime,
    }
  },
  onReset(state, today, pomodoroRound) {
    const config = state.modeConfig
    const isDers60 = config.mode === 'ders60mola15'
    const plannedMs = isDers60 ? config.calismaMs : DERS_MS
    const preservedDersCycle = isDers60 && state.dersCycleDate === today
      ? (state.dersCycle ?? Math.max(0, pomodoroRound - 1))
      : Math.max(0, pomodoroRound - 1)

    return {
      status: 'idle',
      running: false,
      elapsedMs: 0,
      plannedMs,
      remainingMs: plannedMs,
      pauses: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      currentSectionIndex: undefined,
      workBreakPhase: 'work',
      dersCycle: preservedDersCycle,
      dersCycleDate: today,
      molaToplamMs: 0,
      denemeMolalarSaniye: [],
      denemeBreakStartTs: null,
      pauseStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onFinishEarly(_now, state, totalPause, finalElapsed, today, pomodoroRound) {
    const config = state.modeConfig
    const isDers60 = config.mode === 'ders60mola15'

    if (state.workBreakPhase === 'break') {
      // Mola fazında erken bitir -> sonraki tura geç
      const nextWorkPlannedMs = isDers60 ? config.calismaMs : DERS_MS
      return {
        status: 'idle',
        running: false,
        elapsedMs: 0,
        plannedMs: nextWorkPlannedMs,
        remainingMs: nextWorkPlannedMs,
        lastTickTs: null,
        expectedEndTime: undefined,
        startWallTime: undefined,
        workBreakPhase: 'work',
        totalPauseDurationMs: 0,
        pauses: 0,
        pauseStartTs: null,
        wasEarlyFinish: undefined,
        backgroundBreakStartTs: null,
        backgroundBreakPlannedMs: undefined,
        molaToplamMs: (state.molaToplamMs ?? 0) + finalElapsed,
        dersCycleDate: today,
        customTransitionHandled: true,
      }
    }

    if (state.workBreakPhase === 'work' && state.isOvertime) {
      // Çalışma overtime'da bitti -> mola fazına geçişi tetikle
      const nextRound = pomodoroRound + 1
      const molaMs = isDers60 ? config.molaMs : MOLA_MS
      return {
        status: 'finished',
        running: false,
        elapsedMs: finalElapsed,
        remainingMs: 0,
        lastTickTs: null,
        expectedEndTime: undefined,
        startWallTime: undefined,
        wasEarlyFinish: false,
        isOvertime: false,
        totalPauseDurationMs: totalPause,
        workBreakPhase: 'work',
        dersCycle: Math.max(0, nextRound - 1),
        dersCycleDate: today,
        pomodoroRound: nextRound,
        lastPomodoroDate: today,
        molaToplamMs: state.molaToplamMs ?? 0,
        backgroundBreakStartTs: Date.now(),
        backgroundBreakPlannedMs: molaMs,
        customTransitionHandled: true,
      }
    }

    return {
      status: 'finished',
      running: false,
      elapsedMs: finalElapsed,
      remainingMs: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      wasEarlyFinish: !state.isOvertime,
      isOvertime: false,
      totalPauseDurationMs: totalPause,
    }
  },
}

// ----------------------------------------------------
// 4. DENEME MODE STRATEGY (deneme)
// ----------------------------------------------------
export const DenemeTimerStrategy: TimerModeStrategy = {
  getPlannedMs(config, _phase, currentSectionIndex = 0) {
    if (config.mode !== 'deneme') return undefined
    return config.bolumler[currentSectionIndex]?.surePlanMs
  },
  onStart(config, _state, _today, _pomodoroRound) {
    const sectionIdx = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : 0
    const plannedMs = config.mode === 'deneme' ? config.bolumler[sectionIdx]?.surePlanMs : undefined
    const now = Date.now()
    return {
      plannedMs,
      remainingMs: plannedMs,
      elapsedMs: 0,
      status: 'running',
      running: true,
      pauses: 0,
      lastTickTs: now,
      expectedEndTime: plannedMs != null ? now + plannedMs : undefined,
      startWallTime: now,
      currentSectionIndex: sectionIdx,
      denemeBreakStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onTick(now, state) {
    if (state.plannedMs == null || state.expectedEndTime == null) {
      return { finished: false }
    }

    const remaining = Math.max(0, state.expectedEndTime - now)
    const elapsed = state.plannedMs - remaining
    const finished = remaining === 0

    if (finished) {
      if (!state.isOvertime) {
        notifyOvertimeStarted()
        return {
          isOvertime: true,
          elapsedMs: elapsed,
          remainingMs: 0,
          finished: false,
        }
      }
      // Overtime ticking
      const overtimeExtra = now - state.expectedEndTime
      const totalElapsed = state.plannedMs + Math.max(0, overtimeExtra)
      return {
        elapsedMs: totalElapsed,
        remainingMs: 0,
        lastTickTs: now,
        finished: false,
      }
    }

    return {
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: now,
      status: 'running',
      running: true,
      finished: false,
    }
  },
  canPause() {
    return true
  },
  onPause(now, state) {
    let elapsed: number
    let remaining: number | undefined

    if (state.isOvertime) {
      elapsed = state.elapsedMs
      remaining = 0
    } else if (state.plannedMs != null && state.expectedEndTime != null) {
      remaining = Math.max(0, state.expectedEndTime - now)
      elapsed = state.plannedMs - remaining
    } else {
      elapsed = state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
      remaining = undefined
    }

    return {
      status: 'paused',
      running: false,
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: null,
      expectedEndTime: state.isOvertime ? state.expectedEndTime : undefined,
      pauses: state.pauses + 1,
      pauseStartTs: now,
    }
  },
  onResume(now, state, pauseDurationMs) {
    let newExpectedEndTime: number | undefined
    if (state.isOvertime && state.expectedEndTime != null) {
      newExpectedEndTime = state.expectedEndTime + pauseDurationMs
    } else {
      newExpectedEndTime = state.remainingMs != null ? now + state.remainingMs : undefined
    }

    const newStartWallTime = state.startWallTime != null
      ? state.startWallTime + pauseDurationMs
      : now

    return {
      status: 'running',
      running: true,
      lastTickTs: now,
      pauseStartTs: null,
      totalPauseDurationMs: (state.totalPauseDurationMs ?? 0) + pauseDurationMs,
      expectedEndTime: newExpectedEndTime,
      startWallTime: newStartWallTime,
    }
  },
  onReset(state) {
    const config = state.modeConfig
    const sectionIdx = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : 0
    const plannedMs = config.mode === 'deneme' ? config.bolumler[sectionIdx]?.surePlanMs : undefined
    return {
      status: 'idle',
      running: false,
      elapsedMs: 0,
      plannedMs,
      remainingMs: plannedMs,
      pauses: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      currentSectionIndex: sectionIdx,
      workBreakPhase: undefined,
      dersCycle: undefined,
      dersCycleDate: null,
      molaToplamMs: undefined,
      denemeMolalarSaniye: [],
      denemeBreakStartTs: null,
      pauseStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onFinishEarly(_now, state, totalPause, finalElapsed) {
    return {
      status: 'finished',
      running: false,
      elapsedMs: finalElapsed,
      remainingMs: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      wasEarlyFinish: !state.isOvertime,
      isOvertime: false,
      totalPauseDurationMs: totalPause,
    }
  },
}

// ----------------------------------------------------
// 5. EXAM SIMULATOR MODE STRATEGY (EXAM_SIMULATOR)
// ----------------------------------------------------
export const ExamSimulatorTimerStrategy: TimerModeStrategy = {
  getPlannedMs(config) {
    return config.mode === 'EXAM_SIMULATOR' ? config.sureMs : undefined
  },
  onStart(config, _state) {
    const plannedMs = config.mode === 'EXAM_SIMULATOR' ? config.sureMs : undefined
    const now = Date.now()
    return {
      plannedMs,
      remainingMs: plannedMs,
      elapsedMs: 0,
      status: 'running',
      running: true,
      pauses: 0,
      lastTickTs: now,
      expectedEndTime: plannedMs != null ? now + plannedMs : undefined,
      startWallTime: now,
      currentSectionIndex: undefined,
      denemeBreakStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onTick(now, state) {
    if (state.plannedMs == null || state.expectedEndTime == null) {
      return { finished: false }
    }

    const remaining = Math.max(0, state.expectedEndTime - now)
    const elapsed = state.plannedMs - remaining
    const finished = remaining === 0

    return {
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: now,
      status: finished ? 'finished' : state.status,
      running: !finished,
      finished,
      ...(finished ? { wasEarlyFinish: false, expectedEndTime: undefined, startWallTime: undefined } : {}),
    }
  },
  canPause() {
    return true
  },
  onPause(now, state) {
    let elapsed: number
    let remaining: number | undefined

    if (state.plannedMs != null && state.expectedEndTime != null) {
      remaining = Math.max(0, state.expectedEndTime - now)
      elapsed = state.plannedMs - remaining
    } else {
      elapsed = state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
      remaining = undefined
    }

    return {
      status: 'paused',
      running: false,
      elapsedMs: elapsed,
      remainingMs: remaining,
      lastTickTs: null,
      expectedEndTime: undefined,
      pauses: state.pauses + 1,
      pauseStartTs: now,
    }
  },
  onResume(now, state, pauseDurationMs) {
    const newExpectedEndTime = state.remainingMs != null ? now + state.remainingMs : undefined
    const newStartWallTime = state.startWallTime != null
      ? state.startWallTime + pauseDurationMs
      : now

    return {
      status: 'running',
      running: true,
      lastTickTs: now,
      pauseStartTs: null,
      totalPauseDurationMs: (state.totalPauseDurationMs ?? 0) + pauseDurationMs,
      expectedEndTime: newExpectedEndTime,
      startWallTime: newStartWallTime,
    }
  },
  onReset(state) {
    const plannedMs = state.modeConfig.mode === 'EXAM_SIMULATOR' ? state.modeConfig.sureMs : undefined
    return {
      status: 'idle',
      running: false,
      elapsedMs: 0,
      plannedMs,
      remainingMs: plannedMs,
      pauses: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      currentSectionIndex: undefined,
      workBreakPhase: undefined,
      dersCycle: undefined,
      dersCycleDate: null,
      molaToplamMs: undefined,
      denemeMolalarSaniye: [],
      denemeBreakStartTs: null,
      pauseStartTs: null,
      wasEarlyFinish: undefined,
      isOvertime: false,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
    }
  },
  onFinishEarly(_now, state, totalPause, finalElapsed) {
    return {
      status: 'finished',
      running: false,
      elapsedMs: finalElapsed,
      remainingMs: 0,
      lastTickTs: null,
      expectedEndTime: undefined,
      startWallTime: undefined,
      wasEarlyFinish: !state.isOvertime,
      isOvertime: false,
      totalPauseDurationMs: totalPause,
    }
  },
}

export const TIMER_STRATEGIES: Record<string, TimerModeStrategy> = {
  serbest: FreeTimerStrategy,
  gerisayim: CountdownTimerStrategy,
  ders60mola15: PomodoroTimerStrategy,
  deneme: DenemeTimerStrategy,
  EXAM_SIMULATOR: ExamSimulatorTimerStrategy,
}
