import { initDb, runLocalTransaction } from './db'
import { assertCurrentScope, getDataScope, type DataScope } from './dataScope'
import { assertRemoteRow, newMutationId, rowToSession, sessionFingerprint, type PendingSessionMutation, type RemoteSessionRow, type SessionSyncState, type SyncConflict } from './syncProtocol'

/** Yerel satır ve bekleyen değişiklik tek IndexedDB transaction'ıyla saklanır. */
export async function getPendingSessions(scope: DataScope) {
  const db = await initDb(scope)
  return (await db.getAll('sync-state')).filter((state) => state.pending)
}

export async function seedPendingSession(id: string, pending: PendingSessionMutation, scope: DataScope, replace = false) {
  const db = await initDb(scope)
  await runLocalTransaction(db, ['sessions','sync-state'], async (transaction) => {
  const previous = await transaction.objectStore('sync-state').get(id)
  if (!previous || replace) {
    await transaction.objectStore('sync-state').put({ id, version: previous?.version ?? 0, fingerprint: previous?.fingerprint ?? null, remote: previous?.remote, pending })
    if (pending.action === 'upsert_session' && pending.payload && !await transaction.objectStore('sessions').get(id)) {
      await transaction.objectStore('sessions').put(pending.payload)
    }
  }
  })
}

/** Yedek/eski sürümden gelen metadatasız değişiklikler kaybolmadan kuyruğa döner. */
export async function reconcileLocalSessions(scope: DataScope) {
  const db = await initDb(scope)
  await runLocalTransaction(db, ['sessions','sync-state'], async (transaction) => {
  const records = await transaction.objectStore('sessions').getAll()
  for (const record of records) {
    const state = await transaction.objectStore('sync-state').get(record.id)
    if (state?.pending || state?.fingerprint === sessionFingerprint(record)) continue
    await transaction.objectStore('sync-state').put({
      id: record.id, version: state?.version ?? 0, fingerprint: state?.fingerprint ?? null, remote: state?.remote,
      pending: { mutationId: newMutationId(), baseVersion: state?.version ?? 0, action: 'upsert_session', payload: record },
    })
  }
  })
}

export async function acceptRemoteSession(row: RemoteSessionRow, scope: DataScope, accepted?: PendingSessionMutation, conflict = false) {
  assertRemoteRow(row)
  assertCurrentScope(scope)
  if (row.user_id !== scope.ownerId) throw new Error('Bulut kaydı başka hesaba ait.')
  const db = await initDb(scope)
  assertCurrentScope(scope)
  await runLocalTransaction(db, ['sessions','sync-state','sync-conflicts'], async (transaction) => {
    const previous = await transaction.objectStore('sync-state').get(row.id)
    const newest = previous?.remote && previous.remote.version > row.version ? previous.remote : row
    let pending = previous?.pending
    if (pending?.action === 'upsert_session' && pending.payload && newest.deleted_at === null
      && sessionFingerprint(pending.payload) === sessionFingerprint(rowToSession(newest))) pending = undefined
    if (pending?.action === 'delete_session' && newest.deleted_at !== null) pending = undefined
    if (pending && (conflict || (newest.deleted_at !== null && !accepted))) {
      const saved: SyncConflict = {
        id: pending.mutationId, entity: 'session', sessionId: row.id, createdAt: new Date().toISOString(),
        local: pending.payload ?? null, action: pending.action, remote: newest,
      }
      await transaction.objectStore('sync-conflicts').put(saved)
      pending = undefined
    } else if (pending && accepted) {
      pending = pending.mutationId === accepted.mutationId ? undefined : {
        ...pending,
        baseVersion: pending.baseVersion === accepted.baseVersion ? row.version : pending.baseVersion,
      }
    }
    if (!pending) {
      if (newest.deleted_at !== null) await transaction.objectStore('sessions').delete(row.id)
      else await transaction.objectStore('sessions').put(rowToSession(newest))
    }
    const state: SessionSyncState = {
      id: row.id, version: newest.version,
      fingerprint: newest.deleted_at === null ? sessionFingerprint(rowToSession(newest)) : null,
      remote: newest, pending,
    }
    await transaction.objectStore('sync-state').put(state)
  }, scope.signal)
}

export async function listSyncConflicts(scope: DataScope = getDataScope()) {
  const db = await initDb(scope)
  return db.getAll('sync-conflicts')
}

export async function acceptMissingRemote(id: string, scope: DataScope) {
  assertCurrentScope(scope)
  const db = await initDb(scope)
  await runLocalTransaction(db, ['sessions','sync-state','sync-conflicts'], async (transaction) => {
  const state = await transaction.objectStore('sync-state').get(id)
  if (state?.pending) {
    await transaction.objectStore('sync-conflicts').put({
      id: state.pending.mutationId, entity: 'session', sessionId: id, createdAt: new Date().toISOString(),
      action: state.pending.action, local: state.pending.payload ?? null, remote: null,
    })
    await transaction.objectStore('sync-state').put({ id, version: 0, fingerprint: null })
    await transaction.objectStore('sessions').delete(id)
  }
  }, scope.signal)
}
