import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'

export const SQL_USER = '11111111-1111-4111-8111-111111111111'
export const WORK_INTERVAL_MIGRATION = 'supabase/migrations/20261026150258_session_work_intervals.sql'

export async function createProtocolDatabase(beforeMigration?: (pg: PGlite) => Promise<void>) {
  const windowShim = globalThis.window
  vi.stubGlobal('window', undefined)
  const pg = new PGlite()
  try {
    await pg.exec(`
      create schema auth; create role authenticated; create role anon;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      insert into auth.users values('${SQL_USER}');
    `)
    await pg.exec(readFileSync('database/supabase-v2-sessions.sql','utf8'))
    await beforeMigration?.(pg)
    await pg.exec(readFileSync('database/supabase-v3-sync.sql','utf8'))
    await pg.exec(readFileSync(WORK_INTERVAL_MIGRATION,'utf8'))
    return pg
  } finally { vi.stubGlobal('window', windowShim) }
}

/** HTTP yerine aynı RPC ve RLS'yi yerel PostgreSQL'de çalıştıran test adaptörü. */
export function createPostgresClient(pg: PGlite, userId = SQL_USER) {
  const calls: { type: string; name: string; args: Record<string, unknown> }[] = []
  const request = (name: string, args: Record<string, unknown>, kind: 'rpc' | 'table') => {
    let signal: AbortSignal | undefined
    let execution: Promise<{ data: unknown; error: { message: string; code?: string } | null }> | undefined
    const execute = () => {
      execution ??= (async () => {
        calls.push({ type: kind, name, args: structuredClone(args) })
        try {
          if (signal?.aborted) throw new Error('İstek iptal edildi')
          const data = await pg.transaction(async (tx) => {
            await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [userId])
            await tx.exec('set local role authenticated')
            if (kind === 'rpc') {
              if (name === 'zaman_sync_protocol') return (await tx.query<{ result: unknown }>('select public.zaman_sync_protocol() result')).rows[0].result
              if (name === 'zaman_apply_session') return (await tx.query<{ result: unknown }>(
                'select public.zaman_apply_session($1,$2,$3,$4,$5::jsonb) result',
                [args.p_id,args.p_mutation_id,args.p_expected_version,args.p_action,JSON.stringify(args.p_payload)],
              )).rows[0].result
              if (name === 'zaman_apply_settings') return (await tx.query<{ result: unknown }>(
                'select public.zaman_apply_settings($1,$2,$3::jsonb,$4::jsonb) result',
                [args.p_mutation_id,args.p_expected_version,JSON.stringify(args.p_settings),args.p_deneme_config === null ? null : JSON.stringify(args.p_deneme_config)],
              )).rows[0].result
              throw new Error(`Bilinmeyen RPC: ${name}`)
            }
            if (name === 'sessions') return (await tx.query(
              'select * from public.sessions where user_id=$1 and sync_seq>$2 order by sync_seq limit $3',
              [args.user_id ?? userId,args.cursor ?? 0,args.limit ?? 200],
            )).rows
            if (name === 'user_settings') return (await tx.query('select * from public.user_settings where user_id=$1',[args.user_id ?? userId])).rows[0] ?? null
            throw new Error(`Bilinmeyen tablo: ${name}`)
          })
          if (signal?.aborted) throw new Error('İstek iptal edildi')
          return { data: JSON.parse(JSON.stringify(data)) as unknown, error: null }
        } catch (error) {
          const failure = error as Error & { code?: string }
          return { data: null, error: { message: failure.message, code: failure.code } }
        }
      })()
      return execution
    }
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { if (key !== 'user_id') throw new Error('Desteklenmeyen filtre'); args.user_id = value; return query },
      gt: (key: string, value: number) => { if (key !== 'sync_seq') throw new Error('Desteklenmeyen imleç'); args.cursor = value; return query },
      order: () => query,
      limit: (count: number) => { args.limit = count; return query },
      maybeSingle: () => query,
      abortSignal: (next: AbortSignal) => { signal = next; return query },
      then: ((onFulfilled, onRejected) => execute().then(onFulfilled,onRejected)) as Promise<Awaited<ReturnType<typeof execute>>>['then'],
    }
    return query
  }
  return {
    client: {
      auth: { getUser: async () => ({ data: { user: { id: userId, email: 'test@example.invalid', user_metadata: {} } }, error: null }) },
      from: (table: string) => request(table, {}, 'table'),
      rpc: (name: string, args: Record<string, unknown> = {}) => request(name, args, 'rpc'),
    } as unknown as SupabaseClient,
    calls,
  }
}
