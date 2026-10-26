import { useSessionsStore } from '../store/sessions'
import type { SessionRecord } from '../types'
import { dateForCalendar, useLocalCalendar } from './localCalendarClock'
import { buildStudyStatistics } from './studyStatistics'

type Statistics = ReturnType<typeof buildStudyStatistics<SessionRecord>>
// Store güncellemeleri yeni dizi üretir. Eski hesap/dizi bellekte tutulmaz;
// takvim anahtarı gece yarısı, UTC ofseti ve IANA saat dilimini kapsar.
const cache = new WeakMap<SessionRecord[], { calendar: string; stats: Statistics }>()

export function cachedStudyStatistics(sessions: SessionRecord[], calendar: string): Statistics {
  const previous = cache.get(sessions)
  if (previous?.calendar === calendar) return previous.stats
  const stats = buildStudyStatistics(sessions, dateForCalendar(calendar))
  cache.set(sessions, { calendar, stats })
  return stats
}

export function useStudyStatistics(): Statistics {
  const sessions = useSessionsStore(state => state.sessions)
  const calendar = useLocalCalendar()
  return cachedStudyStatistics(sessions, calendar)
}
