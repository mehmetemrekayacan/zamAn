import type { SessionRecord, WorkInterval } from '../types'
import { addLocalDays, calendarDayNumber, getLocalDateString, localDateFromKey, startOfLocalDay, startOfLocalMonth, startOfLocalWeek } from './time'
import { validWorkIntervals } from './workIntervals'

export type StudySession = Pick<SessionRecord, 'tarihISO' | 'sureGercek' | 'workIntervals'>
type StudySlice = { day: string; hour: number; seconds: number }

export function sessionCompletedAt(session: Pick<StudySession, 'tarihISO'>): Date | null {
  const date = new Date(session.tarihISO)
  return Number.isFinite(date.getTime()) ? date : null
}

function splitIntervals(intervals: WorkInterval[], seconds: number): StudySlice[] {
  const slices: { day: string; hour: number; ms: number }[] = []
  for (const part of intervals) {
    let cursor = part.start
    while (cursor < part.end) {
      const date = new Date(cursor)
      const boundary = new Date(cursor)
      boundary.setMinutes(60, 0, 0)
      const end = Math.min(part.end, boundary.getTime() > cursor ? boundary.getTime() : cursor + 3_600_000)
      slices.push({ day: getLocalDateString(date), hour: date.getHours(), ms: end - cursor })
      cursor = end
    }
  }
  const totalMs = slices.reduce((total, slice) => total + slice.ms, 0)
  if (!totalMs) return []
  // Tam saniye yuvarlamasının kalanı en büyük kesirlere verilir; toplam kayıttakiyle aynı kalır.
  const shares = slices.map((slice, index) => ({ ...slice, index, value: slice.ms / totalMs * seconds }))
  const values = shares.map((slice) => Math.floor(slice.value))
  let remainder = seconds - values.reduce((total, value) => total + value, 0)
  for (const slice of [...shares].sort((a, b) => (b.value % 1) - (a.value % 1) || a.index - b.index)) {
    const extra = Math.min(1, remainder)
    values[slice.index] += extra
    remainder -= extra
    if (remainder <= 0) break
  }
  return shares.map((slice) => ({ day: slice.day, hour: slice.hour, seconds: values[slice.index] }))
}

export function buildStudyStatistics<T extends StudySession>(sessions: T[], now = new Date()) {
  const dailySeconds = new Map<string, number>()
  const hourSeconds = Array<number>(24).fill(0)
  const completed: T[] = []
  let legacySessions = 0
  let totalSeconds = 0
  for (const session of sessions) {
    const date = sessionCompletedAt(session)
    if (!date || date > now || !Number.isFinite(session.sureGercek) || session.sureGercek < 0) continue
    completed.push(session)
    const known = validWorkIntervals(session.workIntervals, session.sureGercek, date.getTime())
    if (!known) legacySessions++
    const slices = known ? splitIntervals(session.workIntervals!, session.sureGercek)
      : [{ day: getLocalDateString(date), hour: date.getHours(), seconds: session.sureGercek }]
    totalSeconds += session.sureGercek
    for (const slice of slices) {
      dailySeconds.set(slice.day, (dailySeconds.get(slice.day) ?? 0) + slice.seconds)
      hourSeconds[slice.hour] += slice.seconds
    }
  }
  return { dailySeconds, hourSeconds, totalSeconds, legacySessions, completed }
}

export function currentStudyStreak(days: Iterable<string>, now = new Date(), todayHasStudy?: boolean): number {
  const active = new Set(days)
  const today = getLocalDateString(now)
  if (todayHasStudy === true) active.add(today)
  else if (todayHasStudy === false) active.delete(today)
  let cursor = startOfLocalDay(now)
  if (!active.has(today)) cursor = addLocalDays(cursor, -1)
  let streak = 0
  while (active.has(getLocalDateString(cursor))) {
    streak++
    cursor = addLocalDays(cursor, -1)
  }
  return streak
}

export function longestStudyStreak(days: Iterable<string>): number {
  const sorted = [...new Set(days)].map(calendarDayNumber).filter(Number.isFinite).sort((a, b) => a - b)
  let longest = 0
  let run = 0
  sorted.forEach((day, index) => {
    run = index && day === sorted[index - 1] + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  })
  return longest
}

export function dailyStudyWindow(daily: Map<string, number>, count: number, now = new Date()) {
  const start = addLocalDays(startOfLocalDay(now), -(count - 1))
  return Array.from({ length: count }, (_, index) => {
    const date = addLocalDays(start, index)
    const dayKey = getLocalDateString(date)
    return { dayKey, date, seconds: daily.get(dayKey) ?? 0 }
  })
}

export function getStudySummary(sessions: SessionRecord[], now = new Date()) {
  const stats = buildStudyStatistics(sessions, now)
  const todayKey = getLocalDateString(now)
  const sumFrom = (from: Date) => [...stats.dailySeconds].reduce((total, [day, seconds]) => total + (localDateFromKey(day) >= from ? seconds : 0), 0)
  const completedFrom = (from: Date) => stats.completed.filter((session) => sessionCompletedAt(session)! >= from)
  const todaySessions = completedFrom(startOfLocalDay(now))
  const weekSessions = completedFrom(startOfLocalWeek(now))
  const monthSessions = completedFrom(startOfLocalMonth(now))
  const activeDays = [...stats.dailySeconds].filter(([, seconds]) => seconds > 0).map(([day]) => day)
  return {
    ...stats, activeDays, todaySessions,
    todaySeconds: stats.dailySeconds.get(todayKey) ?? 0,
    todayScore: todaySessions.reduce((total, session) => total + session.puan, 0),
    weekSeconds: sumFrom(startOfLocalWeek(now)), weekSessions,
    monthSeconds: sumFrom(startOfLocalMonth(now)), monthSessions,
    avgScoreMonth: monthSessions.length ? Math.round(monthSessions.reduce((total, session) => total + session.puan, 0) / monthSessions.length) : 0,
    streak: currentStudyStreak(activeDays, now),
  }
}
