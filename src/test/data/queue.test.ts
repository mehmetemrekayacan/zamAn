import { describe, expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { makeSession } from '../helpers/fixtures'
import { createSupabaseStub } from '../helpers/supabase'

describe('çevrimdışı kuyruk ve kontrollü bulut yanıtları', () => {
  it('aynı seansın bekleyen eski işlemini son işlemle değiştirir', async () => {
    const { queue } = await loadDataEnvironment()
    await queue.enqueueSync('upsert_session', 'test-session', makeSession())
    await queue.enqueueSync('delete_session', 'test-session')
    expect(await queue.getQueueItems()).toMatchObject([
      { sessionId: 'test-session', action: 'delete_session', retryCount: 0 },
    ])
  })

  it('oturum yokken kuyruğu korur; girişten sonra başarılı işlemi çıkarır', async () => {
    const { queue, supabase } = await loadDataEnvironment('test-user-a')
    const remote = createSupabaseStub(null)
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    await queue.enqueueSync('upsert_session', 'test-session', makeSession())

    expect(await queue.processQueue()).toMatchObject({ flushed: 0, failed: 0, scheduled: 0 })
    expect(await queue.getQueueLength()).toBe(1)
    expect(remote.calls).toEqual([])

    remote.setUser('test-user-a')
    remote.respondAppliedSession()
    expect(await queue.processQueue()).toMatchObject({ flushed: 1, failed: 0, scheduled: 0 })
    expect(await queue.getQueueLength()).toBe(0)
    expect(remote.mutations).toMatchObject([{ name: 'zaman_apply_session', args: { p_id: 'test-session', p_expected_version: 0, p_payload: { sure_gercek: 3600 } } }])
    expect(remote.pendingResponses).toBe(0)
  })

  it('geçici bulut hatasında kaydı korur ve erken tekrar göndermeyi önler', async () => {
    const { queue, supabase } = await loadDataEnvironment('test-user-a')
    const remote = createSupabaseStub()
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    // IndexedDB görev kuyruğu gerçek zamanla çalışır; yalnızca duvar saatini sabitleriz.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-24T09:00:00Z'))
    remote.respondOnce({ data: null, error: { message: 'Geçici bağlantı hatası' } })
    await queue.enqueueSync('upsert_session', 'test-session', makeSession())

    expect(await queue.processQueue()).toMatchObject({ flushed: 0, failed: 0, scheduled: 1 })
    const [pending] = await queue.getQueueItems()
    expect(pending).toMatchObject({
      retryCount: 1,
      lastError: 'Geçici bağlantı hatası',
      isFailed: false,
      payload: { id: 'test-session' },
    })
    expect(new Date(pending.nextAttemptAt!).getTime()).toBeGreaterThan(Date.now())
    await queue.processQueue()
    expect(remote.mutations).toHaveLength(1)

    vi.mocked(Date.now).mockReturnValue(new Date(pending.nextAttemptAt!).getTime() + 1)
    remote.respondAppliedSession()
    expect(await queue.processQueue()).toMatchObject({ flushed: 1, failed: 0, scheduled: 0 })
    expect(await queue.getQueueLength()).toBe(0)
  })

  it('bulut okuma hatasını yerel veriye dokunmadan döndürür', async () => {
    const { db, cloud, supabase } = await loadDataEnvironment('test-user-a')
    await db.saveSession(makeSession())
    const original = await db.listSessions()
    const remote = createSupabaseStub()
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    remote.respondOnce({ data: null, error: { message: 'Sunucu kullanılamıyor' } })

    expect(await cloud.pullCloud()).toEqual({ ok: false, error: 'Sunucu kullanılamıyor' })
    expect(await db.listSessions()).toEqual(original)
    expect(remote.calls[0]).toMatchObject({
      table: 'sessions',
      steps: expect.arrayContaining([{ method: 'eq', args: ['user_id', 'test-user-a'] }]),
    })
  })
})
