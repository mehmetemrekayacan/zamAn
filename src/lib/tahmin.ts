/** "Bu tempoda X günde 150 saate ulaşırsın" benzeri tahmin */
export function getTahmin150Saat(monthSeconds: number): string | null {
  if (monthSeconds <= 0) return null
  const hedefSn = 150 * 3600
  const kalanSn = Math.max(0, hedefSn - monthSeconds)
  const ayBasindanBugune = new Date().getDate()
  if (ayBasindanBugune <= 0) return null
  const gunlukOrt = monthSeconds / ayBasindanBugune
  if (gunlukOrt <= 0) return null
  const tahminiGun = Math.ceil(kalanSn / gunlukOrt)
  if (tahminiGun <= 0) return 'Bu ay 150 saate ulaştın! 🎉'
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
