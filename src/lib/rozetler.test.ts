import { describe, expect, it } from 'vitest'
import type { SessionRecord } from '../types'
import { makeSession } from '../test/helpers/fixtures'
import { getRozetler } from './rozetler'

function earned(sessions: SessionRecord[], monthSeconds = 0) {
  return getRozetler({
    sessions, monthSeconds, gunluk5SaatGunSayisi: 0, streak: 0, toplamKariyerPuan: 0,
  }).filter((badge) => badge.kazanildi).map((badge) => badge.id)
}

describe('rozetler', () => {
  it('boş geçmişte rozet kazanılmaz', () => {
    expect(earned([])).toEqual([])
  })

  it('aynı günün ayrı seanslarını 5 saatlik hedef için toplar', () => {
    const first = makeSession({ sureGercek: 3 * 3600 })
    expect(earned([first])).not.toContain('ilk_5_saatlik_gun')
    expect(earned([first, makeSession({ id: 'second', sureGercek: 2 * 3600 })]))
      .toContain('ilk_5_saatlik_gun')
  })

  it('güncel seri sıfırken bile geçmişte kazanılan seri rozeti korunur', () => {
    const sessions = Array.from({ length: 7 }, (_, day) => makeSession({
      id: `day-${day}`,
      tarihISO: new Date(2025, 0, 1 + day, 12).toISOString(),
      createdAt: new Date(2025, 0, 1 + day, 12).toISOString(),
    }))
    expect(earned(sessions)).toContain('seri_7')
    expect(earned(sessions)).not.toContain('seri_14')
  })

  it('deneme ve sınav saati kayıtları deneme rozetine birlikte sayılır', () => {
    const sessions = Array.from({ length: 5 }, (_, index) => makeSession({
      id: `exam-${index}`, mod: index % 2 === 0 ? 'deneme' : 'EXAM_SIMULATOR',
    }))
    expect(earned(sessions)).toContain('deneme_5')
    expect(earned(sessions.slice(1))).not.toContain('deneme_5')
  })

  it('aylık 150 saat rozeti toplam kariyer saatinden ayrıdır', () => {
    const sessions = [makeSession({ sureGercek: 200 * 3600 })]
    expect(earned(sessions, 149 * 3600)).not.toContain('hedef_150_saat')
    expect(earned(sessions, 150 * 3600)).toContain('hedef_150_saat')
  })
})
