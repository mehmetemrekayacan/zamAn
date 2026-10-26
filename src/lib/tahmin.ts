import { buildStudyStatistics, type StudySession } from './studyStatistics'

/** "Bu tempoda X günde 150 saate ulaşırsın" benzeri tahmin.
 *  Tüm seanslar üzerinden benzersiz aktif gün sayısı (unique active days) kullanılır. */
export function getTahmin150Saat(
  sessions: StudySession[]
): string | null {
  if (sessions.length === 0) return null
  const hedefSn = 150 * 3600 // 540 000 sn = 150 saat
  const stats = buildStudyStatistics(sessions)
  const toplamSn = stats.totalSeconds
  if (toplamSn <= 0) return null
  if (toplamSn >= hedefSn) return '150 saate ulaştın! Tebrikler 🎉'
  // Benzersiz aktif gün sayısı
  const uniqueDays = [...stats.dailySeconds.values()].filter((seconds) => seconds > 0).length
  if (uniqueDays === 0) return null
  const gunlukOrt = toplamSn / uniqueDays // gerçek günlük ortalama (sn/gün)
  if (gunlukOrt <= 0) return null
  const kalanSn = hedefSn - toplamSn
  const tahminiGun = Math.ceil(kalanSn / gunlukOrt)
  return `Bu tempoda yaklaşık ${tahminiGun} günde 150 saate ulaşırsın.`
}

/** Saat dilimine göre çalışma dağılımı (0–23). En verimli saatler için. */
export function getSaatDagilimi(
  sessions: StudySession[]
): number[] {
  return buildStudyStatistics(sessions).hourSeconds
}
