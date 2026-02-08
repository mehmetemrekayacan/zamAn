/**
 * Tüm kritik modüllerin birim testleri.
 * Çalıştır: npx tsx scripts/test-all.ts
 */

import {
  calculateBaseScore,
  calculatePausePenalty,
  calculateFocusBonus,
  calculateEarlyCompletionBonus,
  calculateStreakBonus,
  calculateScore,
  getUnvan,
} from '../src/lib/scoring'
import { getLocalDateString, formatSeconds, formatDuration } from '../src/lib/time'
import { getRozetler } from '../src/lib/rozetler'
import { getTahmin150Saat, getSaatDagilimi } from '../src/lib/tahmin'
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

let passed = 0
let failed = 0

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function eq<T>(name: string, actual: T, expected: T) {
  const cond = actual === expected
  ok(name, cond, cond ? undefined : `beklenen: ${expected}, gelen: ${actual}`)
}

console.log('\n=== 1. Puanlama (scoring) ===\n')

// Base score: 60 dk × 1.0 = 60 puan (serbest 0.8 → 48)
eq('Base score 60dk serbest', calculateBaseScore(3600, 'serbest'), 48)
eq('Base score 60dk deneme', calculateBaseScore(3600, 'deneme'), 78)
eq('Base score 60dk ders60mola15', calculateBaseScore(3600, 'ders60mola15'), 69)

// Pause penalty
eq('0 pause', calculatePausePenalty(0), 0)
eq('1 pause', calculatePausePenalty(1), 5)
eq('2 pause', calculatePausePenalty(2), 10)
eq('3+ pause', calculatePausePenalty(3), 20)

// Focus bonus
eq('0 pause focus', calculateFocusBonus(0), 15)
eq('1 pause focus', calculateFocusBonus(1), 5)
eq('2 pause focus', calculateFocusBonus(2), 0)

// Early completion
eq('Erken bitirme 10dk', calculateEarlyCompletionBonus(3000, 3600), 10)
eq('Erken bitirme max 20', calculateEarlyCompletionBonus(0, 3600), 20)
eq('Geç bitirme 0', calculateEarlyCompletionBonus(4000, 3600), 0)

// Streak bonus
eq('Streak 0', calculateStreakBonus(0), 0)
eq('Streak 5', calculateStreakBonus(5), 25)
eq('Streak 10 max', calculateStreakBonus(10), 50)

// Full score
const full = calculateScore(3600, 'serbest', 0, undefined, 3)
ok('Full score pozitif', full.totalScore > 0, `toplam: ${full.totalScore}`)

// Kısa seans: 3 sn'de bonus yok, puan düşük olmalı
const kisa = calculateScore(3, 'serbest', 0, undefined, 1)
ok('3 sn seans düşük puan', kisa.totalScore <= 5, `3 sn: ${kisa.totalScore} puan (bonus yok)`)

console.log('\n=== 2. Zaman (time) ===\n')

eq('getLocalDateString format', getLocalDateString(new Date('2025-02-04T12:00:00')), '2025-02-04')
eq('formatSeconds 90', formatSeconds(90), '1 dk 30 sn')
eq('formatSeconds 3665', formatSeconds(3665), '1 saat 1 dk 5 sn')
eq('formatDuration 90000', formatDuration(90000), '00:01:30')

console.log('\n=== 3. Rozetler ===\n')

const mock = getTestSessions()
const monthAgo = new Date()
monthAgo.setDate(monthAgo.getDate() - 30)
const monthSessions = mock.filter((s) => new Date(s.tarihISO) >= monthAgo)
const monthSeconds = monthSessions.reduce((a, s) => a + (s.sureGercek || 0), 0)
const gunlukByDate: Record<string, number> = {}
monthSessions.forEach((s) => {
  const d = getLocalDateString(new Date(s.tarihISO))
  gunlukByDate[d] = (gunlukByDate[d] ?? 0) + (s.sureGercek || 0)
})
const gunluk5 = Object.values(gunlukByDate).filter((s) => s >= 18000).length

let streak = 0
const today = getLocalDateString()
if (mock.some((s) => getLocalDateString(new Date(s.tarihISO)) === today)) {
  streak = 1
  const checkDate = new Date()
  checkDate.setHours(0, 0, 0, 0)
  for (let i = 1; i <= 60; i++) {
    checkDate.setDate(checkDate.getDate() - 1)
    const ds = getLocalDateString(checkDate)
    if (mock.some((s) => getLocalDateString(new Date(s.tarihISO)) === ds)) streak++
    else break
  }
}

const rozetler = getRozetler({
  gunluk5SaatGunSayisi: gunluk5,
  streak,
  toplamKariyerPuan: mock.reduce((a, s) => a + (s.puan ?? 0), 0),
  monthSeconds,
  sessions: mock,
})

ok('İlk seans rozeti', rozetler.find((r) => r.id === 'ilk_seans')?.kazanildi === true)
ok('İlk 5 saatlik gün', rozetler.find((r) => r.id === 'ilk_5_saatlik_gun')?.kazanildi === true)
ok('7 gün seri (en uzun seri)', rozetler.find((r) => r.id === 'seri_7')?.kazanildi === true)
ok('5 deneme', rozetler.find((r) => r.id === 'deneme_5')?.kazanildi === true)

console.log('\n=== 4. Tahmin ===\n')

const t1 = getTahmin150Saat(0)
eq('0 saat tahmin null', t1, null)

const t2 = getTahmin150Saat(54000) // 15 saat
ok('15 saat tahmin string', typeof t2 === 'string' && t2.includes('günde'))

const t3 = getTahmin150Saat(540000) // 150 saat
eq('150 saat ulaştın', t3, 'Bu ay 150 saate ulaştın! 🎉')

console.log('\n=== 5. Saat dağılımı ===\n')

const sessions: { tarihISO: string; sureGercek: number }[] = [
  { tarihISO: '2025-02-04T09:00:00.000Z', sureGercek: 3600 },
  { tarihISO: '2025-02-04T14:00:00.000Z', sureGercek: 7200 },
]
const dagilim = getSaatDagilimi(sessions)
ok('24 eleman', dagilim.length === 24)
// UTC'de 09:00 ve 14:00 - yerel saate göre değişir, sadece toplam kontrol
const toplam = dagilim.reduce((a, b) => a + b, 0)
eq('Toplam 10800 sn', toplam, 10800)

console.log('\n=== 6. Ünvan eşikleri ===\n')

const u0 = getUnvan(0)
eq('0 puan İlk Adım', u0.unvan, 'İlk Adım')

const u2500 = getUnvan(2500)
eq('2500 Sınav Adayı', u2500.unvan, 'Sınav Adayı')

const u45k = getUnvan(45000)
eq('45000 Usta Öğretmen', u45k.unvan, 'Usta Öğretmen')

console.log('\n--- Özet ---')
console.log(`Geçen: ${passed}`)
console.log(`Kalan: ${failed}`)
console.log(failed === 0 ? '\n✅ Tüm testler geçti.\n' : '\n❌ Bazı testler başarısız.\n')

process.exit(failed > 0 ? 1 : 0)
