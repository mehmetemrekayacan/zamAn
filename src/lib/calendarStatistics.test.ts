import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateStreak } from './scoring'
import { scoreFinishedSession } from './finishedSession'
import { makeSession } from '../test/helpers/fixtures'
import type { FinishedSession } from '../types'

describe('yerel takvim regression', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T00:30:00+03:00'))
  })

  it('Türkiye gece yarısından sonra UTC tarihi önceki gün olsa da seri doğru hesaplanır', () => {
    const records = [
      makeSession({ id: 'today', tarihISO: '2026-10-25T21:10:00Z' }),
      makeSession({ id: 'yesterday', tarihISO: '2026-10-25T17:00:00Z' }),
    ]
    expect(calculateStreak(records)).toBe(2)
  })

  it('gece yarısında henüz çalışılmamış yeni gün mevcut seriyi sıfırlamaz', () => {
    expect(calculateStreak([
      makeSession({ id: 'one', tarihISO: '2026-10-25T17:00:00Z' }),
      makeSession({ id: 'two', tarihISO: '2026-10-24T17:00:00Z' }),
    ])).toBe(2)
  })

  it('tur çarpanı UTC gününden değil seansın bittiği yerel günden alınır', () => {
    const endedAt = Date.parse('2026-10-26T00:20:00+03:00')
    const draft: FinishedSession = {
      id: 'finished', startedAt: endedAt - 60_000, endedAt, config: { mode: 'serbest' },
      elapsedMs: 60_000, pauses: 0, totalPauseDurationMs: 0, wasEarlyFinish: false,
    }
    const score = scoreFinishedSession(draft, [
      makeSession({ id: 'today', tarihISO: '2026-10-25T21:10:00Z' }),
      makeSession({ id: 'yesterday', tarihISO: '2026-10-25T17:00:00Z' }),
    ])
    expect(score.roundMultiplier).toBe(1.2)
  })
})
