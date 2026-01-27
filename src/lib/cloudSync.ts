/**
 * Online senkron: Supabase ile kayıt/giriş (isim, e-posta, şifre) ve veri sync.
 * Ayarlar'da "Hesap" bölümünde kayıt ol / giriş yap → Buluta kaydet / Buluttan çek.
 */
import { getSupabase, isCloudSyncEnabled } from './supabase'
import type { ExportPayload } from './sync'
import { applyPayload, exportData } from './sync'

const SYNC_TABLE = 'sync_data'

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

export async function signUp(
  email: string,
  password: string,
  isim: string
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış.' }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: isim.trim() || email.split('@')[0] } },
  })
  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'Kayıt tamamlanamadı.' }
  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      displayName: (data.user.user_metadata?.display_name as string) ?? null,
    },
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış.' }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'Giriş yapılamadı.' }
  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      displayName: (data.user.user_metadata?.display_name as string) ?? null,
    },
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  if (supabase) await supabase.auth.signOut()
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: (user.user_metadata?.display_name as string) ?? null,
  }
}

export async function pushCloud(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Önce giriş yapmalısın.' }
  const blob = await exportData()
  const raw = await blob.text()
  const payload = JSON.parse(raw) as ExportPayload
  const { error } = await supabase.from(SYNC_TABLE).upsert(
    { user_id: user.id, data: payload, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function pullCloud(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Önce giriş yapmalısın.' }
  const { data, error } = await supabase
    .from(SYNC_TABLE)
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data?.data) return { ok: false, error: 'Bulutta veri yok.' }
  return applyPayload(data.data as ExportPayload)
}

export { isCloudSyncEnabled }
