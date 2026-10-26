import { expect, it, vi } from 'vitest'
import type { LockFunc } from '@supabase/supabase-js'
import { createAuthLock } from '../../lib/supabaseAuthLock'
// Yalnızca kurulu SDK'nin kilit fonksiyonu ve bir prototip yöntemi kullanılır.
// Auth/Supabase istemcisi oluşturulmaz; ağ global setup tarafından engellidir.
import { GoTrueClient, navigatorLock } from '@supabase/auth-js'

function setup(available: boolean) {
  const browser = vi.fn()
  const fallback = vi.fn()
  const browserLock: LockFunc = async (name, timeout, fn) => { browser(name, timeout, fn); return fn() }
  const fallbackLock: LockFunc = async (name, timeout, fn) => { fallback(name, timeout, fn); return fn() }
  const callbackResults: Promise<unknown>[] = []
  const request = vi.fn((_name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => {
    const result = Promise.resolve(callback(available ? { name: 'test', mode: 'exclusive' } as Lock : null))
    callbackResults.push(result)
    return result
  })
  vi.stubGlobal('navigator', { locks: { request } })
  return { lock: createAuthLock(browserLock, fallbackLock), request, browser, fallback, callbackResults }
}

it('kurulu SDK varsayılanında dolu kilit native callback Promise reddi üretir', async () => {
  const test = setup(false)
  await expect(navigatorLock('auth-test', 0, async () => 'çalışmamalı')).rejects.toMatchObject({ isAcquireTimeout: true })
  await expect(test.callbackResults[0]).rejects.toMatchObject({ message: expect.stringContaining('immediately failed') })
})

it('meşgul kilitte native callback reddedilmez; SDK timeout işaretini alır, işlem çalışmaz', async () => {
  const test = setup(false)
  const work = vi.fn(async () => 'token')
  const result = test.lock('auth-test', 0, work)
  await expect(result).rejects.toMatchObject({ isAcquireTimeout: true })
  await expect(test.callbackResults[0]).resolves.toEqual({ acquired: false })
  expect(work).not.toHaveBeenCalled()
  expect(test.request).toHaveBeenCalledWith('auth-test', { mode: 'exclusive', ifAvailable: true }, expect.any(Function))
  expect(test.browser).not.toHaveBeenCalled()
})

it('kurulu SDK otomatik yenilemede meşgul sonucunu yakalayıp sonraki denemeye bırakır', async () => {
  const test = setup(false)
  const debug = vi.fn()
  const tick = Reflect.get(GoTrueClient.prototype, '_autoRefreshTokenTick') as (this: unknown) => Promise<void>
  await expect(tick.call({
    _debug: debug,
    _acquireLock: (timeout: number, fn: () => Promise<unknown>) => test.lock('auth-test', timeout, fn),
  })).resolves.toBeUndefined()
  await expect(test.callbackResults[0]).resolves.toEqual({ acquired: false })
  expect(debug).toHaveBeenCalledWith('auto refresh token tick lock not available')
})

it('kilit alındığında işlem sonucunu aynen döndürür ve bitene kadar kilidi tutar', async () => {
  const test = setup(true)
  let complete!: (value: string) => void
  let released = false
  const result = test.lock('auth-test', 0, () => new Promise<string>(resolve => { complete = resolve }))
  void test.callbackResults[0].then(() => { released = true })
  await Promise.resolve()
  expect(released).toBe(false)
  complete('yenilenen-token')
  await expect(result).resolves.toBe('yenilenen-token')
  expect(released).toBe(true)
})

it('gerçek işlem hatasını timeout olarak gizlemez', async () => {
  const test = setup(true)
  const failure = new Error('Gerçek yenileme hatası')
  await expect(test.lock('auth-test', 0, async () => { throw failure })).rejects.toBe(failure)
  expect(failure).not.toHaveProperty('isAcquireTimeout')
})

it.each([-1, 5000])('bekleyen auth işleminin SDK kilidini ve zaman aşımını korur: %s', async timeout => {
  const test = setup(false)
  const work = vi.fn(async () => 42)
  await expect(test.lock('auth-test', timeout, work)).resolves.toBe(42)
  expect(test.browser).toHaveBeenCalledWith('auth-test', timeout, work)
  expect(test.request).not.toHaveBeenCalled()
})

it('Web Locks olmayan ortamda süreç kilidine geçer', async () => {
  const test = setup(false)
  vi.stubGlobal('navigator', {})
  const work = vi.fn(async () => 'sonuç')
  await expect(test.lock('auth-test', 0, work)).resolves.toBe('sonuç')
  expect(test.fallback).toHaveBeenCalledWith('auth-test', 0, work)
  expect(test.request).not.toHaveBeenCalled()
})
