import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProtocolDatabase, SQL_USER, WORK_INTERVAL_MIGRATION } from '../helpers/postgres'
import { makeSession } from '../helpers/fixtures'

const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const legacy = {
  version: 1,
  sessions: [
    makeSession({ id: 'existing', not: 'Eski blob' }),
    makeSession({ id: 'legacy-only', not: 'Eski buluttan', dogruSayisi: 40 }),
    makeSession({ id: 'invalid-legacy', sureGercek: -1 }),
  ],
  settingsStorage: JSON.stringify({ state: { kullaniciAdi: 'Eski ad', tema: 'dark' }, version: 0 }),
  timerStorage: JSON.stringify({ state: { status: 'running', elapsedMs: 99999 }, version: 0 }),
  denemeConfig: JSON.stringify({ mode: 'deneme', bolumler: [{ ad: 'AGS', surePlanMs: 6600000 }] }),
}
let pg: PGlite

describe('eski sync_data geçişi', () => {
  beforeAll(async () => {
    pg = await createProtocolDatabase(async (database) => {
      await database.exec(readFileSync('database/sync-preflight.sql', 'utf8'))
      await database.exec(readFileSync('database/supabase-sync.sql', 'utf8'))
      await database.query('insert into auth.users values($1)', [OTHER_USER])
      await database.query('insert into public.sync_data(user_id,data) values($1,$2::jsonb),($3,$4::jsonb)', [
        SQL_USER, JSON.stringify(legacy), OTHER_USER, JSON.stringify({
          sessions: [makeSession({ id: 'legacy-only', not: 'Diğer hesap' })],
          settingsStorage: JSON.stringify({ state: { kullaniciAdi: 'Eski B' }, version: 0 }),
        }),
      ])
      await database.query("insert into public.sessions(id,user_id,mod,sure_gercek,puan,tarih_iso,not_text) values('existing',$1,'serbest',60,10,now(),'Güncel v2')", [SQL_USER])
      await database.query('insert into public.user_settings(user_id,settings) values($1,$2::jsonb)', [OTHER_USER, JSON.stringify({ state: { kullaniciAdi: 'Güncel B' }, version: 0 })])
    })
  }, 30000)
  afterAll(async () => { await pg?.close() })

  it('eski blob seanslarını aktarır ve mevcut v2 kaydını ezmez', async () => {
    expect((await pg.query('select id,not_text,dogru_sayisi from public.sessions where user_id=$1 order by id', [SQL_USER])).rows)
      .toEqual([
        { id: 'existing', not_text: 'Güncel v2', dogru_sayisi: null },
        { id: 'legacy-only', not_text: 'Eski buluttan', dogru_sayisi: 40 },
      ])
  })

  it('kaynak blobu değiştirmez ve hatalı girdiyi inceleme kaydıyla korur', async () => {
    expect((await pg.query('select data from public.sync_data where user_id=$1', [SQL_USER])).rows).toEqual([{ data: legacy }])
    expect((await pg.query('select outcome,raw_value from public.sync_legacy_imports where user_id=$1 and outcome=$2', [SQL_USER, 'invalid'])).rows)
      .toMatchObject([{ outcome: 'invalid', raw_value: legacy.sessions[2] }])
  })

  it('tercihleri taşır, aktif sayaç durumunu başka cihaza taşımaz', async () => {
    expect((await pg.query('select settings,deneme_config,timer_storage from public.user_settings where user_id=$1', [SQL_USER])).rows)
      .toEqual([{ settings: JSON.parse(legacy.settingsStorage), deneme_config: JSON.parse(legacy.denemeConfig), timer_storage: null }])
  })

  it('hesapları ve mevcut tercihleri birbirinden ayrı korur', async () => {
    expect((await pg.query('select not_text from public.sessions where user_id=$1 and id=$2', [OTHER_USER, 'legacy-only'])).rows)
      .toEqual([{ not_text: 'Diğer hesap' }])
    expect((await pg.query('select settings from public.user_settings where user_id=$1', [OTHER_USER])).rows)
      .toMatchObject([{ settings: { state: { kullaniciAdi: 'Güncel B' } } }])
  })

  it('migration tekrarında yeni sürüm, kopya veya değişen kaynak üretmez', async () => {
    const before = (await pg.query('select * from public.sessions order by user_id,id')).rows
    await pg.exec(readFileSync('database/supabase-v3-sync.sql', 'utf8'))
    await pg.exec(readFileSync(WORK_INTERVAL_MIGRATION, 'utf8'))
    expect((await pg.query('select * from public.sessions order by user_id,id')).rows).toEqual(before)
  })

  it('ön ve son kontrol sorguları veriyi değiştirmeden çalışır', async () => {
    const before = (await pg.query('select * from public.sessions order by user_id,id')).rows
    await pg.exec(readFileSync('database/sync-preflight.sql', 'utf8'))
    await pg.exec(readFileSync('database/sync-verify.sql', 'utf8'))
    expect((await pg.query('select * from public.sessions order by user_id,id')).rows).toEqual(before)
  })
})
