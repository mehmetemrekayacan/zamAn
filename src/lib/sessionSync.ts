import { getSupabase } from './supabase'
import { getCurrentUser } from './cloudSync'
import { initDb, clearAllSessions, deleteSession, listSessions, saveSession } from './db'
import { assertCurrentScope, getDataScope, isCurrentScope, type DataScope } from './dataScope'
import { getScopedStorage } from './accountStorage'
import { cloudError, ensureSyncProtocol } from './cloudProtocol'
import { processQueue, waitForQueueIdle, withEmptySyncQueue } from './offlineSync'
import { acceptRemoteSession, listSyncConflicts, reconcileLocalSessions } from './localSync'
import { assertRemoteRow, type PreferenceSnapshot } from './syncProtocol'
import { applyPreferenceSnapshot, preparePreferenceMutation, pullPreferences, pushPreferences } from './preferenceSync'
import { markSyncActive } from './syncActivity'
import type { SessionRecord } from '../types'

type CloudSuccess = { ok: true; pushed: number; pulled: number; merged: number; conflicts: number }
export type CloudResult = CloudSuccess | { ok: false; error: string }
const operations = new Map<DataScope, { mode: string; promise: Promise<CloudResult> }>()

async function pullSessions(scope: DataScope): Promise<{ pulled: number; merged: number }> {
  const client = getSupabase()!
  const db = await initDb(scope)
  let cursor = (await db.get('sync-cursors', 'sessions'))?.sequence ?? 0
  let pulled = 0
  let merged = 0
  while (true) {
    const { data, error } = await client.from('sessions').select('*').eq('user_id', scope.ownerId)
      .gt('sync_seq', cursor).order('sync_seq', { ascending: true }).limit(200).abortSignal(scope.signal)
    assertCurrentScope(scope)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Geçersiz bulut seans listesi.')
    for (const row of data) {
      assertRemoteRow(row)
      if (row.sync_seq <= cursor) throw new Error('Bulut seans sırası geçersiz.')
      const previous = await db.get('sessions', row.id)
      await acceptRemoteSession(row, scope)
      if (row.deleted_at === null) {
        if (previous) merged++
        else pulled++
      }
      cursor = row.sync_seq
    }
    assertCurrentScope(scope)
    if (data.length > 0) await db.put('sync-cursors', { id: 'sessions', sequence: cursor })
    if (data.length < 200) break
  }
  return { pulled, merged }
}

async function execute(mode: 'sync' | 'push' | 'pull', scope: DataScope): Promise<CloudResult> {
  try {
    assertCurrentScope(scope)
    const client = getSupabase()
    if (!client) throw new Error('Online senkron yapılandırılmamış.')
    const user = await getCurrentUser()
    assertCurrentScope(scope)
    if (scope.ownerId === null || user?.id !== scope.ownerId) throw new Error('Açık hesap ile veri sahibi uyuşmuyor. Yeniden giriş yapıp dene.')
    await ensureSyncProtocol(client, scope)
    await waitForQueueIdle(scope)
    await reconcileLocalSessions(scope)
    await preparePreferenceMutation(scope)
    const initialConflicts = (await listSyncConflicts(scope)).length
    let totals = { pulled: 0, merged: 0 }
    if (mode !== 'push') {
      totals = await pullSessions(scope)
      await pullPreferences(client, scope)
    }
    let pushed = 0
    let conflicts = 0
    if (mode !== 'pull') {
      const queue = await processQueue(scope)
      pushed = queue.flushed
      conflicts += queue.conflicts
      if (queue.failed > 0 || queue.scheduled > 0) throw new Error('Bazı seanslar henüz eşitlenemedi. Yerel kayıtlar korundu; yeniden denenecek.')
      conflicts += await pushPreferences(client, scope)
      if (mode === 'sync') {
        const after = await pullSessions(scope)
        totals = { pulled: totals.pulled + after.pulled, merged: totals.merged + after.merged }
      }
    }
    assertCurrentScope(scope)
    conflicts = Math.max(conflicts, (await listSyncConflicts(scope)).length - initialConflicts)
    getScopedStorage(scope).setItem('zaman-last-sync', new Date().toISOString())
    return { ok: true, pushed, ...totals, conflicts }
  } catch (error) { return { ok: false, error: cloudError(error) } }
}

function run(mode: 'sync' | 'push' | 'pull', scope: DataScope): Promise<CloudResult> {
  const existing = operations.get(scope)
  if (existing) {
    if (existing.mode === mode || existing.mode === 'sync') return existing.promise
    return existing.promise.then(() => run(mode, scope))
  }
  markSyncActive(scope, true)
  const promise = execute(mode, scope).finally(async () => {
    if (isCurrentScope(scope)) {
      try {
        const { useSessionsStore } = await import('../store/sessions')
        if (isCurrentScope(scope)) await useSessionsStore.getState().loadSessions()
      } catch (error) { console.error('Yerel ekran yenilenemedi:', cloudError(error)) }
    }
    if (operations.get(scope)?.promise === promise) operations.delete(scope)
    markSyncActive(scope, false)
    if (isCurrentScope(scope) && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('zaman-sync-updated'))
  })
  operations.set(scope, { mode, promise })
  return promise
}

export function syncCloud() { return run('sync', getDataScope()) }
export function pushCloud(scope = getDataScope()) { return run('push', scope) }
export function pullCloud(scope = getDataScope()) { return run('pull', scope) }
export function getLastSyncTime() { return getScopedStorage().getItem('zaman-last-sync') }

export async function checkSupabaseHealth(): Promise<{ ok: boolean; message: string }> {
  const scope = getDataScope()
  const client = getSupabase()
  if (!client) return { ok: false, message: 'Online senkron yapılandırılmamış.' }
  if (scope.ownerId === null) return { ok: true, message: 'Hesaba giriş yaptıktan sonra eşitleme açılır.' }
  try { await ensureSyncProtocol(client, scope); return { ok: true, message: 'Bulut eşitlemesi hazır.' } }
  catch (error) { return { ok: false, message: cloudError(error) } }
}

/** Yerel temizlik buluta silme göndermez; bekleyen değişiklikleri sessizce atmaz. */
export async function clearLocalSessions() {
  const scope = getDataScope()
  await withEmptySyncQueue(() => clearAllSessions(scope), scope)
}

export async function deleteAllSyncedSessions(): Promise<CloudResult> {
  const scope = getDataScope()
  const before = await syncCloud()
  if (!before.ok) return before
  if ((await listSyncConflicts(scope)).length > 0) return { ok: false, error: 'Önce korunan çakışmaları çöz.' }
  assertCurrentScope(scope)
  for (const record of await listSessions(undefined, scope)) {
    assertCurrentScope(scope)
    await deleteSession(record.id, scope)
  }
  return syncCloud()
}

export async function resolveSyncConflict(id: string, keepLocal: boolean) {
  const scope = getDataScope()
  const db = await initDb(scope)
  const conflict = await db.get('sync-conflicts', id)
  if (!conflict) return
  assertCurrentScope(scope)
  if (keepLocal) {
    if (conflict.entity === 'settings') {
      await applyPreferenceSnapshot(conflict.local as PreferenceSnapshot, scope)
      await preparePreferenceMutation(scope)
    } else if (conflict.action === 'delete_session' && conflict.sessionId) {
      await deleteSession(conflict.sessionId, scope)
    } else if (conflict.local) {
      await saveSession({ ...conflict.local as SessionRecord, id: `recovered:${conflict.id}` }, scope)
    }
  }
  assertCurrentScope(scope)
  await db.delete('sync-conflicts', id)
  const { useSessionsStore } = await import('../store/sessions')
  assertCurrentScope(scope)
  await useSessionsStore.getState().loadSessions()
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('zaman-sync-updated'))
}

export { listSyncConflicts }
