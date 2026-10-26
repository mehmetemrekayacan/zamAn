/**
 * Supabase client — sadece VITE_SUPABASE_* tanımlıysa kullanılır.
 * Online senkron (isim/e-posta + şifre ile kayıt) için.
 */
import { createClient, navigatorLock, processLock, type SupabaseClient } from '@supabase/supabase-js'
import { createAuthLock } from './supabaseAuthLock'

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, { auth: { lock: createAuthLock(navigatorLock, processLock) } })
  }
  return client
}

export function isCloudSyncEnabled(): boolean {
  return Boolean(url && key)
}
