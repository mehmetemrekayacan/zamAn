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

export interface TitleTier {
  name: string
  minScore: number
}

/**
 * Genel ünvan ilerlemesi (~3 aylık yoğun çalışmada son seviyeye yaklaşır).
 * Bu dizi diğer bileşenlerde kullanılabilmesi için dışa aktarılır.
 */
export const TITLES: TitleTier[] = [
  { name: 'Çaylak', minScore: 0 },
  { name: 'Acemi Çalışkan', minScore: 250 },
  { name: 'Odaklanmış Öğrenci', minScore: 750 },
  { name: 'İstikrarlı Çırak', minScore: 1500 },
  { name: 'Gelişen Zihin', minScore: 2500 },
  { name: 'Azimli Yolcu', minScore: 4000 },
  { name: 'Bilgi Arayıcı', minScore: 6000 },
  { name: 'Kararlı Savaşçı', minScore: 8500 },
  { name: 'Disiplin Ustası', minScore: 11500 },
  { name: 'Başarı Avcısı', minScore: 15000 },
  { name: 'Zaman Bükücü', minScore: 19000 },
  { name: 'Odak Şövalyesi', minScore: 23500 },
  { name: 'Çalışma Makinesi', minScore: 28500 },
  { name: 'Bilgelik Sırdaşı', minScore: 34000 },
  { name: 'Sınav Fatihi', minScore: 40000 },
  { name: 'Üstün Zekâ', minScore: 46500 },
  { name: 'Elit Stratejist', minScore: 53500 },
  { name: 'Yenilmez İrade', minScore: 61000 },
  { name: 'Efsanevi Odak', minScore: 69000 },
  { name: 'Zirvenin Hâkimi', minScore: 78000 },
]

const TITLE_EMOJIS = ['🌱', '🧩', '📘', '🛠️', '🧠', '🧭', '🔎', '⚔️', '🧱', '🎯', '⏳', '🛡️', '⚙️', '📚', '🏅', '💡', '♟️', '🔥', '🌟', '👑'] as const

function getTierClassByIndex(index: number): string {
  if (index <= 2) return 'tier-caylak'
  if (index <= 6) return 'tier-ady'
  if (index <= 10) return 'tier-gozcu'
  if (index <= 14) return 'tier-uzman'
  if (index <= 17) return 'tier-kahraman'
  return 'tier-efsane'
}

function getTitleMeta(index: number) {
  const title = TITLES[index]
  return {
    profilEmoji: TITLE_EMOJIS[index] ?? '🏅',
    temaClass: getTierClassByIndex(index),
    aciklama: `${title.name} seviyesine ulaştın.`,
  }
}

export function getCurrentTitle(totalScore: number): TitleTier {
  const score = Math.max(0, totalScore)
  let current = TITLES[0]
  for (let i = 0; i < TITLES.length; i++) {
    if (score >= TITLES[i].minScore) {
      current = TITLES[i]
    } else {
      break
    }
  }
  return current
}

export function getNextTitle(totalScore: number): TitleTier | null {
  const score = Math.max(0, totalScore)
  return TITLES.find((title) => title.minScore > score) ?? null
}

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
  const score = Math.max(0, toplamPuan)
  const mevcut = getCurrentTitle(score)
  const sonraki = getNextTitle(score)

  const mevcutIndex = TITLES.findIndex((title) => title.name === mevcut.name)
  const mevcutMeta = getTitleMeta(Math.max(0, mevcutIndex))

  let ilerlemeYuzde: number | null = null
  if (sonraki) {
    const aralik = sonraki.minScore - mevcut.minScore
    const gidilen = score - mevcut.minScore
    ilerlemeYuzde = aralik > 0 ? Math.min(100, Math.round((gidilen / aralik) * 100)) : 100
  }
  const ileridekiler = TITLES
    .map((title, index) => ({ title, index }))
    .filter(({ title }) => title.minScore > score)

  return {
    unvan: mevcut.name,
    toplamPuan: score,
    sonrakiUnvan: sonraki?.name ?? null,
    sonrakiPuan: sonraki?.minScore ?? null,
    ilerlemeYuzde,
    profilEmoji: mevcutMeta.profilEmoji,
    temaClass: mevcutMeta.temaClass,
    ileridekiler: ileridekiler.map((e) => ({
      puan: e.title.minScore,
      unvan: e.title.name,
      profilEmoji: getTitleMeta(e.index).profilEmoji,
      temaClass: getTitleMeta(e.index).temaClass,
      aciklama: getTitleMeta(e.index).aciklama,
    })),
  }
}

