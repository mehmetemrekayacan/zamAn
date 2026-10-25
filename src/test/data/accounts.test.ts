import { openDB } from 'idb'
import { IDBObjectStore } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { makeSession } from '../helpers/fixtures'
import { createSupabaseStub, makeRemoteSession } from '../helpers/supabase'

describe('hesap sahipliği', () => {
  it('misafir, A ve B aynı kimliği birbirinden bağımsız saklar', async () => {
    const { db, scope } = await loadDataEnvironment()
    await db.saveSession(makeSession({ not: 'Misafir' }))
    scope.changeDataScope('a')
    expect(await db.listSessions()).toEqual([])
    await db.saveSession(makeSession({ not: 'A' }))
    scope.changeDataScope('b')
    expect(await db.listSessions()).toEqual([])
    await db.saveSession(makeSession({ not: 'B' }))
    scope.changeDataScope('a')
    expect(await db.getSession('test-session')).toMatchObject({ not: 'A' })
    scope.changeDataScope(null)
    expect(await db.getSession('test-session')).toMatchObject({ not: 'Misafir' })
  })

  it('başlamış yerel yazma hesabı değişince B deposuna taşınmaz', async () => {
    const { db, scope } = await loadDataEnvironment()
    scope.changeDataScope('a')
    const saving = db.saveSession(makeSession({ not: 'A' }))
    scope.changeDataScope('b')
    await saving
    expect(await db.listSessions()).toEqual([])
    scope.changeDataScope('a')
    expect(await db.listSessions()).toMatchObject([{ not: 'A' }])
  })

  it('çıkış ve yerel temizleme diğer hesabın seanslarını silmez', async () => {
    const { db, scope } = await loadDataEnvironment()
    scope.changeDataScope('a')
    await db.saveSession(makeSession())
    scope.changeDataScope(null)
    await db.clearAllSessions()
    scope.changeDataScope('b')
    await db.clearAllSessions()
    scope.changeDataScope('a')
    expect(await db.listSessions()).toHaveLength(1)
  })

  it('aynı kimlikli kuyruk girdileri hesaplar arasında birbirini silmez', async () => {
    const { queue, scope } = await loadDataEnvironment()
    scope.changeDataScope('a')
    await queue.enqueueSync('upsert_session', 'same', makeSession({ id: 'same' }))
    scope.changeDataScope('b')
    await queue.enqueueSync('delete_session', 'same')
    expect(await queue.getQueueItems()).toMatchObject([{ ownerId: 'b', action: 'delete_session' }])
    scope.changeDataScope('a')
    expect(await queue.getQueueItems()).toMatchObject([{ ownerId: 'a', action: 'upsert_session' }])
  })

  it('A kuyruğu B hesabına gönderilmez ve A tekrar girince korunur', async () => {
    const { queue, scope, supabase } = await loadDataEnvironment()
    const remote = createSupabaseStub('b')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    scope.changeDataScope('a')
    await queue.enqueueSync('upsert_session', 'test-session', makeSession())
    scope.changeDataScope('b')
    await queue.processQueue()
    expect(remote.calls).toEqual([])
    scope.changeDataScope('a')
    expect(await queue.getQueueLength()).toBe(1)
    remote.setUser('a')
    remote.respondAppliedSession()
    expect(await queue.processQueue()).toMatchObject({ flushed: 1 })
    expect(remote.mutations[0].args).toMatchObject({ p_id: 'test-session' })
  })

  it('yerel A ile auth B uyuşmuyorsa gönderim yapılmaz', async () => {
    const { queue, scope, supabase } = await loadDataEnvironment()
    scope.changeDataScope('a')
    await queue.enqueueSync('upsert_session', 'test-session', makeSession())
    const remote = createSupabaseStub('b')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    await queue.processQueue()
    expect(remote.calls).toEqual([])
    expect(await queue.getQueueLength()).toBe(1)
  })

  it('sahibi olmayan eski kuyruk tahminle yeni hesaba atanmaz', async () => {
    const { queue, scope, supabase } = await loadDataEnvironment()
    const legacy = await openDB('zaman-sync-queue', 1, {
      upgrade(db) { db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true }) },
    })
    await legacy.add('sync-queue', { action: 'upsert_session', sessionId: 'legacy', payload: makeSession({ id: 'legacy' }), retryCount: 0, createdAt: '2026-10-24T09:00:00Z' })
    legacy.close()
    localStorage.setItem('zaman-last-user', 'a')
    scope.changeDataScope('b')
    const remote = createSupabaseStub('b')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    await queue.processQueue()
    expect(remote.calls).toEqual([])
    const raw = await openDB('zaman-sync-queue')
    expect(await raw.getAll('sync-queue')).toHaveLength(1)
    raw.close()
  })

  it('gönderim sırasında hesap değişirse A girdisi tüketilmez', async () => {
    const { queue, scope, supabase } = await loadDataEnvironment()
    scope.changeDataScope('a')
    await queue.enqueueSync('upsert_session', 'test-session', makeSession())
    const remote = createSupabaseStub('a')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    let finish!: (response: { data: null; error: null }) => void
    remote.respondOnce(new Promise((resolve) => { finish = resolve }))
    const sending = queue.processQueue()
    await vi.waitFor(() => expect(remote.mutations).toHaveLength(1))
    scope.changeDataScope('b')
    remote.setUser('b')
    finish({ data: null, error: null })
    await sending
    expect(remote.signals[0]?.aborted).toBe(true)
    scope.changeDataScope('a')
    expect(await queue.getQueueLength()).toBe(1)
  })

  it('A bulut yanıtı B açıldıktan sonra B yereline yazılmaz', async () => {
    const { db, cloud, scope, supabase } = await loadDataEnvironment()
    scope.changeDataScope('a')
    const remote = createSupabaseStub('a')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    let finish!: (response: { data: unknown; error: null }) => void
    remote.respondOnce(new Promise((resolve) => { finish = resolve }))
    const pulling = cloud.pullCloud()
    await vi.waitFor(() => expect(remote.calls).toHaveLength(1))
    scope.changeDataScope('b')
    remote.setUser('b')
    finish({ data: [{ id: 'from-a', mod: 'serbest', sure_gercek: 60, puan: 10, tarih_iso: '2026-10-24T09:00:00Z', duraklatma: 0 }], error: null })
    expect((await pulling).ok).toBe(false)
    expect(await db.listSessions()).toEqual([])
  })

  it('yerel yazmayla aynı anda hesap değişse de kuyruk sahibi A kalır', async () => {
    const { db, queue, scope, supabase } = await loadDataEnvironment('a')
    vi.spyOn(supabase, 'isCloudSyncEnabled').mockReturnValue(true)
    const saving = db.saveSession(makeSession())
    scope.changeDataScope('b')
    await saving
    expect(await queue.getQueueItems()).toEqual([])
    scope.changeDataScope('a')
    expect(await queue.getQueueItems()).toMatchObject([{ ownerId: 'a', sessionId: 'test-session' }])
  })

  it('giriş yapmak misafir kuyruğunu sahiplenmez', async () => {
    const { queue, scope, supabase } = await loadDataEnvironment()
    await queue.enqueueSync('upsert_session', 'guest', makeSession({ id: 'guest' }))
    scope.changeDataScope('a')
    const remote = createSupabaseStub('a')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    await queue.processQueue()
    expect(remote.calls).toEqual([])
    scope.changeDataScope(null)
    expect(await queue.getQueueItems()).toMatchObject([{ ownerId: null, sessionId: 'guest' }])
  })

  it('auth yanıtı gelmeden değişen hesapla toplu push başlatılmaz', async () => {
    const { db, cloud, scope, supabase } = await loadDataEnvironment('a')
    await db.saveSession(makeSession())
    const remote = createSupabaseStub('a')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    let release!: () => void
    remote.getUser.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return { data: { user: { id: 'a', email: 'a@example.invalid', user_metadata: {} } }, error: null }
    })
    const pushing = cloud.pushCloud()
    await vi.waitFor(() => expect(remote.getUser).toHaveBeenCalledOnce())
    scope.changeDataScope('b')
    release()
    expect((await pushing).ok).toBe(false)
    expect(remote.calls).toEqual([])
  })

  it('A ayar yanıtı geç gelince B ayarlarını ve sync tarihini değiştirmez', async () => {
    const { cloud, scope, supabase } = await loadDataEnvironment('a')
    const { getScopedStorage } = await import('../../lib/accountStorage')
    const remote = createSupabaseStub('a')
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    remote.respondOnce({ data: [makeRemoteSession(makeSession({ id: 'from-a' }), { user_id: 'a' })], error: null })
    let finish!: (response: { data: unknown; error: null }) => void
    remote.respondOnce(new Promise((resolve) => { finish = resolve }))
    const pulling = cloud.pullCloud()
    await vi.waitFor(() => expect(remote.calls).toHaveLength(2))
    scope.changeDataScope('b')
    getScopedStorage().setItem('zaman-olcer-settings', 'B ayarları')
    finish({ data: { settings: { state: { kullaniciAdi: 'A' } }, updated_at: '2026-10-24T10:00:00Z' }, error: null })
    expect((await pulling).ok).toBe(false)
    expect(getScopedStorage().getItem('zaman-olcer-settings')).toBe('B ayarları')
    expect(cloud.getLastSyncTime()).toBeNull()
  })

  it('kuyruk güncellemesi yazılamazsa önceki A işlemi kaybolmaz', async () => {
    const { queue } = await loadDataEnvironment('a')
    await queue.enqueueSync('upsert_session', 'test-session', makeSession())
    const original = await queue.getQueueItems()
    const originalAdd = IDBObjectStore.prototype.add
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'sync-queue') throw new Error('Depolama dolu')
      return originalAdd.apply(this, args)
    })
    await expect(queue.enqueueSync('delete_session', 'test-session')).rejects.toThrow('Depolama dolu')
    expect(await queue.getQueueItems()).toEqual(original)
  })

  it('dosya okunurken değişen hesap B üzerine yedek yüklemez', async () => {
    const { db, backup, scope } = await loadDataEnvironment('a')
    let finish!: (text: string) => void
    const file = { text: () => new Promise<string>((resolve) => { finish = resolve }) } as File
    const importing = backup.importFromFile(file)
    scope.changeDataScope('b')
    await db.saveSession(makeSession({ not: 'B korunur' }))
    finish(JSON.stringify({ version: 1, exportedAt: '2026-10-24T09:00:00Z', sessions: [] }))
    expect((await importing).ok).toBe(false)
    expect(await db.listSessions()).toMatchObject([{ not: 'B korunur' }])
  })

  it('başka hesabın kuyruğu açık hesabın yedeğini engellemez', async () => {
    const { db, backup, scope, queue } = await loadDataEnvironment('a')
    await queue.enqueueSync('delete_session', 'only-a')
    scope.changeDataScope('b')
    expect(await backup.applyPayload({ version: 1, exportedAt: '2026-10-24T09:00:00Z', sessions: [makeSession({ not: 'B yedeği' })] })).toEqual({ ok: true })
    expect(await db.listSessions()).toMatchObject([{ not: 'B yedeği' }])
    scope.changeDataScope('a')
    expect(await queue.getQueueItems()).toMatchObject([{ sessionId: 'only-a' }])
  })

  it('misafirden hesaba taşıma açıkça yedek içe aktararak yapılır', async () => {
    const { db, backup, scope, queue } = await loadDataEnvironment()
    await db.saveSession(makeSession({ not: 'Misafirin çalışması' }))
    const exported = await backup.exportData()
    scope.changeDataScope('a')
    expect(await db.listSessions()).toEqual([])
    expect(await backup.importFromFile(new File([exported], 'guest.json'))).toEqual({ ok: true })
    expect(await db.listSessions()).toMatchObject([{ not: 'Misafirin çalışması' }])
    expect(await queue.getQueueItems()).toEqual([])
    scope.changeDataScope(null)
    expect(await db.listSessions()).toHaveLength(1)
  })

  it('eski kuyruk ham arşivi kayıpsız indirilir ve normal yedek gibi uygulanmaz', async () => {
    const { queue, backup } = await loadDataEnvironment()
    await queue.getQueueItems()
    const raw = await openDB('zaman-sync-queue')
    const legacy = { action: 'upsert_session', sessionId: 'legacy', payload: makeSession({ id: 'legacy' }), retryCount: 2, createdAt: '2026-10-24T09:00:00Z' }
    await raw.add('sync-queue', legacy)
    const snapshot = await raw.getAll('sync-queue')
    const archive = await backup.exportUnownedQueue()
    expect(JSON.parse(await archive.text())).toMatchObject({ kind: 'zaman-unowned-sync-queue', items: snapshot })
    expect((await backup.importFromFile(new File([archive], 'archive.json'))).ok).toBe(false)
    expect(await raw.getAll('sync-queue')).toEqual(snapshot)
    raw.close()
  })

  it('eski sahipsiz kuyruk arşivi hesap alanından dışa aktarılmaz', async () => {
    const { backup } = await loadDataEnvironment('b')
    await expect(backup.exportUnownedQueue()).rejects.toThrow('misafir alanından')
  })

  it('yedek transaction sırasında hesap değişirse A geri alınır ve B korunur', async () => {
    const { db, backup, scope } = await loadDataEnvironment('a')
    const connectionA = await db.initDb()
    await connectionA.put('sessions', makeSession({ id: 'original-a' }))
    scope.changeDataScope('b')
    const connectionB = await db.initDb()
    await connectionB.put('sessions', makeSession({ id: 'original-b' }))
    const { getScopedStorage } = await import('../../lib/accountStorage')
    getScopedStorage().setItem('zaman-olcer-settings', 'B ayarları')
    scope.changeDataScope('a')

    const originalPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, ...args) {
      if (this.name === 'sessions' && value.id === 'from-backup') scope.changeDataScope('b')
      return originalPut.call(this, value, ...args)
    })
    const result = await backup.applyPayload({
      version: 1, exportedAt: '2026-10-24T09:00:00Z', sessions: [makeSession({ id: 'from-backup' })],
      settingsStorage: JSON.stringify({ state: { kullaniciAdi: 'A yedeği' }, version: 0 }),
    })
    expect(result.ok).toBe(false)
    expect(await db.listSessions()).toMatchObject([{ id: 'original-b' }])
    expect(getScopedStorage().getItem('zaman-olcer-settings')).toBe('B ayarları')
    scope.changeDataScope('a')
    expect(await db.listSessions()).toMatchObject([{ id: 'original-a' }])
  })
})
