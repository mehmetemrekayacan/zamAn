import type { SessionRecord, Mode } from '../types'
import { getLocalDateString } from './time'

/**
 * Gelişmiş Puanlama Sistemi v2
 *
 * Kurallar:
 * 1. Baraj: Geçen süre < 1 dakika → puan = 0
 * 2. Temel Puan: Her dakika = 10 puan
 * 3. Tamamlama Bonusu: Planlı modu (60/15, gerisayım, deneme) tam tamamlama = +50
 * 4. Tur Çarpanı: Toplam = (Temel + Bonus - Ceza) × (1 + tamamlananTur × 0.2)
 *    Örnek: 1. Tur %100, 2. Tur %120, 3. Tur %140
 * 5. Seri Bonusu: Ardışık gün × 5, maks 50
 */

/** Sabitler */
const BASE_POINTS_PER_MINUTE = 10
const COMPLETION_BONUS = 50
const MIN_ELAPSED_MS = 60_000 // 1 dakika baraj
const MAX_PAUSE_PENALTY = 15
const POMODORO_OVERTIME_POINTS_PER_MINUTE = 5
const DERS6015_DEFAULT_PLANNED_MS = 60 * 60_000

export interface ScoreBreakdown {
  /** Dakika × 10 */
  baseScore: number
  /** ders60mola15: overtime dakika bonusu */
  overtimeBonus: number
  /** Planlı modu eksiksiz tamamlama bonusu */
  completionBonus: number
  /** Tur çarpanı (1.0, 1.2, 1.4 …) */
  roundMultiplier: number
  /** Tur çarpanından gelen ek puan */
  roundBonusPoints: number
  /** Duraklatma cezası */
  pausePenalty: number
  /** Ardışık gün seri bonusu */
  streakBonus: number
  /** Son toplam */
  totalScore: number
}

/**
 * Duraklatma cezası: 1→-5, 2→-10, 3+→-15
 */
export function calculatePausePenalty(pauses: number): number {
  if (pauses <= 0) return 0
  if (pauses === 1) return 5
  if (pauses === 2) return 10
  return MAX_PAUSE_PENALTY
}

/**
 * Seri bonusu: günlük seri × 5, maks 50
 */
export function calculateStreakBonus(streakDays: number): number {
  if (streakDays <= 0) return 0
  return Math.min(streakDays * 5, 50)
}

/**
 * Ardışık gün serisi hesapla.
 * @param sessions Seans dizisi
 * @param todayHasSessions Bugün seans var mı (opsiyonel — verilmezse sessions'tan bakılır)
 */
export function calculateStreak(sessions: SessionRecord[], todayHasSessions?: boolean): number {
  const today = getLocalDateString()
  const hasTodaySession = todayHasSessions ?? sessions.some(s => s.tarihISO.startsWith(today))
  if (!hasTodaySession) return 0

  let streak = 1
  const checkDate = new Date()
  checkDate.setHours(0, 0, 0, 0)

  for (let i = 1; i <= 365; i++) {
    checkDate.setDate(checkDate.getDate() - 1)
    const checkDateStr = getLocalDateString(checkDate)
    const hasSessions = sessions.some(s => s.tarihISO.startsWith(checkDateStr))
    if (hasSessions) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/**
 * Tam puanlama hesaplama (v2)
 *
 * @param elapsedMs Geçen süre (milisaniye)
 * @param mode Seans modu
 * @param pauses Duraklatma sayısı
 * @param isFullCompletion Planlı süre eksiksiz tamamlandı mı?
 * @param todayCompletedRounds Bugün bu modda daha önce tamamlanan tur sayısı (0-based)
 * @param streakDays Ardışık gün serisi
 */
export function calculateScore(
  elapsedMs: number,
  mode: Mode,
  pauses: number,
  isFullCompletion: boolean,
  todayCompletedRounds: number = 0,
  streakDays: number = 0,
  plannedMs?: number,
  overtimeDurationMs?: number,
): ScoreBreakdown {
  const empty: ScoreBreakdown = {
    baseScore: 0,
    overtimeBonus: 0,
    completionBonus: 0,
    roundMultiplier: 1,
    roundBonusPoints: 0,
    pausePenalty: 0,
    streakBonus: 0,
    totalScore: 0,
  }

  // Baraj: < 1 dakika → 0 puan
  if (elapsedMs < MIN_ELAPSED_MS) return empty

  const minutes = Math.floor(elapsedMs / 60_000)
  const baseScore = minutes * BASE_POINTS_PER_MINUTE

  // 60/15 overtime bonusu: dakika başına +5
  let overtimeBonus = 0
  if (mode === 'ders60mola15') {
    const resolvedPlannedMs = plannedMs ?? DERS6015_DEFAULT_PLANNED_MS
    const overtimeMs = Math.max(0, overtimeDurationMs ?? (elapsedMs - resolvedPlannedMs))
    const overtimeMinutes = Math.floor(overtimeMs / 60_000)
    overtimeBonus = overtimeMinutes * POMODORO_OVERTIME_POINTS_PER_MINUTE
  }

  // Tamamlama bonusu: sadece planlı modlarda (serbest hariç) tam tamamlama
  const completionBonus = isFullCompletion && mode !== 'serbest' ? COMPLETION_BONUS : 0

  // Duraklatma cezası
  const pausePenalty = calculatePausePenalty(pauses)

  // Tur çarpanı: 1 + tamamlananTur × 0.2
  const roundMultiplier = 1 + todayCompletedRounds * 0.2

  // Ara toplam (çarpan öncesi)
  const subtotal = Math.max(0, baseScore + overtimeBonus + completionBonus - pausePenalty)
  const afterRound = subtotal * roundMultiplier
  const roundBonusPoints = Math.round(afterRound - subtotal)

  // Seri bonusu (çarpandan bağımsız)
  const streakBonus = calculateStreakBonus(streakDays)

  const totalScore = Math.max(0, Math.round(afterRound + streakBonus))

  return {
    baseScore,
    overtimeBonus,
    completionBonus,
    roundMultiplier,
    roundBonusPoints,
    pausePenalty,
    streakBonus,
    totalScore,
  }
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

