import type { SupabaseClient } from '@supabase/supabase-js'
import { initDb, runLocalTransaction } from './db'
import { assertCurrentScope, type DataScope } from './dataScope'
import { getScopedStorage } from './accountStorage'
import { canonical, newMutationId, type PreferenceSnapshot, type SettingsSyncState } from './syncProtocol'
import { validateBackup } from './backupValidation'

const SETTINGS = 'zaman-olcer-settings'
const DENEME = 'deneme-config'
const PREFERENCE_KEYS = ['sesAçık','titreşimAçık','sessizMod','tema','kısayollar','kullaniciAdi','sinavTarihi','vurguRengi']

function normalize(settings: Record<string, unknown>, deneme: Record<string, unknown> | null): PreferenceSnapshot {
  const source = settings.state && typeof settings.state === 'object' ? settings.state as Record<string, unknown> : {}
  const state = Object.fromEntries(PREFERENCE_KEYS.filter((key) => key in source).map((key) => [key, source[key]]))
  const snapshot = { settings: { state, version: 0 }, deneme_config: deneme }
  validateBackup({ version: 1, exportedAt: new Date().toISOString(), sessions: [], settingsStorage: JSON.stringify(snapshot.settings), denemeConfig: deneme ? JSON.stringify(deneme) : null })
  return snapshot
}

export function readPreferences(scope: DataScope): { snapshot: PreferenceSnapshot; fingerprint: string; exists: boolean } {
  const storage = getScopedStorage(scope)
  const settings = storage.getItem(SETTINGS)
  const deneme = storage.getItem(DENEME)
  const snapshot = normalize(settings ? JSON.parse(settings) : {}, deneme ? JSON.parse(deneme) : null)
  return { snapshot, fingerprint: canonical(snapshot), exists: Object.keys(snapshot.settings.state as object).length > 0 || deneme !== null }
}

export async function preparePreferenceMutation(scope: DataScope) {
  assertCurrentScope(scope)
  const local = readPreferences(scope)
  const db = await initDb(scope)
  assertCurrentScope(scope)
  const previous = await db.get('settings-sync', 'settings')
  if (!local.exists && !previous) return undefined
  if (previous?.pending?.fingerprint === local.fingerprint || previous?.fingerprint === local.fingerprint && !previous.pending) return previous
  const state: SettingsSyncState = {
    id: 'settings', version: previous?.version ?? 0, fingerprint: previous?.fingerprint ?? null,
    pending: { mutationId: newMutationId(), baseVersion: previous?.pending?.baseVersion ?? previous?.version ?? 0, snapshot: local.snapshot, fingerprint: local.fingerprint },
  }
  await db.put('settings-sync', state)
  return state
}

/** Senkron Storage yazımı; transaction hatasında sonraki kullanıcı düzenlemesi korunur. */
function writePreferenceSnapshot(snapshot: PreferenceSnapshot, scope: DataScope): () => void {
  assertCurrentScope(scope)
  const normalized = normalize(snapshot.settings, snapshot.deneme_config)
  const storage = getScopedStorage(scope)
  const oldSettings = storage.getItem(SETTINGS)
  const oldDeneme = storage.getItem(DENEME)
  const oldState = oldSettings ? JSON.parse(oldSettings).state ?? {} : {}
  const next = { ...normalized.settings, state: { ...(normalized.settings.state as object), bildirimİzni: oldState.bildirimİzni ?? 'default' } }
  const restore = () => {
    if (oldSettings === null) storage.removeItem(SETTINGS)
    else storage.setItem(SETTINGS, oldSettings)
    if (oldDeneme === null) storage.removeItem(DENEME)
    else storage.setItem(DENEME, oldDeneme)
  }
  try {
    storage.setItem(SETTINGS, JSON.stringify(next))
    if (normalized.deneme_config) storage.setItem(DENEME, JSON.stringify(normalized.deneme_config))
    else storage.removeItem(DENEME)
  } catch (error) {
    restore()
    throw error
  }
  const written = readPreferences(scope).fingerprint
  return () => { if (readPreferences(scope).fingerprint === written) restore() }
}

async function refreshPreferenceStore(scope: DataScope) {
  const { useSettingsStore } = await import('../store/settings')
  assertCurrentScope(scope)
  await useSettingsStore.persist.rehydrate()
  // Aktif sayaç hiçbir zaman başka cihazdan rehydrate edilmez.
  if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('zaman-preferences-updated'))
}

export async function applyPreferenceSnapshot(snapshot: PreferenceSnapshot, scope: DataScope) {
  writePreferenceSnapshot(snapshot, scope)
  await refreshPreferenceStore(scope)
}

function remotePreferences(row: unknown, scope: DataScope): { version: number; snapshot: PreferenceSnapshot } {
  const remote = row as { user_id?: string; version?: number; settings?: Record<string, unknown>; deneme_config?: Record<string, unknown> | null }
  if (!remote || !Number.isSafeInteger(remote.version) || remote.version! < 1) throw new Error('Geçersiz bulut ayar sürümü.')
  if (remote.user_id !== scope.ownerId) throw new Error('Bulut ayarları başka hesaba ait.')
  return { version: remote.version!, snapshot: normalize(remote.settings ?? {}, remote.deneme_config ?? null) }
}

export async function pullPreferences(client: SupabaseClient, scope: DataScope) {
  await preparePreferenceMutation(scope)
  const { data, error } = await client.from('user_settings').select('*').eq('user_id', scope.ownerId).abortSignal(scope.signal).maybeSingle()
  assertCurrentScope(scope)
  if (error) throw error
  if (!data) return
  const remote = remotePreferences(data, scope)
  const db = await initDb(scope)
  assertCurrentScope(scope)
  const state = await db.get('settings-sync', 'settings')
  const fingerprint = canonical(remote.snapshot)
  if (state && state.version > remote.version) return
  // Okuma sürerken yapılan yerel ayar değişikliği de korunur.
  const current = readPreferences(scope)
  const dirty = state?.pending || current.exists && current.fingerprint !== state?.fingerprint
  if (dirty && current.fingerprint !== fingerprint) {
    if (!state?.pending) await preparePreferenceMutation(scope)
    return
  }
  await applyPreferenceSnapshot(remote.snapshot, scope)
  assertCurrentScope(scope)
  await db.put('settings-sync', { id: 'settings', version: remote.version, fingerprint })
}

export async function pushPreferences(client: SupabaseClient, scope: DataScope): Promise<number> {
  const state = await preparePreferenceMutation(scope)
  const pending = state?.pending
  if (!pending) return 0
  const { data, error } = await client.rpc('zaman_apply_settings', {
    p_mutation_id: pending.mutationId, p_expected_version: pending.baseVersion,
    p_settings: pending.snapshot.settings, p_deneme_config: pending.snapshot.deneme_config,
  }).abortSignal(scope.signal)
  assertCurrentScope(scope)
  if (error) throw error
  if (!data || !['applied','conflict'].includes(data.status)) throw new Error('Geçersiz ayar eşitleme yanıtı.')
  const db = await initDb(scope)
  const remote = data.row === null ? { version: 0, snapshot: normalize({}, null) } : remotePreferences(data.row, scope)
  if (data.status === 'conflict') {
    let undo: (() => void) | undefined
    try {
      await runLocalTransaction(db, ['settings-sync', 'sync-conflicts'], async (transaction) => {
        const current = readPreferences(scope)
        // Bu iki istek ile Storage yazımı arasında await yoktur. Sonraki UI
        // düzenlemesi yeni Storage değeri olarak kalır ve bir sonraki sync'e girer.
        const conflictWrite = transaction.objectStore('sync-conflicts').put({
          id: pending.mutationId, entity: 'settings', createdAt: new Date().toISOString(), local: current.snapshot, remote: remote.snapshot,
        })
        void conflictWrite.catch(() => {})
        const stateWrite = transaction.objectStore('settings-sync').put({ id: 'settings', version: remote.version, fingerprint: canonical(remote.snapshot) })
        void stateWrite.catch(() => {})
        undo = writePreferenceSnapshot(remote.snapshot, scope)
        await Promise.all([conflictWrite, stateWrite])
      }, scope.signal)
    } catch (error) { undo?.(); throw error }
    await refreshPreferenceStore(scope)
    return 1
  }
  const current = readPreferences(scope)
  // Yanıt beklenirken yapılan yeni yerel değişikliği eski yanıtla ezme.
  const changed = current.fingerprint !== pending.fingerprint
  await db.put('settings-sync', {
    id: 'settings', version: remote.version, fingerprint: canonical(remote.snapshot),
    pending: changed ? { mutationId: newMutationId(), baseVersion: remote.version, snapshot: current.snapshot, fingerprint: current.fingerprint } : undefined,
  })
  return 0
}
