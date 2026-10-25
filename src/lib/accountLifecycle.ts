import { assertCurrentScope, changeDataScope, getDataScope, type DataScope } from './dataScope'
import { getScopedStorage } from './accountStorage'
import { useSettingsStore } from '../store/settings'
import { useTimerStore, suspendTimerForAccountChange } from '../store/timer'
import { useSessionsStore } from '../store/sessions'

let hydrated: DataScope | null = null

/** Auth callback'inde çağrılınca eski hesabı ilk await'ten önce iptal eder. */
export async function activateAccount(ownerId: string | null): Promise<DataScope> {
  const previous = getDataScope()
  if (previous === hydrated && previous.ownerId === ownerId) return previous
  suspendTimerForAccountChange()
  const scope = changeDataScope(ownerId)
  useSessionsStore.setState({ sessions: [], syncStatusById: {}, loading: false })
  // Persist hataları Zustand tarafından yakalanabilir. Hatalı hesap deposunda
  // eski hesabın ekranını göstermek yerine üst uygulama hata ekranında kalır.
  const storage = getScopedStorage(scope)
  for (const key of ['timer-storage', 'zaman-olcer-settings']) {
    const raw = storage.getItem(key)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !('state' in parsed) || !parsed.state || typeof parsed.state !== 'object') {
        throw new Error('Bu hesabın yerel ayarları okunamadı.')
      }
    }
  }
  await Promise.all([useSettingsStore.persist.rehydrate(), useTimerStore.persist.rehydrate()])
  assertCurrentScope(scope)
  if (!useSettingsStore.persist.hasHydrated() || !useTimerStore.persist.hasHydrated()) throw new Error('Hesap verileri yüklenemedi.')
  hydrated = scope
  return scope
}
