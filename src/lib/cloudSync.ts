/** Auth API. Versioned data synchronization lives in sessionSync.ts. */
import { getSupabase, isCloudSyncEnabled } from './supabase'

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

/* ─── Auth Hata Çevirisi ─── */

function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-posta veya şifre hatalı.'
  if (message.includes('Email not confirmed')) return 'E-posta adresiniz henüz onaylanmamış. Lütfen gelen kutunuzu kontrol edin veya Supabase Dashboard → Authentication → Users kısmından kullanıcıyı onaylayın.'
  if (message.includes('User already registered')) return 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.'
  if (message.includes('Password should be at least 6 characters')) return 'Şifre en az 6 karakter olmalıdır.'
  if (message.includes('invalid format')) return 'Geçersiz e-posta formatı.'
  if (message.includes('Signup requires a valid password')) return 'Geçerli bir şifre girin.'
  if (message.includes('rate limit')) return 'Çok fazla deneme. Lütfen birkaç dakika bekleyin.'
  if (message.includes('security purposes')) return 'Güvenlik nedeniyle lütfen biraz bekleyin.'
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('ERR_'))
    return 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.'
  return message
}

export async function signUp(
  email: string,
  password: string,
  isim: string
): Promise<{ ok: true; user: AuthUser; message?: string } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış. .env.local dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalı.' }
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: isim.trim() || email.split('@')[0] } },
    })
    if (error) return { ok: false, error: translateAuthError(error.message) }
    if (!data.user) return { ok: false, error: 'Kayıt tamamlanamadı.' }

    // Aynı e-posta ile tekrar kayıt denemesi (Supabase güvenlik için sahte cevap döner)
    if (data.user.identities?.length === 0) {
      return { ok: false, error: 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.' }
    }

    const user: AuthUser = {
      id: data.user.id,
      email: data.user.email ?? '',
      displayName: (data.user.user_metadata?.display_name as string) ?? null,
    }

    // E-posta onayı gerekiyorsa session oluşmaz
    if (!data.session) {
      return {
        ok: true,
        user,
        message: '📧 Kayıt başarılı! E-posta onayı gerekiyor — gelen kutunuzu kontrol edin. (Supabase Dashboard → Authentication → Users kısmından da manuel onaylayabilirsiniz.)',
      }
    }

    return { ok: true, user }
  } catch (e) {
    return { ok: false, error: translateAuthError((e as Error).message) }
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış. .env.local dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalı.' }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return { ok: false, error: translateAuthError(error.message) }
    if (!data.user) return { ok: false, error: 'Giriş yapılamadı.' }
    return {
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        displayName: (data.user.user_metadata?.display_name as string) ?? null,
      },
    }
  } catch (e) {
    return { ok: false, error: translateAuthError((e as Error).message) }
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  if (supabase) {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(translateAuthError(error.message))
  }
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


export { pushCloud, pullCloud, syncCloud, getLastSyncTime, checkSupabaseHealth } from './sessionSync'
export { isCloudSyncEnabled }
