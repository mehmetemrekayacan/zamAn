import type { SessionRecord } from '../types'
import { getLocalDateString } from './time'

export type RozetId =
  | 'ilk_seans'
  | 'ilk_5_saatlik_gun'
  | 'ilk_1000_puan'
  | 'puan_10000'
  | 'seri_3'
  | 'seri_7'
  | 'seri_14'
  | 'seri_30'
  | 'deneme_5'
  | 'deneme_10'
  | 'deneme_50'
  | 'hedef_gun_5'
  | 'hedef_gun_15'
  | 'hedef_gun_30'
  | 'hedef_150_saat'
  | 'hedef_500_saat'
  | 'maratoncu'
  | 'gece_kusu'
  | 'erkenci_kus'
  | 'pomodoro_50'

export interface Rozet {
  id: RozetId
  ad: string
  emoji: string
  aciklama: string
  kazanildi: boolean
}

interface SummaryForRozet {
  gunluk5SaatGunSayisi: number
  streak: number
  toplamKariyerPuan: number
  monthSeconds: number
  sessions: SessionRecord[]
}

function localDateToDayNumber(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / (24 * 60 * 60 * 1000))
}

function getSessionEndDate(session: SessionRecord): Date {
  const rawTimestamp = (session as SessionRecord & { timestamp?: string | number }).timestamp
  if (session.createdAt) return new Date(session.createdAt)
  if (typeof rawTimestamp === 'number') return new Date(rawTimestamp)
  if (typeof rawTimestamp === 'string') return new Date(rawTimestamp)
  return new Date(session.tarihISO)
}

/** Tarihteki en uzun ardışık gün serisini hesapla (rozetler için) */
function enUzunSeri(sessions: SessionRecord[]): number {
  const gunler = new Set<string>()
  sessions.forEach((s) => gunler.add(getLocalDateString(getSessionEndDate(s))))
  const sorted = [...gunler].sort((a, b) => localDateToDayNumber(a) - localDateToDayNumber(b))
  if (sorted.length === 0) return 0
  let max = 1
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = localDateToDayNumber(sorted[i - 1])
    const curr = localDateToDayNumber(sorted[i])
    const diffDays = curr - prev
    if (diffDays === 1) {
      current++
      max = Math.max(max, current)
    } else {
      current = 1
    }
  }
  return max
}

export function getRozetler(summary: SummaryForRozet): Rozet[] {
  const { gunluk5SaatGunSayisi, streak, toplamKariyerPuan, monthSeconds, sessions } = summary
  const denemeSayisi = sessions.filter((s) => s.mod === 'deneme').length

  const gunlukSnByDate: Record<string, number> = {}
  sessions.forEach((s) => {
    const d = getLocalDateString(getSessionEndDate(s))
    gunlukSnByDate[d] = (gunlukSnByDate[d] ?? 0) + (s.sureGercek ?? 0)
  })

  const HEDEF_5_SAAT_SN = 5 * 3600
  const MIN_180_DK_SN = 180 * 60

  const besSaatlikGunSayisi = Object.values(gunlukSnByDate).filter((sn) => sn >= HEDEF_5_SAAT_SN).length
  const hedefGunToplam = Math.max(gunluk5SaatGunSayisi, besSaatlikGunSayisi)

  const toplamCalismaSaniye = sessions.reduce((acc, s) => acc + (s.sureGercek ?? 0), 0)
  const toplamPuan = Math.max(toplamKariyerPuan, sessions.reduce((acc, s) => acc + (s.puan ?? 0), 0))

  const maratoncu = sessions.some((s) => (s.sureGercek ?? 0) >= MIN_180_DK_SN)
  const pomodoroSayisi = sessions.filter((s) => s.mod === 'ders60mola15' || (s.mod as unknown as string) === '60/15').length

  const geceKusu = sessions.some((s) => {
    const d = getSessionEndDate(s)
    const minuteOfDay = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
    return minuteOfDay > 0 && minuteOfDay < 4 * 60
  })

  const erkenciKus = sessions.some((s) => {
    const d = getSessionEndDate(s)
    const minuteOfDay = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
    return minuteOfDay > 4 * 60 && minuteOfDay < 7 * 60
  })

  /** Seri rozetleri: mevcut streak VEYA tarihteki en uzun seri (hangisi büyükse) */
  const seriDeger = Math.max(streak, enUzunSeri(sessions))

  const list: Rozet[] = [
    { id: 'ilk_seans', ad: 'İlk Seans', emoji: '🎯', aciklama: 'İlk seansını tamamladın', kazanildi: sessions.length >= 1 },
    { id: 'ilk_5_saatlik_gun', ad: 'İlk 5 Saatlik Gün', emoji: '📚', aciklama: 'Bir günde 5+ saat çalıştın', kazanildi: besSaatlikGunSayisi >= 1 },
    { id: 'ilk_1000_puan', ad: 'İlk 1000 Puan', emoji: '⭐', aciklama: '1000 kariyer puanına ulaştın', kazanildi: toplamPuan >= 1000 },
    { id: 'puan_10000', ad: '10.000 Puan', emoji: '💯', aciklama: '10.000 toplam puana ulaştın', kazanildi: toplamPuan >= 10000 },
    { id: 'seri_3', ad: '3 Gün Seri', emoji: '🔥', aciklama: '3 ardışık gün çalıştın', kazanildi: seriDeger >= 3 },
    { id: 'seri_7', ad: '7 Gün Seri', emoji: '🔥🔥', aciklama: '7 ardışık gün çalıştın', kazanildi: seriDeger >= 7 },
    { id: 'seri_14', ad: '14 Gün Seri', emoji: '🔥🔥🔥', aciklama: '14 ardışık gün çalıştın', kazanildi: seriDeger >= 14 },
    { id: 'seri_30', ad: '30 Gün Seri', emoji: '🗓️', aciklama: '30 ardışık gün çalıştın', kazanildi: seriDeger >= 30 },
    { id: 'deneme_5', ad: '5 Deneme', emoji: '📋', aciklama: '5 deneme sınavı tamamladın', kazanildi: denemeSayisi >= 5 },
    { id: 'deneme_10', ad: '10 Deneme', emoji: '📋📋', aciklama: '10 deneme sınavı tamamladın', kazanildi: denemeSayisi >= 10 },
    { id: 'deneme_50', ad: '50 Deneme', emoji: '🧪', aciklama: '50 deneme sınavı tamamladın', kazanildi: denemeSayisi >= 50 },
    { id: 'hedef_gun_5', ad: '5 Hedef Gün', emoji: '🎯', aciklama: 'Toplam 5 gün 5+ saat çalıştın', kazanildi: hedefGunToplam >= 5 },
    { id: 'hedef_gun_15', ad: '15 Hedef Gün', emoji: '🏅', aciklama: 'Toplam 15 gün 5+ saat çalıştın', kazanildi: hedefGunToplam >= 15 },
    { id: 'hedef_gun_30', ad: '30 Hedef Gün', emoji: '🥇', aciklama: 'Toplam 30 gün 5+ saat çalıştın', kazanildi: hedefGunToplam >= 30 },
    { id: 'hedef_150_saat', ad: '150 Saat', emoji: '👑', aciklama: 'Ayda 150 saat çalıştın', kazanildi: monthSeconds >= 150 * 3600 },
    { id: 'hedef_500_saat', ad: '500 Saat', emoji: '⏳', aciklama: 'Toplam 500 saat çalıştın', kazanildi: toplamCalismaSaniye >= 500 * 3600 },
    { id: 'maratoncu', ad: 'Maratoncu', emoji: '🏃', aciklama: '180+ dakikalık tek bir seans tamamladın', kazanildi: maratoncu },
    { id: 'gece_kusu', ad: 'Gece Kuşu', emoji: '🦉', aciklama: '00:00 - 04:00 arasında bir seans bitirdin', kazanildi: geceKusu },
    { id: 'erkenci_kus', ad: 'Erkenci Kuş', emoji: '🐦', aciklama: '04:00 - 07:00 arasında bir seans bitirdin', kazanildi: erkenciKus },
    { id: 'pomodoro_50', ad: 'Pomodoro Ustası', emoji: '🍅', aciklama: '60/15 modunda 50 seans tamamladın', kazanildi: pomodoroSayisi >= 50 },
  ]
  return list
}
