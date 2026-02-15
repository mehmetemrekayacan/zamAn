/**
 * Zaman yardımcıları (time) birim testleri
 */
import { describe, it, expect } from 'vitest'
import {
  getLocalDateString,
  formatDuration,
  formatSeconds,
  formatSecondsShort,
} from './time'

describe('time', () => {
  describe('getLocalDateString', () => {
    it('YYYY-MM-DD formatı döner', () => {
      expect(getLocalDateString(new Date('2025-02-04T12:00:00'))).toBe('2025-02-04')
    })
    it('argümansız bugünü kullanır', () => {
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      expect(getLocalDateString()).toBe(`${y}-${m}-${d}`)
    })
  })

  describe('formatDuration', () => {
    it('90 saniye → 00:01:30', () => {
      expect(formatDuration(90_000)).toBe('00:01:30')
    })
    it('0 ms → 00:00:00', () => {
      expect(formatDuration(0)).toBe('00:00:00')
    })
    it('1 saat 5 dk 10 sn', () => {
      expect(formatDuration(1 * 3600 * 1000 + 5 * 60 * 1000 + 10 * 1000)).toBe('01:05:10')
    })
  })

  describe('formatSeconds', () => {
    it('90 sn → 1 dk 30 sn', () => {
      expect(formatSeconds(90)).toBe('1 dk 30 sn')
    })
    it('3665 sn → 1 saat 1 dk 5 sn', () => {
      expect(formatSeconds(3665)).toBe('1 saat 1 dk 5 sn')
    })
    it('0 sn → 0 sn', () => {
      expect(formatSeconds(0)).toBe('0 sn')
    })
  })

  describe('formatSecondsShort', () => {
    it('saat + dk kısa format', () => {
      expect(formatSecondsShort(3660)).toBe('1s 1dk')
    })
    it('sadece dk', () => {
      expect(formatSecondsShort(300)).toBe('5dk')
    })
    it('sadece sn', () => {
      expect(formatSecondsShort(45)).toBe('45sn')
    })
  })
})
