/**
 * Puanlama (scoring) v2 birim testleri
 */
import { describe, it, expect } from 'vitest'
import {
  calculatePausePenalty,
  calculateStreakBonus,
  calculateScore,
  getUnvan,
} from './scoring'

describe('scoring v2', () => {
  describe('calculatePausePenalty', () => {
    it('0 duraklatma → 0 ceza', () => expect(calculatePausePenalty(0)).toBe(0))
    it('1 duraklatma → -5', () => expect(calculatePausePenalty(1)).toBe(5))
    it('2 duraklatma → -10', () => expect(calculatePausePenalty(2)).toBe(10))
    it('3+ duraklatma → -15 (cap)', () => expect(calculatePausePenalty(5)).toBe(15))
  })

  describe('calculateStreakBonus', () => {
    it('0 seri → 0', () => expect(calculateStreakBonus(0)).toBe(0))
    it('5 seri → 25', () => expect(calculateStreakBonus(5)).toBe(25))
    it('10+ seri → max 50', () => expect(calculateStreakBonus(10)).toBe(50))
    it('20 seri → hâlâ max 50', () => expect(calculateStreakBonus(20)).toBe(50))
  })

  describe('calculateScore — baraj', () => {
    it('< 1 dakika → 0 puan', () => {
      const s = calculateScore(30_000, 'serbest', 0, false)
      expect(s.totalScore).toBe(0)
      expect(s.baseScore).toBe(0)
    })
    it('tam 1 dakika → 10 puan (barajı geçer)', () => {
      const s = calculateScore(60_000, 'serbest', 0, false)
      expect(s.baseScore).toBe(10)
      expect(s.totalScore).toBe(10)
    })
  })

  describe('calculateScore — temel puan', () => {
    it('10 dakika serbest → 100 temel puan', () => {
      const s = calculateScore(10 * 60_000, 'serbest', 0, false)
      expect(s.baseScore).toBe(100)
      expect(s.totalScore).toBe(100)
    })
    it('60 dakika serbest → 600 temel puan', () => {
      const s = calculateScore(60 * 60_000, 'serbest', 0, false)
      expect(s.baseScore).toBe(600)
      expect(s.totalScore).toBe(600)
    })
  })

  describe('calculateScore — tamamlama bonusu', () => {
    it('serbest modda tamamlama bonusu yok', () => {
      const s = calculateScore(60 * 60_000, 'serbest', 0, true)
      expect(s.completionBonus).toBe(0)
    })
    it('ders60mola15 tam tamamlama → +50 bonus', () => {
      const s = calculateScore(60 * 60_000, 'ders60mola15', 0, true)
      expect(s.completionBonus).toBe(50)
      expect(s.totalScore).toBe(600 + 50) // baseScore + completion
    })
    it('ders60mola15 erken bitirme → bonus yok', () => {
      const s = calculateScore(30 * 60_000, 'ders60mola15', 0, false)
      expect(s.completionBonus).toBe(0)
      expect(s.baseScore).toBe(300)
      expect(s.totalScore).toBe(300)
    })
    it('gerisayim tam tamamlama → +50 bonus', () => {
      const s = calculateScore(40 * 60_000, 'gerisayim', 0, true)
      expect(s.completionBonus).toBe(50)
    })
    it('deneme tam tamamlama → +50 bonus', () => {
      const s = calculateScore(90 * 60_000, 'deneme', 0, true)
      expect(s.completionBonus).toBe(50)
    })
  })

  describe('calculateScore — tur çarpanı', () => {
    it('ilk tur (0 önceki tur) → çarpan 1.0', () => {
      const s = calculateScore(10 * 60_000, 'ders60mola15', 0, false, 0)
      expect(s.roundMultiplier).toBe(1.0)
      expect(s.roundBonusPoints).toBe(0)
      expect(s.totalScore).toBe(100)
    })
    it('2. tur (1 önceki tur) → çarpan 1.2 = %120', () => {
      const s = calculateScore(10 * 60_000, 'ders60mola15', 0, false, 1)
      expect(s.roundMultiplier).toBeCloseTo(1.2)
      expect(s.totalScore).toBe(120) // 100 * 1.2
    })
    it('3. tur (2 önceki tur) → çarpan 1.4 = %140', () => {
      const s = calculateScore(10 * 60_000, 'ders60mola15', 0, false, 2)
      expect(s.roundMultiplier).toBeCloseTo(1.4)
      expect(s.totalScore).toBe(140) // 100 * 1.4
    })
    it('çarpan + tamamlama bonusu birlikte', () => {
      // 60dk = 600 baz + 50 bonus = 650, × 1.2 → 780
      const s = calculateScore(60 * 60_000, 'ders60mola15', 0, true, 1)
      expect(s.baseScore).toBe(600)
      expect(s.completionBonus).toBe(50)
      expect(s.roundMultiplier).toBeCloseTo(1.2)
      expect(s.totalScore).toBe(780) // 650 * 1.2 = 780
    })
  })

  describe('calculateScore — duraklatma cezası', () => {
    it('2 duraklatma → -10 ceza', () => {
      const s = calculateScore(10 * 60_000, 'serbest', 2, false)
      expect(s.pausePenalty).toBe(10)
      expect(s.totalScore).toBe(90) // 100 - 10
    })
    it('ceza temel puanı aşamaz (negatif olmaz)', () => {
      const s = calculateScore(60_000, 'serbest', 3, false) // 10 - 15 = -5 → 0
      expect(s.totalScore).toBe(0)
    })
  })

  describe('calculateScore — seri bonusu', () => {
    it('3 gün seri → +15 bonus', () => {
      const s = calculateScore(10 * 60_000, 'serbest', 0, false, 0, 3)
      expect(s.streakBonus).toBe(15)
      expect(s.totalScore).toBe(115) // 100 + 15
    })
    it('seri bonusu tur çarpanından bağımsız', () => {
      // 100 baz × 1.2 çarpan = 120, + 25 seri = 145
      const s = calculateScore(10 * 60_000, 'serbest', 0, false, 1, 5)
      expect(s.roundBonusPoints).toBe(20) // 100 * 0.2
      expect(s.streakBonus).toBe(25)
      expect(s.totalScore).toBe(145) // 120 + 25
    })
  })

  describe('calculateScore — tam entegrasyon', () => {
    it('60dk ders60mola15, tam, 2. tur, 5 seri, 1 pause', () => {
      // baz=600, comp=50, çarpan öncesi=600+50-5=645, çarpan=1.2 → 774, seri=25 → 799
      const s = calculateScore(60 * 60_000, 'ders60mola15', 1, true, 1, 5)
      expect(s.baseScore).toBe(600)
      expect(s.completionBonus).toBe(50)
      expect(s.pausePenalty).toBe(5)
      expect(s.roundMultiplier).toBeCloseTo(1.2)
      expect(s.totalScore).toBe(799) // round(645 * 1.2 + 25)
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
