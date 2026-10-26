import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { accountStorage } from './accountStorage'
import { getDataScope, type DataScope } from './dataScope'

export const TIMER_CHECKPOINT_MS = 5_000
const tickFields = new Set(['elapsedMs', 'remainingMs', 'lastTickTs', 'checkpointAt'])

/** Kararlar hemen; yalnızca saat ilerlemesi beş saniyede bir saklanır.
 * JSON serileştirmesi de atlanır. Bekleyen zamanlayıcı/yazma kuyruğu yoktur.
 */
export function createTimerPersistence<T extends object>() {
  const json = createJSONStorage<T>(() => accountStorage)!
  let last: StorageValue<T> | undefined
  let lastScope: DataScope | undefined
  let writtenAt = 0
  let immediate = false
  const forget = () => { last = undefined; lastScope = undefined; writtenAt = 0 }
  const storage: PersistStorage<T> = {
    getItem: name => { forget(); return json.getItem(name) },
    removeItem: name => { forget(); return json.removeItem(name) },
    setItem: (name, value) => {
      const now = Date.now()
      const scope = getDataScope()
      const onlyClockChanged = last && lastScope === scope && value.version === last.version
        && Object.keys(value.state).every(key => tickFields.has(key)
          || Object.is(value.state[key as keyof T], last!.state[key as keyof T]))
      if (!immediate && onlyClockChanged && now >= writtenAt && now - writtenAt < TIMER_CHECKPOINT_MS) return
      // Başarısız yazmayı başarılı checkpoint olarak hatırlama.
      const result = json.setItem(name, value)
      last = value
      lastScope = scope
      writtenAt = now
      return result
    },
  }
  return {
    storage,
    checkpoint(action: () => void) {
      const previous = immediate
      immediate = true
      try { action() } finally { immediate = previous }
    },
  }
}
