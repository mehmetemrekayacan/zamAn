import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSession } from '../helpers/fixtures'
import { sessionToRow, type RemoteSessionRow } from '../../lib/syncProtocol'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const migration = readFileSync('database/supabase-v3-sync.sql', 'utf8')
let pg: PGlite
let preserved: unknown

async function asUser(id: string) {
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
  await pg.exec('set role authenticated')
}

async function mutate(id: string, mutation: string, version: number, action = 'upsert_session', payload: unknown = sessionToRow(makeSession())) {
  const result = await pg.query<{ result: { status: string; row: RemoteSessionRow } }>(
    'select public.zaman_apply_session($1,$2,$3,$4,$5::jsonb) as result',
    [id, mutation, version, action, JSON.stringify(payload)],
  )
  return result.rows[0].result
}

describe('gerçek PostgreSQL motorunda senkron protokolü', () => {
  beforeAll(async () => {
    // Uygulama testlerinin window shim'i WASM'ı tarayıcı moduna sokmamalı.
    vi.stubGlobal('window', undefined)
    pg = new PGlite()
    await pg.exec(`
      create schema auth;
      create role authenticated; create role anon;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      insert into auth.users values('${A}'),('${B}');
    `)
    await pg.exec(readFileSync('database/supabase-v2-sessions.sql', 'utf8'))
    await pg.exec(readFileSync('database/supabase-conflict-resolution.sql', 'utf8'))
    // Canlı projede bulunan ek kolonlar, eski tetikleyici ve geniş ACL'ler.
    await pg.exec(`
      alter table public.sessions add column analiz_suresi integer;
      alter table public.sessions alter column ekstra_sure_ms type bigint;
      create function public.set_updated_at() returns trigger language plpgsql as
      $$ begin new.updated_at := now(); return new; end $$;
      create trigger sessions_set_updated_at before update on public.sessions
        for each row execute function public.set_updated_at();
      grant all on public.sessions,public.user_settings to anon,authenticated;
    `)
    await pg.exec('grant update(puan) on public.sessions to authenticated; grant insert(id,user_id,mod,sure_gercek,tarih_iso) on public.sessions to anon')
    await pg.query('insert into public.sessions(id,user_id,mod,sure_gercek,puan,tarih_iso) values($1,$2,$3,$4,$5,now())', ['preserved', A, 'serbest', 60, 10])
    await pg.exec(migration)
    await pg.exec(migration)
    preserved = (await pg.query('select id,sure_gercek,version from public.sessions where id=$1', ['preserved'])).rows[0]
  }, 30000)

  beforeEach(async () => {
    await pg.exec('reset role; truncate public.sessions,public.user_settings,public.sync_mutations')
    await asUser(A)
  })
  afterAll(async () => { await pg?.close() })

  it('eski tablo ve yardımcı tetikleyiciden geçiş mevcut kaydı korur; tekrar çalıştırılabilir', () => {
    expect(preserved).toMatchObject({ id: 'preserved', sure_gercek: 60, version: 1 })
  })

  it('aynı taban sürümünden yalnızca bir değişiklik uygulanır', async () => {
    const initial = await mutate('one', 'create', 0)
    expect(initial.row.version).toBe(1)
    const newer = await mutate('one', 'edit-a', 1, 'upsert_session', sessionToRow(makeSession({ not: 'Yeni' })))
    const stale = await mutate('one', 'edit-b', 1, 'upsert_session', sessionToRow(makeSession({ not: 'Eski' })))
    expect(newer).toMatchObject({ status: 'applied', row: { version: 2, not_text: 'Yeni' } })
    expect(stale).toMatchObject({ status: 'conflict', row: { version: 2, not_text: 'Yeni' } })
  })

  it('silinen seans eski veya güncel sürümle upsert edilerek diriltilemez', async () => {
    await mutate('one', 'create', 0)
    const deleted = await mutate('one', 'delete', 1, 'delete_session', null)
    expect(deleted.row.deleted_at).not.toBeNull()
    expect((await mutate('one', 'stale', 1)).status).toBe('conflict')
    expect((await mutate('one', 'restore-same-id', 2)).status).toBe('conflict')
    expect((await mutate('one', 'delete-again', 1, 'delete_session', null)).row.version).toBe(2)
  })

  it('henüz sunucuya ulaşmamış kaydın silinmesi de tombstone oluşturur', async () => {
    expect((await mutate('offline', 'delete-first', 0, 'delete_session', null)).row.deleted_at).not.toBeNull()
    expect((await mutate('offline', 'late-create', 0)).status).toBe('conflict')
  })

  it('kayıp yanıtın tekrarı sürümü artırmaz ve sonraki düzenlemeyi ezmez', async () => {
    const first = await mutate('one', 'same-request', 0)
    expect(await mutate('one', 'same-request', 0)).toEqual(first)
    await mutate('one', 'next', 1, 'upsert_session', sessionToRow(makeSession({ not: 'Son sürüm' })))
    expect(await mutate('one', 'same-request', 0)).toEqual(first)
    expect((await pg.query('select version,not_text from public.sessions')).rows[0]).toEqual({ version: 2, not_text: 'Son sürüm' })
  })

  it('aynı mutation kimliği farklı içerikle tekrar kullanılamaz', async () => {
    await mutate('one', 'reused', 0)
    await expect(mutate('one', 'reused', 0, 'upsert_session', sessionToRow(makeSession({ puan: 999 })))).rejects.toMatchObject({ code: '22023' })
  })

  it('payload kullanıcı kimliği ve saati sürüm kararını değiştiremez', async () => {
    const result = await mutate('one', 'spoof', 0, 'upsert_session', {
      ...sessionToRow(makeSession()), user_id: B, version: 999, updated_at: '2099-01-01T00:00:00Z',
    })
    expect(result.row.user_id).toBe(A)
    expect(result.row.version).toBe(1)
    expect(result.row.updated_at.startsWith('2099')).toBe(false)
    await asUser(B)
    expect((await pg.query('select * from public.sessions')).rows).toEqual([])
    expect((await mutate('one', 'b-request', 0)).row.user_id).toBe(B)
  })

  it.each(['insert','update','delete','truncate'])('eski istemcinin doğrudan %s yazması reddedilir', async (operation) => {
    const query = operation === 'insert'
      ? `insert into public.sessions(id,user_id,mod,sure_gercek,tarih_iso) values('x','${A}','serbest',1,now())`
      : operation === 'update' ? "update public.sessions set puan=999 where id='one'"
        : operation === 'truncate' ? 'truncate public.sessions' : "delete from public.sessions where id='one'"
    await expect(pg.exec(query)).rejects.toMatchObject({ code: '42501' })
  })

  it('canlı eski fonksiyonların search_path ayarı sabittir ve RLS sahibi sorgu başına hesaplar', async () => {
    const functions = await pg.query<{ proconfig: string[] }>("select proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('set_updated_at','bump_session_version_and_server_time')")
    expect(functions.rows).toHaveLength(2)
    expect(functions.rows.every((row) => row.proconfig.includes('search_path=""'))).toBe(true)
    const policies = await pg.query<{ cmd: string; roles: string[]; qual: string }>("select cmd,roles,qual from pg_policies where schemaname='public' and tablename in ('sessions','user_settings')")
    expect(policies.rows).toHaveLength(2)
    for (const policy of policies.rows) {
      expect(policy.cmd).toBe('SELECT')
      expect(policy.roles).toEqual(['authenticated'])
      expect(policy.qual).toContain('SELECT auth.uid()')
    }
  })

  it('anon çağrısı ve geçersiz seanslar reddedilir', async () => {
    await expect(mutate('one', 'bad', 0, 'upsert_session', sessionToRow(makeSession({ sureGercek: -1 })))).rejects.toMatchObject({ code: '22023' })
    await pg.exec('reset role; set role anon')
    await expect(mutate('one', 'anon', 0)).rejects.toMatchObject({ code: '42501' })
  })

  it('Data API RPC uçları invoker olur; ayrıcalıklı gövde ve günlükler kısıtlı kalır', async () => {
    expect((await pg.query("select proname,prosecdef from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('zaman_apply_session','zaman_apply_settings') order by proname")).rows)
      .toEqual([{ proname: 'zaman_apply_session', prosecdef: false }, { proname: 'zaman_apply_settings', prosecdef: false }])
    expect((await pg.query("select has_schema_privilege('anon','zaman_private','usage') as anon_schema, has_function_privilege('anon','public.zaman_apply_session(text,text,bigint,text,jsonb)','execute') as anon_rpc, has_table_privilege('authenticated','public.sync_mutations','select') as mutation_log, has_table_privilege('authenticated','public.sync_legacy_imports','select') as legacy_log")).rows)
      .toEqual([{ anon_schema: false, anon_rpc: false, mutation_log: false, legacy_log: false }])
  })

  it.each(['surePlan','molaSaniye','ekstraSureMs','toplamDuraklamaSureSaniye'])('negatif %s sunucuda da reddedilir', async (field) => {
    await expect(mutate('invalid', 'bad-duration', 0, 'upsert_session', sessionToRow(makeSession({ [field]: -1 })))).rejects.toMatchObject({ code: '22023' })
    expect((await pg.query('select id from public.sessions')).rows).toEqual([])
  })

  it('bozuk tercih sunucuda kabul edilip diğer cihazın eşitlemesini bozamaz', async () => {
    await expect(pg.query('select public.zaman_apply_settings($1,$2,$3::jsonb,null)', ['bad-theme', 0, JSON.stringify({ state: { tema: 'unknown' }, version: 0 })]))
      .rejects.toMatchObject({ code: '22023' })
    expect((await pg.query('select user_id from public.user_settings')).rows).toEqual([])
  })

  it('ayarlar da sürümle yazılır; aktif sayaç diğer cihaza taşınmaz', async () => {
    const write = async (id: string, version: number, name: string) => (
      await pg.query<{ result: { status: string; row: { version: number; timer_storage: unknown } } }>(
        'select public.zaman_apply_settings($1,$2,$3::jsonb,null) as result',
        [id, version, JSON.stringify({ state: { kullaniciAdi: name }, version: 0 })],
      )
    ).rows[0].result
    expect(await write('prefs-1', 0, 'A')).toMatchObject({ status: 'applied', row: { version: 1, timer_storage: null } })
    expect(await write('prefs-1', 0, 'A')).toMatchObject({ row: { version: 1 } })
    expect(await write('prefs-stale', 0, 'B')).toMatchObject({ status: 'conflict', row: { version: 1 } })
    expect(await write('prefs-2', 1, 'A yeni')).toMatchObject({ status: 'applied', row: { version: 2 } })
  })
})
