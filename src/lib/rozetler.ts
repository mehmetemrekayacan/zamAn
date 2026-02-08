import type { SessionRecord } from '../types'
import { getLocalDateString } from './time'

export type RozetId =
  | 'ilk_seans'
  | 'ilk_5_saatlik_gun'
  | 'ilk_1000_puan'
  | 'seri_3'
  | 'seri_7'
  | 'seri_14'
  | 'deneme_5'
  | 'deneme_10'
  | 'hedef_gun_5'
  | 'hedef_gun_15'
  | 'hedef_150_saat'

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

/** Tarihteki en uzun ardışık gün serisini hesapla (rozetler için) */
function enUzunSeri(sessions: SessionRecord[]): number {
  const gunler = new Set<string>()
  sessions.forEach((s) => gunler.add(getLocalDateString(new Date(s.tarihISO))))
  const sorted = [...gunler].sort()
  if (sorted.length === 0) return 0
  let max = 1
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000))
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
    const d = getLocalDateString(new Date(s.tarihISO))
    gunlukSnByDate[d] = (gunlukSnByDate[d] ?? 0) + (s.sureGercek ?? 0)
  })
  const HEDEF_5_SAAT_SN = 5 * 3600
  const besSaatlikGunSayisi = Object.values(gunlukSnByDate).filter((sn) => sn >= HEDEF_5_SAAT_SN).length

  /** Seri rozetleri: mevcut streak VEYA tarihteki en uzun seri (hangisi büyükse) */
  const seriDeger = Math.max(streak, enUzunSeri(sessions))

  const list: Rozet[] = [
    { id: 'ilk_seans', ad: 'İlk Seans', emoji: '🎯', aciklama: 'İlk seansını tamamladın', kazanildi: sessions.length >= 1 },
    { id: 'ilk_5_saatlik_gun', ad: 'İlk 5 Saatlik Gün', emoji: '📚', aciklama: 'Bir günde 5+ saat çalıştın', kazanildi: besSaatlikGunSayisi >= 1 },
    { id: 'ilk_1000_puan', ad: 'İlk 1000 Puan', emoji: '⭐', aciklama: '1000 kariyer puanına ulaştın', kazanildi: toplamKariyerPuan >= 1000 },
    { id: 'seri_3', ad: '3 Gün Seri', emoji: '🔥', aciklama: '3 ardışık gün çalıştın', kazanildi: seriDeger >= 3 },
    { id: 'seri_7', ad: '7 Gün Seri', emoji: '🔥🔥', aciklama: '7 ardışık gün çalıştın', kazanildi: seriDeger >= 7 },
    { id: 'seri_14', ad: '14 Gün Seri', emoji: '🔥🔥🔥', aciklama: '14 ardışık gün çalıştın', kazanildi: seriDeger >= 14 },
    { id: 'deneme_5', ad: '5 Deneme', emoji: '📋', aciklama: '5 deneme sınavı tamamladın', kazanildi: denemeSayisi >= 5 },
    { id: 'deneme_10', ad: '10 Deneme', emoji: '📋📋', aciklama: '10 deneme sınavı tamamladın', kazanildi: denemeSayisi >= 10 },
    { id: 'hedef_gun_5', ad: '5 Hedef Gün', emoji: '🎯', aciklama: 'Ayda 5 gün 5+ saat çalıştın', kazanildi: gunluk5SaatGunSayisi >= 5 },
    { id: 'hedef_gun_15', ad: '15 Hedef Gün', emoji: '🏅', aciklama: 'Ayda 15 gün 5+ saat çalıştın', kazanildi: gunluk5SaatGunSayisi >= 15 },
    { id: 'hedef_150_saat', ad: '150 Saat', emoji: '👑', aciklama: 'Ayda 150 saat çalıştın', kazanildi: monthSeconds >= 150 * 3600 },
  ]
  return list
}
