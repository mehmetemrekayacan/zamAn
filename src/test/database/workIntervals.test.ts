import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createProtocolDatabase, SQL_USER, WORK_INTERVAL_MIGRATION } from '../helpers/postgres'
import { makeSession } from '../helpers/fixtures'
import { canonical, rowToSession, sessionFingerprint, sessionToRow, type RemoteSessionRow } from '../../lib/syncProtocol'
import { validateBackup } from '../../lib/backupValidation'

const end = Date.parse('2026-10-26T09:01:00Z')
const record = makeSession({ tarihISO: new Date(end).toISOString(), sureGercek: 40,
  workIntervals: [{ start: end - 60_000, end: end - 40_000 },{ start: end - 20_000, end }] })
let pg: PGlite

async function write(mutation: string, version: number, payload: unknown = sessionToRow(record)) {
  return (await pg.query<{ result: { status: string; row: RemoteSessionRow } }>(
    'select public.zaman_apply_session($1,$2,$3,$4,$5::jsonb) as result',
    [record.id,mutation,version,'upsert_session',JSON.stringify(payload)],
  )).rows[0].result
}

describe('çalışma aralıkları: gerçek PostgreSQL ve protokol uyumu', () => {
  beforeAll(async () => { pg = await createProtocolDatabase() },30_000)
  afterAll(async () => { await pg?.close() })
  beforeEach(async () => {
    await pg.exec('reset role; truncate public.sessions,public.sync_mutations')
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[SQL_USER])
    await pg.exec('set role authenticated')
  })

  it('kayıt, geri okuma ve güncellemede aralıklar kayıpsız korunur', async () => {
    const created = await write('create',0)
    expect(created.row.work_intervals).toEqual(record.workIntervals)
    expect(rowToSession(created.row).workIntervals).toEqual(record.workIntervals)
    const updated = await write('edit',1,{ ...sessionToRow(record),not_text:'Not' })
    expect(updated.row.work_intervals).toEqual(record.workIntervals)
    expect(updated.row.version).toBe(2)
  })

  it.each([
    ['çakışan aralık',[{start:end-60_000,end:end-20_000},{start:end-30_000,end}]],
    ['ters aralık',[{start:end,end:end-40_000}]],
    ['yanlış süre',[{start:end-60_000,end}]],
    ['bitiş sonrası',[{start:end-20_000,end:end+20_000}]],
    ['metin zamanı',[{start:String(end-40_000),end}]],
    ['yabancı alan',[{start:end-40_000,end,reset:null}]],
  ])('%s RPC ve yedek doğrulamada reddedilir', async (_name, intervals) => {
    await expect(write('invalid',0,{ ...sessionToRow(record),work_intervals:intervals })).rejects.toMatchObject({ code:'22023' })
    expect(() => validateBackup({ version:1,exportedAt:new Date(end).toISOString(),sessions:[{...record,workIntervals:intervals}] })).toThrow('workIntervals')
  })

  it('eski kaydın fingerprint ve gönderim biçimi değişmez', () => {
    const legacy = makeSession()
    const row = sessionToRow(legacy)
    expect(row).not.toHaveProperty('work_intervals')
    expect(sessionFingerprint(legacy)).toBe(canonical({...row,created_at:undefined}))
  })

  it('eski istemcinin not güncellemesi aralıkları korur; süre değişikliği bilinmeyen olarak işaretler', async () => {
    await write('create',0)
    const legacy = sessionToRow({ ...record, workIntervals:undefined })
    expect((await write('legacy-note',1,{...legacy,not_text:'Eski cihaz'})).row.work_intervals).toEqual(record.workIntervals)
    expect((await write('legacy-time',2,{...legacy,sure_gercek:50})).row.work_intervals).toBeNull()
  })

  it('migration tekrarı veri/sürüm değiştirmez ve protokol özelliğini bildirir', async () => {
    await write('create',0)
    await pg.exec('reset role')
    const before = (await pg.query('select * from public.sessions')).rows
    await pg.exec(readFileSync(WORK_INTERVAL_MIGRATION,'utf8'))
    expect((await pg.query('select * from public.sessions')).rows).toEqual(before)
    expect((await pg.query<{ value: unknown }>('select public.zaman_sync_protocol() as value')).rows[0].value).toEqual({ version:3,features:['work_intervals'] })
    expect((await pg.query("select has_function_privilege('authenticated','zaman_private.validate_work_intervals(jsonb,integer,timestamptz)','EXECUTE') as helper_access")).rows[0]).toEqual({helper_access:false})
  })

  it('geçişten önce tamamlanmış eski mutation aynı kimlikle yeniden gönderilebilir', async () => {
    await pg.exec('reset role')
    await pg.exec(readFileSync('database/supabase-v3-sync.sql','utf8'))
    await pg.exec('set role authenticated')
    const payload = sessionToRow({ ...record,workIntervals:undefined })
    const before = await write('before-upgrade',0,payload)
    await pg.exec('reset role')
    await pg.exec(readFileSync(WORK_INTERVAL_MIGRATION,'utf8'))
    await pg.exec('set role authenticated')
    expect(await write('before-upgrade',0,payload)).toEqual(before)
  })
})
