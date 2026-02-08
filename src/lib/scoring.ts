import type { SessionRecord, Mode } from '../types'
import { getLocalDateString } from './time'

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
  elapsedSeconds: number
  plannedSeconds?: number
  pauses: number
  consistency: number // 0-100 (Oransal başarı)
}

// Mode katsayıları
const MODE_COEFFICIENTS: Record<Mode, number> = {
  serbest: 0.8,
  gerisayim: 1.2,
  ders60mola15: 1.15,
  deneme: 1.3,
}

/**
 * Temel puan hesapla (saniye/60 × mode katsayısı — 1 dakika = 1 puan baz)
 */
export function calculateBaseScore(elapsedSeconds: number, mode: Mode): number {
  const coefficient = MODE_COEFFICIENTS[mode] ?? 1.0
  return Math.floor((elapsedSeconds / 60) * coefficient)
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
  elapsedSeconds: number,
  plannedSeconds?: number
): number {
  if (!plannedSeconds || elapsedSeconds >= plannedSeconds) return 0
  const savedMinutes = (plannedSeconds - elapsedSeconds) / 60
  return Math.min(Math.floor(savedMinutes), 20)
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
  elapsedSeconds: number,
  plannedSeconds?: number
): number {
  if (!plannedSeconds) return 100 // Plansız ise mükemmel
  const ratio = (elapsedSeconds / plannedSeconds) * 100
  return Math.min(Math.round(ratio), 100)
}

/** Minimum süre (sn): odak ve seri bonusları sadece bu süreden sonra uygulanır. 3 sn'de 20 puan vermeyi önler. */
const MIN_ELAPSED_FOR_BONUSES = 60

/**
 * Tam puan hesaplama (tüm faktörler)
 * @param elapsedSeconds Geçen süre (saniye)
 * @param mode Seans modu
 * @param pauses Duraklatma sayısı
 * @param plannedSeconds Planlanan süre saniye (opsiyonel)
 * @param streakDays Ardışık gün sayısı (opsiyonel)
 */
export function calculateScore(
  elapsedSeconds: number,
  mode: Mode,
  pauses: number,
  plannedSeconds?: number,
  streakDays: number = 0
): ScoreBreakdown {
  const baseScore = calculateBaseScore(elapsedSeconds, mode)
  const pausePenalty = calculatePausePenalty(pauses)
  const earlyCompletionBonus = calculateEarlyCompletionBonus(elapsedSeconds, plannedSeconds)
  const bonusesApply = elapsedSeconds >= MIN_ELAPSED_FOR_BONUSES
  const focusBonus = bonusesApply ? calculateFocusBonus(pauses) : 0
  const streakBonus = bonusesApply ? calculateStreakBonus(streakDays) : 0

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
  elapsedSeconds: number,
  mode: Mode,
  pauses: number,
  plannedSeconds?: number,
  streakDays: number = 0
): SessionScoreDetail {
  const score = calculateScore(elapsedSeconds, mode, pauses, plannedSeconds, streakDays)
  const consistency = calculateConsistency(elapsedSeconds, plannedSeconds)

  return {
    ...score,
    mode,
    elapsedSeconds,
    plannedSeconds,
    pauses,
    consistency,
  }
}

/**
 * Bugünün seri bonusu hesapla (örn: seanslar dizisinde kaç gün seri yapıldı)
 */
export function calculateTodayStreakBonus(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0

  const today = getLocalDateString()
  const todaySessions = sessions.filter(s => getLocalDateString(new Date(s.tarihISO)) === today)

  // Bugün seans var mı?
  if (todaySessions.length === 0) return 0

  // Seri sayıp geçmiş günleri kontrol et
  let streak = 1
  let checkDate = new Date()
  checkDate.setHours(0, 0, 0, 0)

  // Geri doğru git ve her gün kontrol et
  for (let i = 1; i <= 365; i++) {
    checkDate.setDate(checkDate.getDate() - 1)
    const checkDateStr = getLocalDateString(checkDate)
    const hasSessions = sessions.some(s => getLocalDateString(new Date(s.tarihISO)) === checkDateStr)

    if (hasSessions) {
      streak++
    } else {
      break // Seri kesildi
    }
  }

  return Math.min(streak * 5, 50)
}

/**
 * Toplam bugün saniyesi hesapla
 */
export function getTotalTodaySeconds(sessions: SessionRecord[]): number {
  const today = getLocalDateString()
  return sessions
    .filter(s => getLocalDateString(new Date(s.tarihISO)) === today)
    .reduce((sum, s) => sum + (s.sureGercek || 0), 0)
}

/**
 * Toplam bugün puanı hesapla
 */
export function getTotalTodayScore(sessions: SessionRecord[]): number {
  const today = getLocalDateString()
  return sessions
    .filter(s => getLocalDateString(new Date(s.tarihISO)) === today)
    .reduce((sum, s) => sum + s.puan, 0)
}

/**
 * Moda göre istatistik hesapla
 */
export function getModeStatistics(sessions: SessionRecord[]) {
  const stats: Record<string, { count: number; totalSeconds: number; totalScore: number; avgScore: number }> = {}

  sessions.forEach(s => {
    if (!stats[s.mod]) {
      stats[s.mod] = { count: 0, totalSeconds: 0, totalScore: 0, avgScore: 0 }
    }
    stats[s.mod].count++
    stats[s.mod].totalSeconds += s.sureGercek || 0
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

/** Ünvan eşikleri: ~120 gün düzenli çalışma (5h/gün, 1 deneme) son ünvana ulaştırır. Sınavdan ~40 gün önce. */
export const UNVAN_ESIKLERI: {
  puan: number
  unvan: string
  profilEmoji: string
  temaClass: string
  aciklama: string
}[] = [
  { puan: 0, unvan: 'İlk Adım', profilEmoji: '🌱', temaClass: 'tier-caylak', aciklama: 'Sınav yolculuğunun başlangıcı' },
  { puan: 2500, unvan: 'Sınav Adayı', profilEmoji: '📖', temaClass: 'tier-ady', aciklama: 'KPSS ve alan sınavlarına adım adım hazırlanıyorsun' },
  { puan: 7500, unvan: 'Öğretmen Adayı', profilEmoji: '📐', temaClass: 'tier-gozcu', aciklama: 'İlköğretim matematik öğretmenliği yolunda ilerliyorsun' },
  { puan: 15000, unvan: 'Matematik Uzmanı', profilEmoji: '⭐', temaClass: 'tier-uzman', aciklama: 'Alan bilgisi ve öğretim becerisi güçleniyor' },
  { puan: 30000, unvan: 'İlköğretim Matematikçi', profilEmoji: '🏆', temaClass: 'tier-kahraman', aciklama: 'Hedef mesleğe çok yakınsın!' },
  { puan: 45000, unvan: 'Usta Öğretmen', profilEmoji: '👑', temaClass: 'tier-efsane', aciklama: 'İlköğretim matematiğinde usta seviye' },
]

export interface UnvanBilgisi {
  unvan: string
  toplamPuan: number
  sonrakiUnvan: string | null
  sonrakiPuan: number | null
  ilerlemeYuzde: number | null
  profilEmoji: string
  temaClass: string
  /** İleride açılacak tüm üst seviyeler (motivasyon listesi) */
  ileridekiler: { puan: number; unvan: string; profilEmoji: string; temaClass: string; aciklama: string }[]
}

/**
 * Toplam kariyer puanına göre mevcut ünvan ve bir sonrakine yakınlık
 */
export function getUnvan(toplamPuan: number): UnvanBilgisi {
  const esikler = UNVAN_ESIKLERI
  let mevcut = esikler[0]
  let sonraki: (typeof esikler)[0] | null = null
  for (let i = 0; i < esikler.length; i++) {
    if (toplamPuan >= esikler[i].puan) mevcut = esikler[i]
    if (esikler[i].puan > toplamPuan && !sonraki) sonraki = esikler[i]
  }
  let ilerlemeYuzde: number | null = null
  if (sonraki) {
    const aralik = sonraki.puan - mevcut.puan
    const gidilen = toplamPuan - mevcut.puan
    ilerlemeYuzde = aralik > 0 ? Math.min(100, Math.round((gidilen / aralik) * 100)) : 100
  }
  const ileridekiler = esikler.filter((e) => e.puan > toplamPuan)
  return {
    unvan: mevcut.unvan,
    toplamPuan,
    sonrakiUnvan: sonraki?.unvan ?? null,
    sonrakiPuan: sonraki?.puan ?? null,
    ilerlemeYuzde,
    profilEmoji: mevcut.profilEmoji,
    temaClass: mevcut.temaClass,
    ileridekiler: ileridekiler.map((e) => ({
      puan: e.puan,
      unvan: e.unvan,
      profilEmoji: e.profilEmoji,
      temaClass: e.temaClass,
      aciklama: e.aciklama,
    })),
  }
}

