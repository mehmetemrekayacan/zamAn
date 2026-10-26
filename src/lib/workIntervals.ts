import type { TimerSnapshot, WorkInterval } from '../types'

export function intervalDuration(intervals: WorkInterval[]): number {
  return intervals.reduce((total, interval) => total + interval.end - interval.start, 0)
}

export function validWorkIntervals(value: unknown, expectedSeconds?: number, endedAt?: number): value is WorkInterval[] {
  if (!Array.isArray(value)) return false
  let previousEnd = 0
  let total = 0
  for (const part of value) {
    if (!part || typeof part !== 'object' || Object.keys(part).some((key) => key !== 'start' && key !== 'end')) return false
    if (!Number.isSafeInteger(part.start) || !Number.isSafeInteger(part.end)
      || part.start < previousEnd || part.end <= part.start || (endedAt != null && part.end > endedAt)) return false
    previousEnd = part.end
    total += part.end - part.start
    if (!Number.isSafeInteger(total)) return false
  }
  return expectedSeconds === undefined || Math.round(total / 1000) === expectedSeconds
}

/** Eski/eksik zaman çizgisini tahmin ederek doldurmaz. */
export function closeWorkIntervals(state: TimerSnapshot, endedAt: number, elapsedMs: number): WorkInterval[] | undefined {
  if (state.workIntervals === undefined) return undefined
  const intervals = state.workIntervals.map((part) => ({ ...part }))
  const missing = elapsedMs - intervalDuration(intervals)
  if (missing === 0) return intervals
  const start = state.activeWorkStartedAt
  if (missing < 0 || start == null || start + missing > endedAt || start < (intervals.at(-1)?.end ?? 0)) return undefined
  intervals.push({ start, end: start + missing })
  return intervals
}
