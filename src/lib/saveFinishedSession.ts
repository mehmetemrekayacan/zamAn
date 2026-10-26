import { assertCurrentScope, type DataScope } from './dataScope'
import { useTimerStore } from '../store/timer'
import { useSessionsStore } from '../store/sessions'
import { emptyFinishForm, finishedSessionRecord } from './finishedSession'
import type { SessionRecord } from '../types'

const saving = new Map<string, Promise<SessionRecord>>()

/** Aynı hesabın aynı seansı için eşzamanlı çağrılar tek yerel yazmayı paylaşır. */
export function saveFinishedSession(scope: DataScope): Promise<SessionRecord> {
  assertCurrentScope(scope)
  const timer = useTimerStore.getState()
  if (timer.status !== 'finished' || !timer.finishedSession || !timer.finishScore) {
    return Promise.reject(new Error('Kaydedilecek bitmiş seans bulunamadı.'))
  }
  const key = `${scope.generation}:${timer.finishedSession.id}`
  const existing = saving.get(key)
  if (existing) return existing
  const record = finishedSessionRecord(timer.finishedSession, timer.finishScore, timer.finishForm ?? emptyFinishForm())
  const pending = (async () => {
    await useSessionsStore.getState().addSession(record)
    assertCurrentScope(scope)
    return record
  })()
  saving.set(key, pending)
  const clear = () => { if (saving.get(key) === pending) saving.delete(key) }
  void pending.then(clear, clear)
  return pending
}
