import { describe, expect, it, vi } from 'vitest'
import { buildStudyStatistics, dailyStudyWindow, getStudySummary, longestStudyStreak } from './studyStatistics'
import { addLocalDays, calendarDayNumber, getLocalDateString, startOfLocalDay, startOfLocalWeek } from './time'
import { getSinavKalanGun } from './selam'
import { makeSession } from '../test/helpers/fixtures'
import type { WorkInterval } from '../types'

const interval = (start: string, end: string): WorkInterval => ({ start: Date.parse(start), end: Date.parse(end) })
const now = new Date('2026-10-26T12:00:00+03:00')

describe('ortak çalışma dağılımı', () => {
  it('gece yarısını aşan net çalışma iki güne bölünür; duraklama saatlere eklenmez', () => {
    const session = makeSession({
      tarihISO: '2026-10-26T00:20:00+03:00', sureGercek: 1200,
      workIntervals: [interval('2026-10-25T23:50:00+03:00','2026-10-26T00:00:00+03:00'), interval('2026-10-26T00:10:00+03:00','2026-10-26T00:20:00+03:00')],
    })
    const stats = buildStudyStatistics([session], now)
    expect(Object.fromEntries(stats.dailySeconds)).toEqual({ '2026-10-25': 600, '2026-10-26': 600 })
    expect(stats.hourSeconds[23]).toBe(600)
    expect(stats.hourSeconds[0]).toBe(600)
    expect(stats.totalSeconds).toBe(1200)
    expect(stats.legacySessions).toBe(0)
  })

  it('eski kayıt başlangıcı tahmin edilmeden bitiş gününe/saatine yazılır', () => {
    const stats = buildStudyStatistics([makeSession({ tarihISO: '2026-10-25T21:05:00Z', createdAt: '2026-10-24T00:00:00Z', sureGercek: 3600 })], now)
    expect(Object.fromEntries(stats.dailySeconds)).toEqual({ '2026-10-26': 3600 })
    expect(stats.hourSeconds[0]).toBe(3600)
    expect(stats.legacySessions).toBe(1)
  })

  it('saniye yuvarlama kalanı gün/saat toplamını değiştirmez', () => {
    const record = makeSession({ tarihISO: '2026-10-26T01:00:00+03:00', sureGercek: 1,
      workIntervals: [interval('2026-10-26T00:59:59.600+03:00','2026-10-26T01:00:00+03:00'), interval('2026-10-26T00:59:59.000+03:00','2026-10-26T00:59:59.600+03:00')].reverse() })
    const stats = buildStudyStatistics([record], now)
    expect([...stats.dailySeconds.values()].reduce((sum, seconds) => sum + seconds, 0)).toBe(1)
    expect(stats.hourSeconds.reduce((sum, seconds) => sum + seconds, 0)).toBe(1)
  })

  it('sıfır süre çalışma günü veya seri üretmez', () => {
    expect(getStudySummary([makeSession({ sureGercek: 0, tarihISO: now.toISOString(), workIntervals: [] })], now).streak).toBe(0)
  })

  it('geçersiz/future tarihli seans istatistiklere karışmaz', () => {
    const stats = buildStudyStatistics([makeSession({ tarihISO: 'invalid' }),makeSession({ id: 'future', tarihISO: '2030-01-01T00:00:00Z' })], now)
    expect(stats.totalSeconds).toBe(0)
    expect(stats.completed).toEqual([])
  })

  it('bu hafta pazartesiye, bu ay ayın ilk gününe göre hesaplanır', () => {
    const summary = getStudySummary([
      makeSession({ id: 'sunday', tarihISO: '2026-10-25T12:00:00+03:00', sureGercek: 100 }),
      makeSession({ id: 'monday', tarihISO: '2026-10-26T00:00:00+03:00', sureGercek: 200 }),
      makeSession({ id: 'september', tarihISO: '2026-09-30T23:59:00+03:00', sureGercek: 400 }),
      makeSession({ id: 'october', tarihISO: '2026-10-01T00:00:00+03:00', sureGercek: 800 }),
    ], now)
    expect(summary.weekSeconds).toBe(200)
    expect(summary.weekSessions.map((session) => session.id)).toEqual(['monday'])
    expect(summary.monthSeconds).toBe(1100)
    expect(summary.monthSessions).toHaveLength(3)
  })

  it('yıl/ay sınırındaki seansın süresi iki döneme bölünür; bitiş puanı bir kez sayılır', () => {
    const reference = new Date('2027-01-01T12:00:00+03:00')
    const summary = getStudySummary([makeSession({ tarihISO: '2027-01-01T00:10:00+03:00', puan: 50, sureGercek: 1200,
      workIntervals: [interval('2026-12-31T23:50:00+03:00','2027-01-01T00:10:00+03:00')] })], reference)
    expect(summary.todaySeconds).toBe(600)
    expect(summary.monthSeconds).toBe(600)
    expect(summary.todayScore).toBe(50)
    expect(summary.streak).toBe(2)
  })

  it('30 günlük grafik tarih etiketi ile gün anahtarı aynı yerel tarihi gösterir', () => {
    const stats = buildStudyStatistics([makeSession({ tarihISO: '2026-10-25T21:15:00Z' })], now)
    const days = dailyStudyWindow(stats.dailySeconds,30,now)
    expect(days).toHaveLength(30)
    expect(days.at(-1)).toMatchObject({ dayKey: '2026-10-26', seconds: 3600 })
    for (const day of days) expect(getLocalDateString(day.date)).toBe(day.dayKey)
  })

  it('artık gün ve yıl sınırı ardışık gün sayılır', () => {
    expect(longestStudyStreak(['2024-02-28','2024-02-29','2024-03-01'])).toBe(3)
    expect(longestStudyStreak(['2025-12-31','2026-01-01'])).toBe(2)
    expect(getLocalDateString(startOfLocalWeek(new Date('2027-01-03T12:00:00+03:00')))).toBe('2026-12-28')
    expect(calendarDayNumber('2024-03-01') - calendarDayNumber('2024-02-28')).toBe(2)
  })

  it('sınav kalan gün hesabı yerel takvim ve geçerli tarih kullanır', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T00:30:00+03:00'))
    expect(getSinavKalanGun('2026-10-27')).toBe(1)
    expect(getSinavKalanGun('2026-02-30')).toBeNull()
    expect(getSinavKalanGun('bad')).toBeNull()
  })

  it('DST günlerinde takvim ilerletme 24 saat varsaymaz', () => {
    vi.stubEnv('TZ','America/New_York')
    const start = startOfLocalDay(new Date('2026-03-08T12:00:00-04:00'))
    const end = addLocalDays(start,1)
    expect((end.getTime()-start.getTime())/3600000).toBe(23)
    const autumn = startOfLocalDay(new Date('2026-11-01T12:00:00-05:00'))
    expect((addLocalDays(autumn,1).getTime()-autumn.getTime())/3600000).toBe(25)
  })

  it.each([
    ['2026-03-08T01:30:00-05:00','2026-03-08T03:30:00-04:00',1800,1800],
    ['2026-11-01T01:30:00-04:00','2026-11-01T01:30:00-05:00',3600,0],
  ])('DST saat dağılımı: %s → %s', (start,end,hourOne,hourThree) => {
    vi.stubEnv('TZ','America/New_York')
    const stats=buildStudyStatistics([makeSession({tarihISO:end,sureGercek:3600,workIntervals:[interval(start,end)]})],new Date(Date.parse(end)+1000))
    expect(stats.hourSeconds[1]).toBe(hourOne)
    expect(stats.hourSeconds[3]).toBe(hourThree)
    expect(stats.totalSeconds).toBe(3600)
  })
})
