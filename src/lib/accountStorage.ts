import { getDataScope, type DataScope } from './dataScope'

/** Eski anahtarlar misafire aittir; hesap anahtarları onlarla çakışmaz. */
export function getScopedStorage(scope: DataScope = getDataScope()) {
  const keyFor = (key: string) => scope.ownerId === null
    ? key
    : `zaman-account:${encodeURIComponent(scope.ownerId)}:${key}`
  return {
    getItem: (key: string) => localStorage.getItem(keyFor(key)),
    setItem: (key: string, value: string) => localStorage.setItem(keyFor(key), value),
    removeItem: (key: string) => localStorage.removeItem(keyFor(key)),
  }
}

/** Zustand persist erişim anındaki açık hesabı kullanır. */
export const accountStorage = {
  getItem: (key: string) => getScopedStorage().getItem(key),
  setItem: (key: string, value: string) => getScopedStorage().setItem(key, value),
  removeItem: (key: string) => getScopedStorage().removeItem(key),
}
