import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { accountStorage } from '../lib/accountStorage'
import { getLocalDateString } from '../lib/time'
import type { ModeConfig, TimerSnapshot, FinishForm, SessionRecord } from '../types'
import { TIMER_STRATEGIES } from '../lib/timerStrategies'
import { MODE_DEFAULTS } from '../lib/modeConfig'
import { getTimerElapsedMs } from '../lib/timerMath'
import { captureFinishedSession, emptyFinishForm, scoreFinishedSession } from '../lib/finishedSession'

let worker: Worker | null = null
function startWorker(onTick: () => void) {
  if (typeof Worker === 'undefined') return
  worker ??= new Worker(new URL('../lib/timerWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent) => { if (event.data === 'tick') onTick() }
  worker.postMessage('start')
}
function stopWorker() {
  if (!worker) return
  worker.postMessage('stop')
  worker.onmessage = null
}
export function suspendTimerForAccountChange() {
  useTimerStore.getState().syncTimer()
  stopWorker()
}

type TimerCoreState = TimerSnapshot & { modeConfig: ModeConfig; pomodoroRound: number; lastPomodoroDate: string }
type GetState = () => TimerCoreState
type SetState = (updates: Partial<TimerCoreState>) => void

function processTick(get: GetState, set: SetState) {
  const state = get()
  if (state.status !== 'running' || state.recoveryPending) return
  const now = Date.now()
  const { finished, ...updates } = TIMER_STRATEGIES[state.mode].onTick(now, state)
  const next = { ...state, ...updates }
  if (next.status === 'finished') {
    const endedAt = state.mode === 'EXAM_SIMULATOR' ? Math.min(now, state.expectedEndTime ?? now) : now
    updates.finishedSession = captureFinishedSession(next, endedAt)
    updates.sessionId = updates.finishedSession.id
    updates.finishForm = { ...emptyFinishForm(), examName: state.finishForm?.examName ?? '' }
  } else if (next.status === 'idle') {
    updates.sessionId = undefined
    updates.sessionStartedAt = undefined
  }
  set({ ...updates, checkpointAt: now })
  if (finished) stopWorker()
}

export type TimerState = TimerCoreState & {
  start: (config?: ModeConfig) => void
  pause: () => void
  resume: () => void
  reset: () => void
  setModeConfig: (config: ModeConfig) => boolean
  jumpToSection: (index: number) => void
  finishEarly: () => void
  getRemainingMs: () => number | undefined
  syncOnVisibilityChange: () => void
  syncTimer: () => void
  transitionToBreak: () => void
  finishBreakEarly: () => void
  recoverSession: () => boolean
  continueRecoveredSession: () => void
  finishRecoveredSession: () => void
  discardRecoveredSession: () => void
  prepareFinishedSession: (sessions: SessionRecord[]) => void
  updateFinishForm: (form: Partial<FinishForm>) => void
  completeFinishedSession: (id: string) => void
}

function initialTimerState(): TimerCoreState {
  return {
    running: false, status: 'idle', elapsedMs: 0, mode: 'serbest', modeConfig: MODE_DEFAULTS.serbest,
    plannedMs: undefined, remainingMs: undefined, currentSectionIndex: 0,
    workBreakPhase: 'work', dersCycle: 0, dersCycleDate: null, molaToplamMs: 0,
    denemeMolalarSaniye: [], pauses: 0, lastTickTs: null, pauseStartTs: null,
    wasEarlyFinish: undefined, totalPauseDurationMs: 0, backgroundBreakStartTs: null,
    backgroundBreakPlannedMs: undefined, expectedEndTime: undefined, startWallTime: undefined,
    isOvertime: false, pomodoroRound: 1, lastPomodoroDate: getLocalDateString(),
    sessionId: undefined, sessionStartedAt: undefined, checkpointAt: undefined,
    recoveryPending: false, finishedSession: undefined, finishScore: undefined, finishForm: emptyFinishForm(),
  }
}

function normalizedConfig(config: ModeConfig): ModeConfig {
  if (config.mode !== 'deneme') return { ...config }
  const index = Math.max(0, Math.min(config.currentSectionIndex ?? 0, config.bolumler.length - 1))
  return { ...config, currentSectionIndex: index, bolumler: config.bolumler.map((section) => ({ ...section })) }
}

function roundState(state: TimerCoreState) {
  const today = getLocalDateString()
  return { lastPomodoroDate: today, pomodoroRound: state.lastPomodoroDate === today ? Math.max(1, state.pomodoroRound) : 1 }
}

export const useTimerStore = create<TimerState>()(
  persist((set, get) => ({
    ...initialTimerState(),
    setModeConfig: (rawConfig) => {
      const state = get()
      if (state.status !== 'idle') return false
      const config = normalizedConfig(rawConfig)
      stopWorker()
      const rounds = roundState(state)
      const index = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : undefined
      const phase = config.mode === 'ders60mola15' && state.mode === 'ders60mola15' && state.dersCycleDate === rounds.lastPomodoroDate
        ? state.workBreakPhase ?? 'work' : 'work'
      const planned = TIMER_STRATEGIES[config.mode].getPlannedMs(config, phase, index)
      set({
        ...initialTimerState(), ...rounds, mode: config.mode, modeConfig: config,
        currentSectionIndex: index, plannedMs: planned, remainingMs: planned,
        finishForm: { ...emptyFinishForm(), examName: config.mode === state.mode ? state.finishForm?.examName ?? '' : '' },
        workBreakPhase: config.mode === 'ders60mola15' ? phase : undefined,
        dersCycleDate: config.mode === 'ders60mola15' ? rounds.lastPomodoroDate : null,
        dersCycle: config.mode === 'ders60mola15' ? Math.max(0, rounds.pomodoroRound - 1) : undefined,
      })
      // Eski sürümün başka moda geçerken ayırdığı duraklatılmış 60/15 kaydını koru.
      if (config.mode === 'ders60mola15') {
        try {
          const raw = accountStorage.getItem('zaman-ders60-pause-state')
          if (raw) {
            const saved = JSON.parse(raw) as Partial<TimerSnapshot> & { savedAt?: string }
            if (saved.savedAt === rounds.lastPomodoroDate && Number.isFinite(saved.elapsedMs) && saved.elapsedMs! >= 0 && Number.isFinite(saved.plannedMs) && saved.plannedMs! > 0) {
              const elapsed = saved.elapsedMs!
              set({
                elapsedMs: elapsed, plannedMs: saved.plannedMs,
                remainingMs: Math.max(0, saved.plannedMs! - elapsed),
                workBreakPhase: saved.workBreakPhase === 'break' ? 'break' : 'work',
                status: 'paused', pauses: saved.pauses ?? 0, dersCycle: saved.dersCycle ?? 0,
                molaToplamMs: saved.molaToplamMs ?? 0, pauseStartTs: Date.now(),
                sessionId: crypto.randomUUID(), sessionStartedAt: Math.max(0, Date.now() - elapsed),
              })
              accountStorage.removeItem('zaman-ders60-pause-state')
            }
          }
        } catch { /* Eski ham kayıt okunamadıysa kaynağı silme. */ }
      }
      return true
    },

    start: (config) => {
      const state = get()
      if (state.status !== 'idle') return
      if (config && !get().setModeConfig(config)) return
      const current = get()
      if (current.status !== 'idle') return
      const cfg = current.modeConfig
      const rounds = roundState(current)
      stopWorker()
      const updates = TIMER_STRATEGIES[cfg.mode].onStart(cfg, current, rounds.lastPomodoroDate, rounds.pomodoroRound)
      const now = Date.now()
      set({
        ...rounds, ...updates, sessionId: crypto.randomUUID(), sessionStartedAt: now, checkpointAt: now,
        recoveryPending: false, finishedSession: undefined, finishScore: undefined,
        finishForm: { ...emptyFinishForm(), examName: current.finishForm?.examName ?? '' },
        pauseStartTs: null,
      })
      startWorker(() => processTick(get, set))
    },

    pause: () => {
      if (get().recoveryPending || !TIMER_STRATEGIES[get().mode].canPause(get())) return
      processTick(get, set)
      const state = get()
      if (state.status !== 'running') return
      stopWorker()
      const now = Date.now()
      set({ ...TIMER_STRATEGIES[state.mode].onPause(now, state), checkpointAt: now })
    },

    resume: () => {
      const state = get()
      if (state.status !== 'paused' || state.recoveryPending) return
      const now = Date.now()
      const pauseDuration = Math.max(0, now - (state.pauseStartTs ?? now))
      set({
        ...TIMER_STRATEGIES[state.mode].onResume(now, state, pauseDuration),
        startWallTime: now - state.elapsedMs,
        expectedEndTime: state.plannedMs != null ? now + state.plannedMs - state.elapsedMs : undefined,
        checkpointAt: now,
      })
      startWorker(() => processTick(get, set))
    },

    reset: () => {
      const state = get()
      if (state.status === 'finished' || state.recoveryPending) return
      stopWorker()
      const rounds = roundState(state)
      set({
        ...initialTimerState(), mode: state.mode, modeConfig: state.modeConfig, ...rounds,
        ...TIMER_STRATEGIES[state.mode].onReset(state, rounds.lastPomodoroDate, rounds.pomodoroRound),
      })
    },

    jumpToSection: (index) => {
      const state = get()
      if (state.status !== 'idle' || state.modeConfig.mode !== 'deneme') return
      get().setModeConfig({ ...state.modeConfig, currentSectionIndex: index })
    },

    finishEarly: () => {
      const state = get()
      if ((state.status !== 'running' && state.status !== 'paused') || state.recoveryPending) return
      stopWorker()
      const now = Date.now()
      const elapsed = getTimerElapsedMs(state, now)
      const full = state.plannedMs != null && elapsed >= state.plannedMs
      const totalPause = state.totalPauseDurationMs + (state.status === 'paused' && state.pauseStartTs != null ? Math.max(0, now - state.pauseStartTs) : 0)
      const rounds = roundState(state)
      const updates = TIMER_STRATEGIES[state.mode].onFinishEarly(now, { ...state, isOvertime: full }, totalPause, elapsed, rounds.lastPomodoroDate, rounds.pomodoroRound)
      const next = { ...state, ...updates }
      const draft = next.status === 'finished' ? captureFinishedSession(next, now) : undefined
      set({
        ...updates, checkpointAt: now, pauseStartTs: null,
        sessionId: draft?.id, finishedSession: draft, finishScore: undefined,
        finishForm: { ...emptyFinishForm(), examName: state.finishForm?.examName ?? '' },
      })
    },

    getRemainingMs: () => get().remainingMs,
    transitionToBreak: () => {
      const state = get()
      if (state.backgroundBreakStartTs == null || state.backgroundBreakPlannedMs == null) return
      stopWorker()
      const now = Date.now()
      const elapsed = Math.max(0, now - state.backgroundBreakStartTs)
      const planned = state.backgroundBreakPlannedMs
      const workPlan = TIMER_STRATEGIES[state.mode].getPlannedMs(state.modeConfig, 'work')
      const common = {
        sessionId: undefined, sessionStartedAt: undefined, finishedSession: undefined,
        finishScore: undefined, finishForm: emptyFinishForm(), recoveryPending: false,
        totalPauseDurationMs: 0, pauseStartTs: null, pauses: 0, isOvertime: false, wasEarlyFinish: undefined,
        backgroundBreakStartTs: null, backgroundBreakPlannedMs: undefined, checkpointAt: now,
        dersCycleDate: getLocalDateString(),
      }
      if (elapsed >= planned) {
        set({
          ...common, status: 'idle', running: false, elapsedMs: 0, plannedMs: workPlan, remainingMs: workPlan,
          expectedEndTime: undefined, startWallTime: undefined, lastTickTs: null,
          workBreakPhase: 'work', molaToplamMs: (state.molaToplamMs ?? 0) + planned,
        })
      } else {
        set({
          ...common, status: 'running', running: true, workBreakPhase: 'break',
          elapsedMs: elapsed, plannedMs: planned, remainingMs: planned - elapsed,
          expectedEndTime: state.backgroundBreakStartTs + planned, startWallTime: state.backgroundBreakStartTs, lastTickTs: now,
        })
        startWorker(() => processTick(get, set))
      }
    },

    finishBreakEarly: () => {
      const state = get()
      // Kaydedilmemiş çalışma taslağını bu düğmeyle atlama.
      if (state.finishedSession || state.mode !== 'ders60mola15') return
      if (state.backgroundBreakStartTs != null) {
        get().transitionToBreak()
        if (get().status === 'running') get().finishBreakEarly()
        return
      }
      if (state.workBreakPhase !== 'break') return
      stopWorker()
      const elapsed = getTimerElapsedMs(state, Date.now())
      const plan = state.modeConfig.mode === 'ders60mola15' ? state.modeConfig.molaMs : 0
      const workPlan = TIMER_STRATEGIES[state.mode].getPlannedMs(state.modeConfig, 'work')
      set({
        status: 'idle', running: false, elapsedMs: 0, plannedMs: workPlan, remainingMs: workPlan,
        workBreakPhase: 'work', molaToplamMs: (state.molaToplamMs ?? 0) + Math.min(elapsed, plan),
        lastTickTs: null, expectedEndTime: undefined, startWallTime: undefined,
        sessionId: undefined, sessionStartedAt: undefined, totalPauseDurationMs: 0, pauses: 0, pauseStartTs: null,
        wasEarlyFinish: undefined, isOvertime: false, dersCycleDate: getLocalDateString(),
      })
    },

    syncOnVisibilityChange: () => processTick(get, set),
    syncTimer: () => processTick(get, set),
    recoverSession: () => {
      const state = get()
      if (state.status !== 'running' && state.status !== 'paused') return false
      if (state.recoveryPending) return true
      stopWorker()
      // Mola duvar saatiyle ilerler; kullanıcı karar ekranında beklerken de tamamlanabilir.
      if (state.mode === 'ders60mola15' && state.workBreakPhase === 'break') {
        if (state.status === 'paused') {
          const now = Date.now()
          set({ status: 'running', running: true, expectedEndTime: now + Math.max(0, (state.plannedMs ?? 0) - state.elapsedMs) })
        }
        processTick(get, set)
        if (get().status === 'running') startWorker(() => processTick(get, set))
        return false
      }
      const now = Date.now()
      // Sınavın sabit bitişi açılış anına kadar işler; karar ekranı yeni çalışma değildir.
      if (state.mode === 'EXAM_SIMULATOR' && state.status === 'running') {
        processTick(get, set)
        if (get().status === 'finished') return false
      }
      const current = get()
      const checkpoint = state.checkpointAt ?? state.lastTickTs ?? now
      set({
        sessionId: current.sessionId ?? crypto.randomUUID(),
        sessionStartedAt: current.sessionStartedAt ?? Math.max(0, checkpoint - current.elapsedMs - current.totalPauseDurationMs),
        status: 'paused', running: false, lastTickTs: null, recoveryPending: true,
        pauseStartTs: state.status === 'paused' ? state.pauseStartTs ?? now : state.mode === 'EXAM_SIMULATOR' ? now : Math.min(now, checkpoint),
        expectedEndTime: undefined, startWallTime: undefined,
      })
      return true
    },
    continueRecoveredSession: () => {
      if (!get().recoveryPending) return
      set({ recoveryPending: false })
      get().resume()
    },
    finishRecoveredSession: () => {
      if (!get().recoveryPending) return
      set({ recoveryPending: false })
      get().finishEarly()
    },
    discardRecoveredSession: () => {
      set({ recoveryPending: false, status: 'idle' })
      get().reset()
    },
    prepareFinishedSession: (sessions) => {
      const state = get()
      if (state.status !== 'finished' || state.finishScore) return
      const draft = state.finishedSession ?? captureFinishedSession(state, state.checkpointAt ?? Date.now())
      set({ finishedSession: draft, sessionId: draft.id, finishScore: scoreFinishedSession(draft, sessions) })
    },
    updateFinishForm: (form) => {
      set({ finishForm: { ...emptyFinishForm(), ...get().finishForm, ...form } })
    },
    completeFinishedSession: (id) => {
      if (get().finishedSession?.id !== id || get().status !== 'finished') return
      if (get().backgroundBreakStartTs != null) get().transitionToBreak()
      else {
        set({ status: 'idle' })
        get().reset()
      }
    },
  }), {
    name: 'timer-storage',
    storage: createJSONStorage(() => accountStorage),
    merge: (persisted, current) => ({ ...current, ...initialTimerState(), ...(persisted as object) }),
    partialize: (state) => ({
      status: state.status, mode: state.mode, modeConfig: state.modeConfig,
      elapsedMs: state.elapsedMs, plannedMs: state.plannedMs, remainingMs: state.remainingMs,
      currentSectionIndex: state.currentSectionIndex, isOvertime: state.isOvertime,
      expectedEndTime: state.expectedEndTime, startWallTime: state.startWallTime,
      dersCycle: state.dersCycle, dersCycleDate: state.dersCycleDate, workBreakPhase: state.workBreakPhase,
      molaToplamMs: state.molaToplamMs, totalPauseDurationMs: state.totalPauseDurationMs,
      pomodoroRound: state.pomodoroRound, lastPomodoroDate: state.lastPomodoroDate,
      pauses: state.pauses, pauseStartTs: state.pauseStartTs, lastTickTs: state.lastTickTs,
      wasEarlyFinish: state.wasEarlyFinish, denemeMolalarSaniye: state.denemeMolalarSaniye,
      backgroundBreakStartTs: state.backgroundBreakStartTs, backgroundBreakPlannedMs: state.backgroundBreakPlannedMs,
      sessionId: state.sessionId, sessionStartedAt: state.sessionStartedAt, checkpointAt: state.checkpointAt,
      recoveryPending: state.recoveryPending, finishedSession: state.finishedSession,
      finishScore: state.finishScore, finishForm: state.finishForm,
    }),
  }),
)
