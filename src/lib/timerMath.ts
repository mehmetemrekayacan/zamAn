import type { TimerSnapshot } from '../types'

/** Son tick'i beklemeden, mevcut çalışma aralığının net süresini hesaplar. */
export function getTimerElapsedMs(state: TimerSnapshot, now: number): number {
  if (state.status !== 'running') return state.elapsedMs
  const measured = state.plannedMs != null && state.expectedEndTime != null
    ? state.plannedMs + now - state.expectedEndTime
    : state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
  const elapsed = Math.max(0, state.elapsedMs, measured)
  const capped = state.mode === 'EXAM_SIMULATOR' || state.mode === 'ders60mola15' && state.workBreakPhase === 'break'
  return capped && state.plannedMs != null
    ? Math.min(state.plannedMs, elapsed) : elapsed
}
