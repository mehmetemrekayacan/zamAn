/**
 * Online senkron v2: Supabase ile kayıt/giriş ve **seans bazlı merge sync**.
 *
 * Önemli değişiklikler (v1 → v2):
 * - Eski: Tüm veri tek JSONB blob → son yazan kazanır → veri kaybı riski
 * - Yeni: Her seans kendi satırı → ID bazlı upsert → çoklu cihaz güvenli
 * - Ayarlar ayrı `user_settings` tablosunda (updatedAt karşılaştırmalı)
 * - Offline sync kuyruğu desteği (bkz. offlineSync.ts)
 */
import { getSupabase, isCloudSyncEnabled } from './supabase'
import { listSessions, saveSession as dbSaveSession } from './db'
import type { SessionRecord } from '../types'

/* ─── Sabitler ─── */
const SESSIONS_TABLE = 'sessions'
const SETTINGS_TABLE = 'user_settings'
const SYNC_TABLE = 'sync_data'             // ← eski tablo, geriye uyumluluk
const SETTINGS_STORAGE_KEY = 'zaman-olcer-settings'
const TIMER_STORAGE_KEY = 'timer-storage'
const DENEME_CONFIG_KEY = 'deneme-config'
const LAST_SYNC_KEY = 'zaman-last-sync'     // ISO string — son başarılı sync zamanı

/* ─── Auth ─── */

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

/* ─── Yardımcı: SessionRecord ↔ DB satırı dönüşümleri ─── */

interface DbSessionRow {
  id: string
  user_id: string
  mod: string
  sure_plan: number | null
  sure_gercek: number
  puan: number
  tarih_iso: string
  not_text: string | null
  duraklatma: number
  erken_bitirme: number | null
  odak_skoru: number | null
  mola_saniye: number | null
  deneme_molalar: number[] | null
  dogru_sayisi: number | null
  yanlis_sayisi: number | null
  bos_sayisi: number | null
  bolumler: { ad: string; surePlan?: number; sureGercek: number }[] | null
  platform: { cihaz?: string; userAgentHash?: string } | null
  ruh_hali: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function sessionToRow(s: SessionRecord, userId: string): DbSessionRow {
  return {
    id: s.id,
    user_id: userId,
    mod: s.mod,
    sure_plan: s.surePlan ?? null,
    sure_gercek: s.sureGercek,
    puan: s.puan,
    tarih_iso: s.tarihISO,
    not_text: s.not ?? null,
    duraklatma: s.duraklatmaSayisi,
    erken_bitirme: s.erkenBitirmeSuresi ?? null,
    odak_skoru: s.odakSkoru ?? null,
    mola_saniye: s.molaSaniye ?? null,
    deneme_molalar: s.denemeMolalarSaniye ?? null,
    dogru_sayisi: s.dogruSayisi ?? null,
    yanlis_sayisi: s.yanlisSayisi ?? null,
    bos_sayisi: s.bosSayisi ?? null,
    bolumler: s.bolumler ?? null,
    platform: s.platform ?? null,
    ruh_hali: s.ruhHali ?? null,
    created_at: s.createdAt || new Date().toISOString(),
    updated_at: s.updatedAt || new Date().toISOString(),
    deleted_at: null,
  }
}

function rowToSession(r: DbSessionRow): SessionRecord {
  return {
    id: r.id,
    mod: r.mod as SessionRecord['mod'],
    surePlan: r.sure_plan ?? undefined,
    sureGercek: r.sure_gercek,
    puan: r.puan,
    tarihISO: r.tarih_iso,
    not: r.not_text ?? undefined,
    duraklatmaSayisi: r.duraklatma,
    erkenBitirmeSuresi: r.erken_bitirme ?? undefined,
    odakSkoru: r.odak_skoru ?? undefined,
    molaSaniye: r.mola_saniye ?? undefined,
    denemeMolalarSaniye: r.deneme_molalar ?? undefined,
    dogruSayisi: r.dogru_sayisi ?? undefined,
    yanlisSayisi: r.yanlis_sayisi ?? undefined,
    bosSayisi: r.bos_sayisi ?? undefined,
    bolumler: r.bolumler ?? undefined,
    platform: r.platform ?? undefined,
    ruhHali: (r.ruh_hali as SessionRecord['ruhHali']) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/* ─── PUSH: Yerel → Bulut (seans bazlı merge) ─── */

export async function pushCloud(): Promise<{ ok: true; pushed: number } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Önce giriş yapmalısın.' }

  const localSessions = await listSessions()
  if (localSessions.length === 0) return { ok: true, pushed: 0 }

  // Batch upsert — Supabase onConflict ile (id, user_id) bazında
  const rows = localSessions.map((s) => sessionToRow(s, user.id))

  // 200'erli batch'ler halinde gönder (Supabase limit)
  const BATCH = 200
  let pushed = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(SESSIONS_TABLE).upsert(batch, { onConflict: 'id,user_id' })
    if (error) return { ok: false, error: error.message }
    pushed += batch.length
  }

  // Ayarları da kaydet
  await pushSettings(user.id)

  // Son sync zamanını kaydet
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString())

  return { ok: true, pushed }
}

/* ─── PULL: Bulut → Yerel (merge — ID bazlı, updatedAt karşılaştırmalı) ─── */

export async function pullCloud(): Promise<{ ok: true; pulled: number; merged: number } | { ok: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Online senkron yapılandırılmamış.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Önce giriş yapmalısın.' }

  // Tüm bulut seanslarını çek
  const { data: cloudRows, error } = await supabase
    .from(SESSIONS_TABLE)
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('tarih_iso', { ascending: false })

  if (error) return { ok: false, error: error.message }
  if (!cloudRows || cloudRows.length === 0) {
    // Yeni tablo boşsa eski sync_data'dan migrasyon dene
    const migrated = await migrateFromLegacy(user.id)
    if (migrated) return { ok: true, pulled: migrated, merged: 0 }
    return { ok: false, error: 'Bulutta veri yok.' }
  }

  // Yerel seansları al → ID map
  const localSessions = await listSessions()
  const localMap = new Map(localSessions.map((s) => [s.id, s]))

  let pulled = 0
  let merged = 0

  for (const row of cloudRows as DbSessionRow[]) {
    const cloudSession = rowToSession(row)
    const local = localMap.get(cloudSession.id)

    if (!local) {
      // Yerel'de yok → ekle
      await dbSaveSession(cloudSession)
      pulled++
    } else {
      // İkisi de var → updatedAt karşılaştır, yeni olanı al
      const localTs = new Date(local.updatedAt || local.createdAt || local.tarihISO).getTime()
      const cloudTs = new Date(cloudSession.updatedAt || cloudSession.createdAt || cloudSession.tarihISO).getTime()
      if (cloudTs > localTs) {
        await dbSaveSession(cloudSession)
        merged++
      }
    }
  }

  // Ayarları da çek (updatedAt karşılaştırmalı)
  await pullSettings(user.id)

  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString())

  return { ok: true, pulled, merged }
}

/* ─── ÇİFT YÖNLÜ SYNC (push + pull birlikte) ─── */

export async function syncCloud(): Promise<{ ok: true; pushed: number; pulled: number; merged: number } | { ok: false; error: string }> {
  // Önce push (yerel değişiklikleri gönder)
  const pushResult = await pushCloud()
  if (!pushResult.ok) return pushResult

  // Sonra pull (buluttaki değişiklikleri al)
  const pullResult = await pullCloud()
  if (!pullResult.ok) return pullResult

  return {
    ok: true,
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    merged: pullResult.merged,
  }
}

/* ─── Ayarlar Sync ─── */

async function pushSettings(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const settings = localStorage.getItem(SETTINGS_STORAGE_KEY)
  const timerStorage = localStorage.getItem(TIMER_STORAGE_KEY)
  const denemeConfig = localStorage.getItem(DENEME_CONFIG_KEY)

  await supabase.from(SETTINGS_TABLE).upsert({
    user_id: userId,
    settings: settings ? JSON.parse(settings) : {},
    timer_storage: timerStorage ? JSON.parse(timerStorage) : null,
    deneme_config: denemeConfig ? JSON.parse(denemeConfig) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

async function pullSettings(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const { data } = await supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return

  // updatedAt karşılaştıralı — bulut daha yeniyse uygula
  const cloudTs = new Date(data.updated_at).getTime()
  const localSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
  let localTs = 0
  if (localSettings) {
    try {
      const parsed = JSON.parse(localSettings)
      if (parsed?.state?.updatedAt) localTs = new Date(parsed.state.updatedAt).getTime()
    } catch { /* ignore */ }
  }

  if (cloudTs > localTs || localTs === 0) {
    if (data.settings && Object.keys(data.settings).length > 0) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data.settings))
    }
    if (data.timer_storage) {
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(data.timer_storage))
    }
    if (data.deneme_config) {
      localStorage.setItem(DENEME_CONFIG_KEY, JSON.stringify(data.deneme_config))
    }
  }
}

/* ─── Eski sync_data'dan Migrasyon ─── */

async function migrateFromLegacy(userId: string): Promise<number> {
  const supabase = getSupabase()
  if (!supabase) return 0

  const { data } = await supabase
    .from(SYNC_TABLE)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data?.data) return 0

  interface LegacyPayload {
    sessions?: SessionRecord[]
    settingsStorage?: string | null
    timerStorage?: string | null
    denemeConfig?: string | null
  }
  const legacy = data.data as LegacyPayload
  if (!legacy.sessions || legacy.sessions.length === 0) return 0

  // Eski seansları yeni tabloya aktar
  const rows = legacy.sessions
    .filter((s) => s?.id && typeof s.tarihISO === 'string')
    .map((s) => sessionToRow(s, userId))

  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await supabase.from(SESSIONS_TABLE).upsert(batch, { onConflict: 'id,user_id' })
  }

  // Eski ayarları da yeni tabloya kopyala
  if (legacy.settingsStorage || legacy.timerStorage || legacy.denemeConfig) {
    await supabase.from(SETTINGS_TABLE).upsert({
      user_id: userId,
      settings: legacy.settingsStorage ? JSON.parse(legacy.settingsStorage) : {},
      timer_storage: legacy.timerStorage ? JSON.parse(legacy.timerStorage) : null,
      deneme_config: legacy.denemeConfig ? JSON.parse(legacy.denemeConfig) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  // Yerel'e de uygula
  for (const s of legacy.sessions) {
    if (s?.id && typeof s.tarihISO === 'string') {
      await dbSaveSession(s)
    }
  }

  return legacy.sessions.length
}

/* ─── Son sync bilgisi ─── */

export function getLastSyncTime(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY)
}

export { isCloudSyncEnabled }
