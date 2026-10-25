import { describe, expect, it } from 'vitest'
import { getSaatDagilimi, getTahmin150Saat } from './tahmin'

describe('çalışma tahmini', () => {
  it('çalışma yoksa tahmin üretmez', () => {
    expect(getTahmin150Saat([])).toBeNull()
    expect(getTahmin150Saat([{ tarihISO: '2026-10-24T09:00:00Z', sureGercek: 0 }])).toBeNull()
  })

  it('150 saat tamamlandığında hedefin gerçekleştiğini belirtir', () => {
    expect(getTahmin150Saat([{ tarihISO: '2026-10-24T09:00:00Z', sureGercek: 150 * 3600 }]))
      .toBe('150 saate ulaştın! Tebrikler 🎉')
  })

  it('saat dağılımında toplam çalışma süresi korunur', () => {
    const distribution = getSaatDagilimi([
      { tarihISO: '2026-10-24T09:00:00Z', sureGercek: 3600 },
      { tarihISO: '2026-10-24T14:00:00Z', sureGercek: 7200 },
    ])
    expect(distribution).toHaveLength(24)
    expect(distribution.reduce((sum, seconds) => sum + seconds, 0)).toBe(10800)
  })
})
