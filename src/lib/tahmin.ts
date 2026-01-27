/** "Bu tempoda X günde 150 saate ulaşırsın" benzeri tahmin */
export function getTahmin150Saat(monthMinutes: number): string | null {
  if (monthMinutes <= 0) return null
  const hedefDk = 150 * 60
  const kalanDk = Math.max(0, hedefDk - monthMinutes)
  const ayBasindanBugune = new Date().getDate()
  if (ayBasindanBugune <= 0) return null
  const gunlukOrt = monthMinutes / ayBasindanBugune
  if (gunlukOrt <= 0) return null
  const tahminiGun = Math.ceil(kalanDk / gunlukOrt)
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
