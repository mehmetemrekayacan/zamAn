/** "Bu tempoda X günde 150 saate ulaşırsın" benzeri tahmin.
 *  Tüm seanslar üzerinden benzersiz aktif gün sayısı (unique active days) kullanılır. */
export function getTahmin150Saat(
  sessions: { tarihISO: string; sureGercek: number }[]
): string | null {
  if (sessions.length === 0) return null
  const hedefSn = 150 * 3600 // 540 000 sn = 150 saat
  const toplamSn = sessions.reduce((acc, s) => acc + (s.sureGercek ?? 0), 0)
  if (toplamSn <= 0) return null
  if (toplamSn >= hedefSn) return '150 saate ulaştın! Tebrikler 🎉'
  // Benzersiz aktif gün sayısı
  const uniqueDays = new Set(sessions.map((s) => s.tarihISO.split('T')[0])).size
  if (uniqueDays === 0) return null
  const gunlukOrt = toplamSn / uniqueDays // gerçek günlük ortalama (sn/gün)
  if (gunlukOrt <= 0) return null
  const kalanSn = hedefSn - toplamSn
  const tahminiGun = Math.ceil(kalanSn / gunlukOrt)
  return `Bu tempoda yaklaşık ${tahminiGun} günde 150 saate ulaşırsın.`
}

/** Saat dilimine göre çalışma dağılımı (0–23). En verimli saatler için. */
export function getSaatDagilimi(
  sessions: { tarihISO: string; sureGercek: number }[]
): number[] {
  const saatBasina: number[] = Array(24).fill(0)
  sessions.forEach((s) => {
    const saat = new Date(s.tarihISO).getHours()
    saatBasina[saat] += s.sureGercek ?? 0
  })
  return saatBasina
}
