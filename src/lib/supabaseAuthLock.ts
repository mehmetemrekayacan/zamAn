import type { LockFunc } from '@supabase/supabase-js'

class AuthLockAcquireTimeoutError extends Error {
  // auth-js bu işaretle meşgul kilidi tanır ve arka plan tick'ini atlar.
  readonly isAcquireTimeout = true
}

/**
 * 0 ms, beklemeyen otomatik yenileme denemesidir. Meşgul kilit sonucunu
 * tarayıcı callback'inde reddedilen Promise üretmeden auth-js'e iletir.
 * Bekleyen işlemlerde SDK kilidi, Web Locks yoksa süreç kilidi kullanılır.
 */
export function createAuthLock(browserLock: LockFunc, fallbackLock: LockFunc): LockFunc {
  return async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
    if (typeof navigator === 'undefined' || !navigator.locks?.request) {
      return fallbackLock(name, acquireTimeout, fn)
    }
    if (acquireTimeout !== 0) return browserLock(name, acquireTimeout, fn)

    const result = await navigator.locks.request<Promise<{ acquired: false } | { acquired: true; value: R }>>(
      name,
      { mode: 'exclusive', ifAvailable: true },
      async lock => lock
        ? { acquired: true as const, value: await fn() }
        : { acquired: false as const },
    )
    if (!result.acquired) {
      // Bu hata native LockManager callback'inden değil, SDK'nin await ettiği
      // kendi Promise'imizden çıkar. Kilitsiz fn() çalıştırmak güvenli değildir.
      throw new AuthLockAcquireTimeoutError(`Auth lock "${name}" is busy`)
    }
    return result.value
  }
}
