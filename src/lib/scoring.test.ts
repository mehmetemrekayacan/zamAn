/**
 * Puanlama (scoring) birim testleri
 */
import { describe, it, expect } from 'vitest'
import {
  calculateBaseScore,
  calculatePausePenalty,
  calculateFocusBonus,
  calculateEarlyCompletionBonus,
  calculateStreakBonus,
  calculateScore,
  getUnvan,
  calculateConsistency,
} from './scoring'

describe('scoring', () => {
  describe('calculateBaseScore', () => {
    it('60 dk serbest → 48 puan (0.8 katsayı)', () => {
      expect(calculateBaseScore(3600, 'serbest')).toBe(48)
    })
    it('60 dk deneme → 78 puan (1.3 katsayı)', () => {
      expect(calculateBaseScore(3600, 'deneme')).toBe(78)
    })
    it('60 dk ders60mola15 → 69 puan (1.15 katsayı)', () => {
      expect(calculateBaseScore(3600, 'ders60mola15')).toBe(69)
    })
    it('60 dk gerisayim → 72 puan (1.2 katsayı)', () => {
      expect(calculateBaseScore(3600, 'gerisayim')).toBe(72)
    })
  })

  describe('calculatePausePenalty', () => {
    it('0 duraklatma → 0 ceza', () => expect(calculatePausePenalty(0)).toBe(0))
    it('1 duraklatma → -5', () => expect(calculatePausePenalty(1)).toBe(5))
    it('2 duraklatma → -10', () => expect(calculatePausePenalty(2)).toBe(10))
    it('3+ duraklatma → -20', () => expect(calculatePausePenalty(3)).toBe(20))
  })

  describe('calculateFocusBonus', () => {
    it('0 duraklatma → +15', () => expect(calculateFocusBonus(0)).toBe(15))
    it('1 duraklatma → +5', () => expect(calculateFocusBonus(1)).toBe(5))
    it('2+ duraklatma → 0', () => expect(calculateFocusBonus(2)).toBe(0))
  })

  describe('calculateEarlyCompletionBonus', () => {
    it('erken bitirme 10 dk → +10', () => {
      expect(calculateEarlyCompletionBonus(3000, 3600)).toBe(10)
    })
    it('tam erken bitirme → max +20', () => {
      expect(calculateEarlyCompletionBonus(0, 3600)).toBe(20)
    })
    it('geç bitirme → 0', () => {
      expect(calculateEarlyCompletionBonus(4000, 3600)).toBe(0)
    })
    it('plansız → 0', () => {
      expect(calculateEarlyCompletionBonus(3600, undefined)).toBe(0)
    })
  })

  describe('calculateStreakBonus', () => {
    it('0 seri → 0', () => expect(calculateStreakBonus(0)).toBe(0))
    it('5 seri → 25', () => expect(calculateStreakBonus(5)).toBe(25))
    it('10+ seri → max 50', () => expect(calculateStreakBonus(10)).toBe(50))
  })

  describe('calculateConsistency', () => {
    it('plansız → 100', () => expect(calculateConsistency(3600, undefined)).toBe(100))
    it('tam plan → 100', () => expect(calculateConsistency(3600, 3600)).toBe(100))
    it('yarım plan → 50', () => expect(calculateConsistency(1800, 3600)).toBe(50))
  })

  describe('calculateScore', () => {
    it('tam puan pozitif (serbest 60dk, 0 pause, streak 3)', () => {
      const s = calculateScore(3600, 'serbest', 0, undefined, 3)
      expect(s.totalScore).toBeGreaterThan(0)
      expect(s.baseScore).toBe(48)
      expect(s.focusBonus).toBe(15)
      expect(s.streakBonus).toBe(15)
    })
    it('kısa seans (3 sn) bonus yok, düşük puan', () => {
      const s = calculateScore(3, 'serbest', 0, undefined, 1)
      expect(s.totalScore).toBeLessThanOrEqual(5)
      expect(s.focusBonus).toBe(0)
      expect(s.streakBonus).toBe(0)
    })
    it('duraklatma cezası uygulanır', () => {
      const s0 = calculateScore(3600, 'serbest', 0, undefined, 0)
      const s1 = calculateScore(3600, 'serbest', 1, undefined, 0)
      expect(s1.totalScore).toBeLessThan(s0.totalScore)
    })
  })

  describe('getUnvan', () => {
    it('0 puan → İlk Adım', () => {
      expect(getUnvan(0).unvan).toBe('İlk Adım')
    })
    it('2500 puan → Sınav Adayı', () => {
      expect(getUnvan(2500).unvan).toBe('Sınav Adayı')
    })
    it('45000 puan → Usta Öğretmen', () => {
      expect(getUnvan(45000).unvan).toBe('Usta Öğretmen')
    })
  })
})
