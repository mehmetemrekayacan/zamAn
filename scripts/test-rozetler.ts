/**
 * Rozet hesaplamasını test verisi ile test eder.
 * Çalıştır: npx tsx scripts/test-rozetler.ts
 */

import { getRozetler } from '../src/lib/rozetler'
import { getLocalDateString } from '../src/lib/time'
import type { SessionRecord } from '../src/types'

/** Test için minimal seans verisi (7 gün, her gün 5+ saat, 7 deneme) */
function getTestSessions(): SessionRecord[] {
  const base = new Date()
  const sessions: SessionRecord[] = []
  for (let d = 1; d <= 7; d++) {
    const date = new Date(base)
    date.setDate(date.getDate() - d)
    date.setHours(9, 0, 0, 0)
    const iso = date.toISOString()
    sessions.push({ id: `t-${d}-1`, mod: 'serbest', sureGercek: 10800, puan: 144, tarihISO: iso, duraklatmaSayisi: 0 })
    sessions.push({ id: `t-${d}-2`, mod: 'deneme', sureGercek: 7200, puan: 156, tarihISO: iso.replace('T09', 'T14'), duraklatmaSayisi: 0 })
  }
  return sessions.sort((a, b) => new Date(b.tarihISO).getTime() - new Date(a.tarihISO).getTime())
}

const mock = getTestSessions()
console.log('Test seans sayısı:', mock.length)

// Summary hesapla (App.tsx ile aynı mantık)
const monthAgo = new Date()
monthAgo.setDate(monthAgo.getDate() - 30)
const monthSessions = mock.filter((s) => new Date(s.tarihISO) >= monthAgo)
const monthSeconds = monthSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0)

const HEDEF_SANIYE = 5 * 3600
const gunlukSaniyeByDate: Record<string, number> = {}
monthSessions.forEach((s) => {
  const dateStr = getLocalDateString(new Date(s.tarihISO))
  gunlukSaniyeByDate[dateStr] = (gunlukSaniyeByDate[dateStr] ?? 0) + (s.sureGercek || 0)
})
const gunluk5SaatGunSayisi = Object.values(gunlukSaniyeByDate).filter((sn) => sn >= HEDEF_SANIYE).length

// Streak hesapla
let streakDays = 0
const today = getLocalDateString()
const hasToday = mock.some((s) => getLocalDateString(new Date(s.tarihISO)) === today)
if (hasToday) {
  streakDays = 1
  const checkDate = new Date()
  checkDate.setHours(0, 0, 0, 0)
  for (let i = 1; i <= 365; i++) {
    checkDate.setDate(checkDate.getDate() - 1)
    const checkDateStr = getLocalDateString(checkDate)
    if (mock.some((s) => getLocalDateString(new Date(s.tarihISO)) === checkDateStr)) {
      streakDays++
    } else break
  }
}

const toplamKariyerPuan = mock.reduce((a, s) => a + (s.puan ?? 0), 0)

console.log('\n--- Summary ---')
console.log('gunluk5SaatGunSayisi:', gunluk5SaatGunSayisi)
console.log('streak:', streakDays)
console.log('toplamKariyerPuan:', toplamKariyerPuan)
console.log('monthSeconds:', monthSeconds, `(${Math.round(monthSeconds / 3600)} saat)`)

const rozetler = getRozetler({
  gunluk5SaatGunSayisi,
  streak: streakDays,
  toplamKariyerPuan,
  monthSeconds,
  sessions: mock,
})

console.log('\n--- Rozetler ---')
rozetler.forEach((r) => {
  const durum = r.kazanildi ? '✓' : '✗'
  console.log(`  ${durum} ${r.emoji} ${r.ad}: ${r.aciklama}`)
})

const kazanilan = rozetler.filter((r) => r.kazanildi).length
console.log(`\nToplam: ${kazanilan}/${rozetler.length} rozet kazanıldı`)
