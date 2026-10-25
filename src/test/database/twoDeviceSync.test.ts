import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { openDB } from 'idb'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { makeSession } from '../helpers/fixtures'
import { createPostgresClient, createProtocolDatabase, SQL_USER } from '../helpers/postgres'
import { createMemoryStorage } from '../helpers/storage'
import { createSupabaseStub, makeRemoteSession } from '../helpers/supabase'
import { sessionToRow, type RemoteSessionRow } from '../../lib/syncProtocol'

let pg: PGlite

async function device() {
  const environment = await loadDataEnvironment(SQL_USER)
  const remote = createPostgresClient(pg)
  vi.spyOn(environment.supabase, 'getSupabase').mockReturnValue(remote.client)
  vi.spyOn(environment.supabase, 'isCloudSyncEnabled').mockReturnValue(true)
  const engine = await import('../../lib/sessionSync')
  return { ...environment, ...remote, engine }
}

async function serverEdit(note: string, version = 0, action = 'upsert_session') {
  const remote = createPostgresClient(pg)
  const { data, error } = await remote.client.rpc('zaman_apply_session', {
    p_id: 'test-session', p_mutation_id: crypto.randomUUID(), p_expected_version: version,
    p_action: action, p_payload: sessionToRow(makeSession({ not: note })),
  })
  if (error) throw error
  return data as { status: string; row: RemoteSessionRow }
}

describe('iki cihaz davranışı: uygulama + gerçek SQL protokolü', () => {
  beforeAll(async () => { pg = await createProtocolDatabase() }, 30000)
  beforeEach(async () => { await pg.exec('truncate public.sessions,public.user_settings,public.sync_mutations') })
  afterAll(async () => { await pg?.close() })

  it('yeni seansı bir kez gönderir; tekrar sync sürümü artırmaz', async () => {
    const app = await device()
    await app.db.saveSession(makeSession())
    expect(await app.cloud.syncCloud()).toMatchObject({ ok: true, pushed: 1, conflicts: 0 })
    expect(await app.queue.getQueueLength()).toBe(0)
    expect(await app.cloud.syncCloud()).toMatchObject({ ok: true, pushed: 0, conflicts: 0 })
    expect(app.calls.filter((call) => call.name === 'zaman_apply_session')).toHaveLength(1)
    expect((await pg.query('select version from public.sessions')).rows).toEqual([{ version: 1 }])
  })

  it('pull zaman damgalarını korur, yeniden gönderim üretmez', async () => {
    const row = (await serverEdit('Sunucudan')).row
    const app = await device()
    expect((await app.cloud.pullCloud()).ok).toBe(true)
    expect(await app.db.getSession('test-session')).toMatchObject({ not: 'Sunucudan', updatedAt: new Date(row.updated_at).toISOString() })
    expect(await app.queue.getQueueItems()).toEqual([])
    expect((await app.cloud.syncCloud()).ok).toBe(true)
    expect(app.calls.filter((call) => call.name === 'zaman_apply_session')).toEqual([])
  })

  it('B yenisini yazınca eski A onu ezmez; A değişikliği çakışma arşivinde kalır', async () => {
    await serverEdit('İlk')
    const app = await device()
    await app.cloud.syncCloud()
    await app.db.saveSession({ ...(await app.db.getSession('test-session'))!, not: 'A yerel' })
    await serverEdit('B yeni', 1)
    expect(await app.cloud.syncCloud()).toMatchObject({ ok: true, conflicts: 1 })
    expect(await app.db.getSession('test-session')).toMatchObject({ not: 'B yeni' })
    const conflicts = await app.engine.listSyncConflicts()
    expect(conflicts).toMatchObject([{ local: { not: 'A yerel' }, remote: { not_text: 'B yeni' } }])
    expect((await pg.query('select version,not_text from public.sessions')).rows).toEqual([{ version: 2, not_text: 'B yeni' }])
    await app.engine.resolveSyncConflict(conflicts[0].id, true)
    expect((await app.cloud.syncCloud()).ok).toBe(true)
    expect(await app.db.listSessions()).toHaveLength(2)
    expect(await app.engine.listSyncConflicts()).toEqual([])
  })

  it('B silince eski A kaydı diriltmez; bekleyen yerel düzenleme arşivlenir', async () => {
    await serverEdit('İlk')
    const app = await device()
    await app.cloud.syncCloud()
    await app.db.saveSession({ ...(await app.db.getSession('test-session'))!, not: 'A çevrimdışı' })
    await serverEdit('', 1, 'delete_session')
    expect(await app.cloud.syncCloud()).toMatchObject({ ok: true, conflicts: 1 })
    expect(await app.db.listSessions()).toEqual([])
    expect(await app.queue.getQueueLength()).toBe(0)
    expect(await app.engine.listSyncConflicts()).toMatchObject([{ local: { not: 'A çevrimdışı' } }])
    await app.cloud.syncCloud()
    const result = (await pg.query<{ deleted_at: unknown; version: number }>('select deleted_at,version from public.sessions')).rows[0]
    expect(result.deleted_at).not.toBeNull()
    expect(result.version).toBe(2)
  })

  it('yerel silmeyi tombstone olarak gönderir; tüm cihazlardan silme aynı yolu kullanır', async () => {
    await serverEdit('İlk')
    const app = await device()
    await app.cloud.syncCloud()
    expect((await app.engine.deleteAllSyncedSessions()).ok).toBe(true)
    expect(await app.db.listSessions()).toEqual([])
    expect((await pg.query<{ deleted_at: unknown }>('select deleted_at from public.sessions')).rows[0].deleted_at).not.toBeNull()
  })

  it('kuyruk deposu yazılamasa bile kalıcı yerel mutation yeniden kurulur', async () => {
    const app = await device()
    const originalAdd = IDBObjectStore.prototype.add
    const failure = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'sync-queue') throw new Error('Kuyruk dolu')
      return originalAdd.apply(this,args)
    })
    await expect(app.db.saveSession(makeSession())).rejects.toThrow('Kuyruk dolu')
    expect(await app.db.listSessions()).toHaveLength(1)
    failure.mockRestore()
    expect((await app.cloud.syncCloud()).ok).toBe(true)
    expect((await pg.query('select id from public.sessions')).rows).toEqual([{ id: 'test-session' }])
  })

  it('boş bulut başarılıdır; eşzamanlı sync aynı işi paylaşır', async () => {
    const app = await device()
    const first = app.cloud.syncCloud()
    const second = app.cloud.syncCloud()
    expect(first).toBe(second)
    expect(await first).toMatchObject({ ok: true, pushed: 0, pulled: 0 })
    expect(app.cloud.getLastSyncTime()).not.toBeNull()
    expect(app.calls.filter((call) => call.name === 'zaman_sync_protocol')).toHaveLength(1)
  })

  it('205 seansı sayfalar; sonrasında yalnızca yeni silme bilgisini çeker', async () => {
    await pg.query("insert into public.sessions(id,user_id,mod,sure_gercek,puan,tarih_iso,duraklatma) select 'row-'||g::text,$1,'serbest',60,10,now(),0 from generate_series(1,205) g", [SQL_USER])
    const app = await device()
    expect((await app.cloud.pullCloud()).ok).toBe(true)
    expect(await app.db.listSessions()).toHaveLength(205)
    expect(app.calls.filter((call) => call.name === 'sessions')).toHaveLength(2)
    const remote = createPostgresClient(pg)
    await remote.client.rpc('zaman_apply_session',{ p_id:'row-205',p_mutation_id:crypto.randomUUID(),p_expected_version:1,p_action:'delete_session',p_payload:null })
    expect((await app.cloud.pullCloud()).ok).toBe(true)
    expect(await app.db.listSessions()).toHaveLength(204)
    expect(app.calls.filter((call) => call.name === 'sessions').at(-1)!.args.cursor).toBeGreaterThan(0)
  })

  it('sadece ayar değişikliği seans olmadan eşitlenir; yeni cihazın sayacı korunur', async () => {
    const a = await device()
    const { useSettingsStore } = await import('../../store/settings')
    useSettingsStore.getState().setSetting('kullaniciAdi','A adı')
    expect((await a.cloud.syncCloud()).ok).toBe(true)
    vi.stubGlobal('indexedDB',new IDBFactory())
    vi.stubGlobal('localStorage',createMemoryStorage())
    const b = await device()
    const { getScopedStorage } = await import('../../lib/accountStorage')
    const storage = getScopedStorage()
    storage.setItem('zaman-olcer-settings',JSON.stringify({ state:{bildirimİzni:'granted'},version:0 }))
    storage.setItem('timer-storage','B cihazının sayacı')
    expect((await b.cloud.syncCloud()).ok).toBe(true)
    expect(JSON.parse(storage.getItem('zaman-olcer-settings')!).state).toMatchObject({ kullaniciAdi:'A adı',bildirimİzni:'granted' })
    expect(storage.getItem('timer-storage')).toBe('B cihazının sayacı')
    expect(b.calls.filter((call) => call.name === 'zaman_apply_settings')).toHaveLength(0)
  })

  it('ayar çakışması sessizce ezilmez; yerel tercih açıkça yeniden uygulanabilir', async () => {
    const app = await device()
    const { useSettingsStore } = await import('../../store/settings')
    useSettingsStore.getState().setSetting('kullaniciAdi','İlk')
    await app.cloud.syncCloud()
    useSettingsStore.getState().setSetting('kullaniciAdi','A yerel')
    const other = createPostgresClient(pg)
    await other.client.rpc('zaman_apply_settings',{ p_mutation_id:crypto.randomUUID(),p_expected_version:1,p_settings:{state:{kullaniciAdi:'B yeni'},version:0},p_deneme_config:null })
    expect(await app.cloud.syncCloud()).toMatchObject({ok:true,conflicts:1})
    expect(useSettingsStore.getState().kullaniciAdi).toBe('B yeni')
    const [conflict] = await app.engine.listSyncConflicts()
    expect(conflict).toMatchObject({entity:'settings',local:{settings:{state:{kullaniciAdi:'A yerel'}}}})
    await app.engine.resolveSyncConflict(conflict.id,true)
    expect((await app.cloud.syncCloud()).ok).toBe(true)
    expect(useSettingsStore.getState().kullaniciAdi).toBe('A yerel')
  })

  it('yanıt beklerken yapılan yeni yerel düzenleme ack ile ezilmez', async () => {
    const env = await loadDataEnvironment(SQL_USER)
    const remote = createSupabaseStub(SQL_USER)
    vi.spyOn(env.supabase,'getSupabase').mockReturnValue(remote.client)
    vi.spyOn(env.supabase,'isCloudSyncEnabled').mockReturnValue(true)
    await env.db.saveSession(makeSession({not:'İlk'}))
    let finish!: (response:{data:unknown;error:null})=>void
    remote.respondOnce(new Promise((resolve)=>{finish=resolve}))
    const sending = env.queue.processQueue()
    await vi.waitFor(()=>expect(remote.mutations).toHaveLength(1))
    await env.db.saveSession(makeSession({not:'Gönderim sırasında yeni'}))
    finish({data:{status:'applied',row:makeRemoteSession(makeSession({not:'İlk'}),{user_id:SQL_USER})},error:null})
    await sending
    expect(await env.db.getSession('test-session')).toMatchObject({not:'Gönderim sırasında yeni'})
    remote.respondAppliedSession(makeSession({not:'Gönderim sırasında yeni'}),2)
    await env.queue.processQueue()
    expect(remote.mutations[1].args.p_expected_version).toBe(1)
    expect(await env.queue.getQueueLength()).toBe(0)
  })

  it('migration eksikse eski upsert yoluna dönmez ve mutation saklanır', async () => {
    const env = await loadDataEnvironment(SQL_USER)
    const remote = createSupabaseStub(SQL_USER)
    remote.setProtocolResponse({data:null,error:{code:'PGRST202',message:'Missing function'}})
    vi.spyOn(env.supabase,'getSupabase').mockReturnValue(remote.client)
    vi.spyOn(env.supabase,'isCloudSyncEnabled').mockReturnValue(true)
    await env.db.saveSession(makeSession())
    expect(await env.cloud.syncCloud()).toMatchObject({ok:false,error:expect.stringContaining('güncellemesi gerekiyor')})
    expect(remote.mutations).toEqual([])
    expect(await env.queue.getQueueItems()).toMatchObject([{retryCount:0}])
  })

  it.each(['save','delete'])('yerel %s metadatası yazılamazsa seans ve mutation birlikte geri alınır',async(operation)=>{
    await serverEdit('Korunacak')
    const app=await device()
    await app.cloud.syncCloud()
    const original=await app.db.getSession('test-session')
    const put=IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){
      if(this.name==='sync-state') throw new Error('Meta yazılamadı')
      return put.apply(this,args)
    })
    const change=operation==='save'?app.db.saveSession({...original!,not:'Kaybolacak yarım yazma'}):app.db.deleteSession('test-session')
    await expect(change).rejects.toThrow('Meta yazılamadı')
    expect(await app.db.getSession('test-session')).toEqual(original)
    expect(await app.queue.getQueueLength()).toBe(0)
  })

  it('cihaz önbelleği temizliği bulutu ve tercihleri silmez; yeniden pull kayıtları geri getirir',async()=>{
    await serverEdit('Bulutta kalacak')
    const app=await device()
    await app.cloud.syncCloud()
    await app.engine.clearLocalSessions()
    expect(await app.db.listSessions()).toEqual([])
    expect((await pg.query('select deleted_at from public.sessions')).rows).toEqual([{deleted_at:null}])
    expect((await app.cloud.syncCloud()).ok).toBe(true)
    expect(await app.db.listSessions()).toHaveLength(1)
  })

  it('eski hesap veritabanından yükseltme seansı korur ve güvenli mutation üretir',async()=>{
    const legacy=await openDB(`zaman-olcer-v1:account:${encodeURIComponent(SQL_USER)}`,1,{
      upgrade(db){const store=db.createObjectStore('sessions',{keyPath:'id'});store.createIndex('by-date','tarihISO');store.createIndex('by-mod','mod')},
    })
    await legacy.put('sessions',makeSession({not:'Eski cihaz'}))
    legacy.close()
    const app=await device()
    expect((await app.cloud.syncCloud()).ok).toBe(true)
    expect(await app.db.listSessions()).toMatchObject([{not:'Eski cihaz'}])
    expect((await pg.query('select version,not_text from public.sessions')).rows).toEqual([{version:1,not_text:'Eski cihaz'}])
  })

  it('başarısız kuyruk kullanıcı isteğiyle tekrar denenir; diğer hesap korunur', async () => {
    const app = await device()
    await app.db.saveSession(makeSession())
    const [item] = await app.queue.getQueueItems()
    const raw = await openDB('zaman-sync-queue')
    await raw.put('sync-queue', { ...item, retryCount: 8, isFailed: true, lastError: 'Eski ağ hatası' })
    const foreign = { ...item, ownerId: 'other-user', ownerKey: 'account:other-user', retryCount: 8, isFailed: true }
    delete foreign.id
    const foreignId = await raw.add('sync-queue', foreign)
    expect(await app.queue.processQueue()).toMatchObject({ failed: 1, flushed: 0 })

    expect(await app.queue.retryFailedQueue()).toBe(1)
    expect(await app.queue.processQueue()).toMatchObject({ flushed: 1, failed: 0 })
    expect(await app.queue.getQueueLength()).toBe(0)
    expect(await raw.get('sync-queue', foreignId)).toMatchObject({ retryCount: 8, isFailed: true })
    raw.close()
  })

  it('ayar çakışması saklanırken yapılan yeni değişiklik kaybolmaz', async () => {
    const app = await device()
    const { useSettingsStore } = await import('../../store/settings')
    useSettingsStore.getState().setSetting('kullaniciAdi', 'İlk')
    await app.cloud.syncCloud()
    useSettingsStore.getState().setSetting('kullaniciAdi', 'Yerel bekleyen')
    const other = createPostgresClient(pg)
    await other.client.rpc('zaman_apply_settings', {
      p_mutation_id: crypto.randomUUID(), p_expected_version: 1,
      p_settings: { state: { kullaniciAdi: 'Başka cihaz' }, version: 0 }, p_deneme_config: null,
    })
    const put = IDBObjectStore.prototype.put
    let edited = false
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args)
      if (this.name === 'sync-conflicts' && !edited) {
        edited = true
        queueMicrotask(() => useSettingsStore.getState().setSetting('kullaniciAdi', 'Çakışma sırasında yeni'))
      }
      return request
    })
    expect((await app.cloud.syncCloud()).ok).toBe(true)
    const conflicts = await app.engine.listSyncConflicts()
    const current = useSettingsStore.getState().kullaniciAdi
    expect(current === 'Çakışma sırasında yeni' || JSON.stringify(conflicts).includes('Çakışma sırasında yeni')).toBe(true)
  })

  it('eski ack daha yeni tabana dayanan yerel değişikliği silmez', async () => {
    const app = await device()
    const { acceptRemoteSession } = await import('../../lib/localSync')
    const active = app.scope.getDataScope()
    await acceptRemoteSession(makeRemoteSession(makeSession({ not: 'Yeni uzak' }), { user_id: SQL_USER, version: 3, sync_seq: 3 }), active)
    await app.db.saveSession(makeSession({ not: 'Yerel tercih' }))
    const db = await app.db.initDb()
    const before = await db.get('sync-state', 'test-session')
    await acceptRemoteSession(makeRemoteSession(makeSession({ not: 'Yerel tercih' }), { user_id: SQL_USER, version: 1, sync_seq: 1 }), active, {
      mutationId: 'old-already-sent', baseVersion: 0, action: 'upsert_session', payload: makeSession({ not: 'Yerel tercih' }),
    })
    expect((await db.get('sync-state', 'test-session'))?.pending).toEqual(before?.pending)
    expect((await db.get('sync-state', 'test-session'))?.version).toBe(3)
  })

  it('ayar çakışması metadatası yazılamazsa kısmi arşiv ve tercih uygulanmaz', async () => {
    const app = await device()
    const { useSettingsStore } = await import('../../store/settings')
    useSettingsStore.getState().setSetting('kullaniciAdi', 'İlk')
    await app.cloud.syncCloud()
    useSettingsStore.getState().setSetting('kullaniciAdi', 'Yerel korunacak')
    const other = createPostgresClient(pg)
    await other.client.rpc('zaman_apply_settings', { p_mutation_id: crypto.randomUUID(), p_expected_version: 1, p_settings: { state: { kullaniciAdi: 'Uzak' }, version: 0 }, p_deneme_config: null })
    const original = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'settings-sync' && args[0].version === 2) throw new Error('Ayar metadatası yazılamadı')
      return original.apply(this, args)
    })
    expect((await app.cloud.syncCloud()).ok).toBe(false)
    expect(await app.engine.listSyncConflicts()).toEqual([])
    expect(useSettingsStore.getState().kullaniciAdi).toBe('Yerel korunacak')
  })
})
