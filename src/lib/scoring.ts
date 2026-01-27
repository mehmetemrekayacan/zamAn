import type { SessionRecord, Mode } from '../types'

/**
 * Puan Hesaplama Sistemi
 * 
 * Bileşenler:
 * 1. Temel Puan: Geçen Dakika × Mode Katsayısı
 * 2. Duraklatma Cezası: -5, -10, -20
 * 3. Erken Bitirme Bonusu: +max 20
 * 4. Odak Bonusu: Düşük duraklatma = bonus
 * 5. Seri Bonusu: Ardışık günler = +5 per gün
 * 6. Hız Bonusu: Planlanandan hızlı bitirme
 */

export interface ScoreBreakdown {
  baseScore: number
  pausePenalty: number
  earlyCompletionBonus: number
  focusBonus: number
  streakBonus: number
  totalScore: number
}

export interface SessionScoreDetail extends ScoreBreakdown {
  mode: string
  elapsedMinutes: number
  plannedMinutes?: number
  pauses: number
  consistency: number // 0-100 (Oransal başarı)
}

// Mode katsayıları
const MODE_COEFFICIENTS: Record<Mode, number> = {
  serbest: 0.8,
  gerisayim: 1.2,
  pomodoro: 1.1,
  deneme: 1.3,
}

/**
 * Temel puan hesapla (dakika × mode katsayısı)
 */
export function calculateBaseScore(elapsedMinutes: number, mode: Mode): number {
  const coefficient = MODE_COEFFICIENTS[mode] ?? 1.0
  return Math.floor(elapsedMinutes * coefficient)
}

/**
 * Duraklatma cezası hesapla
 * 1 duraklatma: -5
 * 2 duraklatma: -10
 * 3+ duraklatma: -20
 */
export function calculatePausePenalty(pauses: number): number {
  if (pauses === 1) return 5
  if (pauses === 2) return 10
  if (pauses >= 3) return 20
  return 0
}

/**
 * Erken bitirme bonusu hesapla (max 20)
 */
export function calculateEarlyCompletionBonus(
  elapsedMinutes: number,
  plannedMinutes?: number
): number {
  if (!plannedMinutes || elapsedMinutes >= plannedMinutes) return 0
  const saved = plannedMinutes - elapsedMinutes
  return Math.min(Math.floor(saved), 20)
}

/**
 * Odak bonusu hesapla (duraklatma az = bonus)
 * 0 duraklatma: +15 (Mükemmel odak)
 * 1 duraklatma: +5 (İyi)
 * 2+ duraklatma: 0 (Normal)
 */
export function calculateFocusBonus(pauses: number): number {
  if (pauses === 0) return 15
  if (pauses === 1) return 5
  return 0
}

/**
 * Seri bonusu hesapla (ardışık gün sayısı × 5, max 50)
 * Kullanan, her gün minimum 1 seans yaptığı gün sayısını giriyor
 */
export function calculateStreakBonus(streakDays: number): number {
  if (streakDays <= 0) return 0
  return Math.min(streakDays * 5, 50)
}

/**
 * Konsistans puanı hesapla (0-100)
 * Planlanan süreyle gerçek süreyi karşılaştır
 */
export function calculateConsistency(
  elapsedMinutes: number,
  plannedMinutes?: number
): number {
  if (!plannedMinutes) return 100 // Plansız ise mükemmel
  const ratio = (elapsedMinutes / plannedMinutes) * 100
  return Math.min(Math.round(ratio), 100)
}

/**
 * Tam puan hesaplama (tüm faktörler)
 * @param elapsedMinutes Geçen dakika
 * @param mode Seans modu
 * @param pauses Duraklatma sayısı
 * @param plannedMinutes Planlanan dakika (opsiyonel)
 * @param streakDays Ardışık gün sayısı (opsiyonel)
 */
export function calculateScore(
  elapsedMinutes: number,
  mode: Mode,
  pauses: number,
  plannedMinutes?: number,
  streakDays: number = 0
): ScoreBreakdown {
  const baseScore = calculateBaseScore(elapsedMinutes, mode)
  const pausePenalty = calculatePausePenalty(pauses)
  const earlyCompletionBonus = calculateEarlyCompletionBonus(elapsedMinutes, plannedMinutes)
  const focusBonus = calculateFocusBonus(pauses)
  const streakBonus = calculateStreakBonus(streakDays)

  const totalScore = Math.max(0, baseScore - pausePenalty + earlyCompletionBonus + focusBonus + streakBonus)

  return {
    baseScore,
    pausePenalty,
    earlyCompletionBonus,
    focusBonus,
    streakBonus,
    totalScore,
  }
}

/**
 * Detaylı seans puanı hesapla
 */
export function calculateSessionScoreDetail(
  elapsedMinutes: number,
  mode: Mode,
  pauses: number,
  plannedMinutes?: number,
  streakDays: number = 0
): SessionScoreDetail {
  const score = calculateScore(elapsedMinutes, mode, pauses, plannedMinutes, streakDays)
  const consistency = calculateConsistency(elapsedMinutes, plannedMinutes)

  return {
    ...score,
    mode,
    elapsedMinutes,
    plannedMinutes,
    pauses,
    consistency,
  }
}

/**
 * Bugünün seri bonusu hesapla (örn: seanslar dizisinde kaç gün seri yapıldı)
 */
export function calculateTodayStreakBonus(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0

  const today = new Date().toISOString().split('T')[0]
  const todaySessions = sessions.filter(s => s.tarihISO.startsWith(today))

  // Bugün seans var mı?
  if (todaySessions.length === 0) return 0

  // Seri sayıp geçmiş günleri kontrol et
  let streak = 1
  let checkDate = new Date(today)

  // Geri doğru git ve her gün kontrol et
  for (let i = 1; i <= 365; i++) {
    checkDate.setDate(checkDate.getDate() - 1)
    const checkDateStr = checkDate.toISOString().split('T')[0]
    const hasSessions = sessions.some(s => s.tarihISO.startsWith(checkDateStr))

    if (hasSessions) {
      streak++
    } else {
      break // Seri kesildi
    }
  }

  return Math.min(streak * 5, 50)
}

/**
 * Toplam bugün dakikası hesapla
 */
export function getTotalTodayMinutes(sessions: SessionRecord[]): number {
  const today = new Date().toISOString().split('T')[0]
  return sessions
    .filter(s => s.tarihISO.startsWith(today))
    .reduce((sum, s) => sum + (s.sureGercek || 0), 0)
}

/**
 * Toplam bugün puanı hesapla
 */
export function getTotalTodayScore(sessions: SessionRecord[]): number {
  const today = new Date().toISOString().split('T')[0]
  return sessions
    .filter(s => s.tarihISO.startsWith(today))
    .reduce((sum, s) => sum + s.puan, 0)
}

/**
 * Moda göre istatistik hesapla
 */
export function getModeStatistics(sessions: SessionRecord[]) {
  const stats: Record<string, { count: number; totalMinutes: number; totalScore: number; avgScore: number }> = {}

  sessions.forEach(s => {
    if (!stats[s.mod]) {
      stats[s.mod] = { count: 0, totalMinutes: 0, totalScore: 0, avgScore: 0 }
    }
    stats[s.mod].count++
    stats[s.mod].totalMinutes += s.sureGercek || 0
    stats[s.mod].totalScore += s.puan
  })

  // Ortalama hesapla
  Object.values(stats).forEach(stat => {
    stat.avgScore = stat.count > 0 ? Math.round(stat.totalScore / stat.count) : 0
  })

  return stats
}

/**
 * En iyi seans bul
 */
export function getBestSession(sessions: SessionRecord[]): SessionRecord | null {
  if (sessions.length === 0) return null
  return sessions.reduce((best, current) => (current.puan > best.puan ? current : best))
}

/**
 * En kötü seans bul
 */
export function getWorstSession(sessions: SessionRecord[]): SessionRecord | null {
  if (sessions.length === 0) return null
  return sessions.reduce((worst, current) => (current.puan < worst.puan ? current : worst))
}

/**
 * Ortalama seans puanı
 */
export function getAverageScore(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0
  const total = sessions.reduce((sum, s) => sum + s.puan, 0)
  return Math.round(total / sessions.length)
}

