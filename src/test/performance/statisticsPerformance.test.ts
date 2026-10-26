import { expect, it, vi } from 'vitest'
import { makeSession } from '../helpers/fixtures'
import { buildStudyStatistics, getStudySummary, summarizeStudyStatistics } from '../../lib/studyStatistics'
import { getTahmin150Saat, getTahminFromStatistics } from '../../lib/tahmin'
import { cachedStudyStatistics } from '../../lib/useStudyStatistics'
import { localCalendarSnapshot } from '../../lib/localCalendarClock'

it.each([1000, 10000])('%i kayıtta özet ve grafik hesaplama ölçümü', count => {
  const now = new Date('2026-10-26T12:00:00+03:00')
  vi.useFakeTimers({ now, toFake: ['Date'] })
  const sessions = Array.from({ length: count }, (_, index) => {
    const end = now.getTime() - (index + 1) * 3_600_000
    return makeSession({ id: String(index), tarihISO: new Date(end).toISOString(), sureGercek: 1800,
      workIntervals: index % 2 ? [{ start: end - 1_800_000, end }] : undefined })
  })
  const start = performance.now()
  const summary = getStudySummary(sessions, now)
  getTahmin150Saat(summary.completed)
  for (let chart = 0; chart < 4; chart++) buildStudyStatistics(sessions, now)
  console.info('STATISTICS_PERFORMANCE_BEFORE', JSON.stringify({ count, scans: 6, ms: +(performance.now() - start).toFixed(2) }))
  expect(summary.totalSeconds).toBe(count * 1800)
  const calendar = localCalendarSnapshot()
  const after = performance.now()
  const common = cachedStudyStatistics(sessions, calendar)
  const optimized = summarizeStudyStatistics(common, now)
  const prediction = getTahminFromStatistics(common)
  for (let chart = 0; chart < 4; chart++) expect(cachedStudyStatistics(sessions, calendar)).toBe(common)
  console.info('STATISTICS_PERFORMANCE_AFTER', JSON.stringify({ count, scans: 1, ms: +(performance.now() - after).toFixed(2) }))
  expect(optimized).toEqual(summary)
  expect(prediction).toBe(getTahmin150Saat(summary.completed))
})

it('paylaşılan hesap gün/hesap/saat dilimi ve kayıt değişiminde yenilenir', () => {
  vi.useFakeTimers({ now: new Date('2026-10-26T12:00:00+03:00'), toFake: ['Date'] })
  const sessions = [makeSession()]
  const calendar = localCalendarSnapshot()
  const first = cachedStudyStatistics(sessions, calendar)
  expect(cachedStudyStatistics(sessions, calendar)).toBe(first)
  const updated = [...sessions, makeSession({ id: 'second', sureGercek: 20 })]
  expect(cachedStudyStatistics(updated, calendar).totalSeconds).toBe(first.totalSeconds + 20)
  const anotherAccount = [...sessions]
  expect(cachedStudyStatistics(anotherAccount, calendar)).not.toBe(first)
  const nextDay = cachedStudyStatistics(sessions, '2026-10-27|180|Europe/Istanbul')
  expect(nextDay).not.toBe(first)
  const timezone = cachedStudyStatistics(sessions, '2026-10-27|0|Europe/London')
  expect(timezone).not.toBe(nextDay)
})
