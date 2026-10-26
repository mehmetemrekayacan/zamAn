import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'
import { makeSession } from './fixtures'
import { sessionToRow, type RemoteSessionRow } from '../../lib/syncProtocol'
import type { SessionRecord } from '../../types'

export function makeRemoteSession(record = makeSession(), overrides: Partial<RemoteSessionRow> = {}): RemoteSessionRow {
  return { ...sessionToRow(record), user_id: 'test-user-a', version: 1, sync_seq: 1, updated_at_server: record.updatedAt!, updated_at: record.updatedAt!, deleted_at: null, ...overrides }
}

type CloudResponse = {
  data: unknown
  error: { message: string; code?: string } | null
}

type QueryCall = {
  table: string
  steps: { method: string; args: unknown[] }[]
}

/**
 * Yalnızca istemci akışını sınayan kontrollü yanıtlar. SQL/RLS veya gerçek
 * sunucu davranışını taklit etmez. Tanımlanmamış istek sessizce başarılı olmaz.
 */
export function createSupabaseStub(initialUserId: string | null = 'test-user-a') {
  let userId = initialUserId
  const responses: (CloudResponse | Promise<CloudResponse>)[] = []
  const signals: AbortSignal[] = []
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  let protocolResponse: CloudResponse = { data: { version: 3, features: ['work_intervals'] }, error: null }
  const calls: QueryCall[] = []
  const getUser = vi.fn(async () => ({
    data: { user: userId ? { id: userId, email: `${userId}@example.invalid`, user_metadata: {} } : null },
    error: null,
  }))

  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, steps: [] }
    let execution: Promise<CloudResponse> | undefined
    const execute = () => {
      execution ??= (async () => {
        calls.push(structuredClone(call))
        const response = responses.shift()
        if (!response) throw new Error(`Tanımlanmamış Supabase test isteği: ${table}`)
        return structuredClone(await response)
      })()
      return execution
    }
    const step = (method: string, args: unknown[]) => {
      call.steps.push({ method, args: structuredClone(args) })
      return query
    }
    const then: Promise<CloudResponse>['then'] = (onFulfilled, onRejected) => (
      execute().then(onFulfilled, onRejected)
    )
    const query = {
      abortSignal: (signal: AbortSignal) => { signals.push(signal); return query },
      select: (...args: unknown[]) => step('select', args),
      eq: (...args: unknown[]) => step('eq', args),
      is: (...args: unknown[]) => step('is', args),
      order: (...args: unknown[]) => step('order', args),
      gt: (...args: unknown[]) => step('gt', args),
      limit: (...args: unknown[]) => step('limit', args),
      upsert: (...args: unknown[]) => step('upsert', args),
      update: (...args: unknown[]) => step('update', args),
      maybeSingle: (...args: unknown[]) => step('maybeSingle', args),
      then,
    }
    return query
  })

  const rpc = vi.fn((name: string, args: Record<string, unknown> = {}) => {
    let execution: Promise<CloudResponse> | undefined
    const execute = () => {
      execution ??= (async () => {
        rpcCalls.push({ name, args: structuredClone(args) })
        if (name === 'zaman_sync_protocol') return structuredClone(protocolResponse)
        const response = responses.shift()
        if (!response) throw new Error(`Tanımlanmamış Supabase test RPC isteği: ${name}`)
        return structuredClone(await response)
      })()
      return execution
    }
    const query = {
      abortSignal: (signal: AbortSignal) => { signals.push(signal); return query },
      then: ((onFulfilled, onRejected) => execute().then(onFulfilled, onRejected)) as Promise<CloudResponse>['then'],
    }
    return query
  })

  return {
    // SDK'nin bu testlerde kullanılmayan yüzeyini taklit etmiyoruz.
    client: { auth: { getUser }, from, rpc } as unknown as SupabaseClient,
    calls,
    signals,
    rpcCalls,
    setProtocolResponse: (response: CloudResponse) => { protocolResponse = response },
    get mutations() { return rpcCalls.filter((call) => call.name.startsWith('zaman_apply_')) },
    getUser,
    setUser: (next: string | null) => { userId = next },
    respondOnce: (response: CloudResponse | Promise<CloudResponse>) => { responses.push(response) },
    respondAppliedSession: (record: SessionRecord = makeSession(), version = 1) => {
      responses.push({ data: { status: 'applied', row: makeRemoteSession(record, { user_id: userId!, version, sync_seq: version }) }, error: null })
    },
    get pendingResponses() { return responses.length },
  }
}
