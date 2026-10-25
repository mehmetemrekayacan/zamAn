import type { SupabaseClient } from '@supabase/supabase-js'
import { assertCurrentScope, type DataScope } from './dataScope'

const checked = new WeakSet<DataScope>()
export const UPGRADE_MESSAGE = 'Bulut hizmeti güncellemesi gerekiyor. Yerel kayıtlar korundu.'

export async function ensureSyncProtocol(client: SupabaseClient, scope: DataScope) {
  assertCurrentScope(scope)
  if (checked.has(scope)) return
  const { data, error } = await client.rpc('zaman_sync_protocol').abortSignal(scope.signal)
  assertCurrentScope(scope)
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) throw new Error(UPGRADE_MESSAGE)
    throw new Error(error.message)
  }
  if (data?.version !== 3) throw new Error(UPGRADE_MESSAGE)
  checked.add(scope)
}

export function cloudError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Senkronizasyon tamamlanamadı. Yerel kayıtlar korundu.'
}
