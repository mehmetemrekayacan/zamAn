import { IDBDatabase, IDBObjectStore } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { MODE_DEFAULTS } from '../../lib/modeConfig'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { makeSession, TEST_TIME } from '../helpers/fixtures'
import { createSupabaseStub } from '../helpers/supabase'

function makeBackup(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    exportedAt: TEST_TIME,
    sessions: [makeSession({ id: 'restored' })],
    timerStorage: null,
    denemeConfig: null,
    settingsStorage: JSON.stringify({ state: { tema: 'light' }, version: 0 }),
    ...overrides,
  }
}

async function prepare(ownerId?: string) {
  const environment = await loadDataEnvironment(ownerId)
  await environment.db.saveSession(makeSession({ id: 'original', not: 'Korunacak kayıt' }))
  localStorage.setItem('zaman-olcer-settings', JSON.stringify({ state: { tema: 'dark' }, version: 0 }))
  localStorage.setItem('timer-storage', 'old-timer')
  localStorage.setItem('deneme-config', 'old-config')
  localStorage.setItem('zaman-ders60-pause-state', 'old-pause')
  return {
    ...environment,
    originalSessions: await environment.db.listSessions(),
    originalStorage: { ...localStorageSnapshot() },
  }
}

function localStorageSnapshot() {
  return Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
    const key = localStorage.key(index)!
    return [key, localStorage.getItem(key)]
  }))
}

function file(payload: unknown) {
  return new File([JSON.stringify(payload)], 'backup.json')
}

describe('güvenli yedek içe aktarma', () => {
  const invalid: [string, Record<string, unknown>][] = [
    ['seans listesi nesne', { sessions: {} }],
    ['desteklenmeyen sürüm', { version: 999 }],
    ['eksik dışa aktarma tarihi', { exportedAt: undefined }],
    ['geçersiz tarih', { sessions: [makeSession({ tarihISO: '2026-02-30T10:00:00Z' })] }],
    ['eksik süre', { sessions: [{ id: 'invalid', mod: 'serbest', tarihISO: TEST_TIME }] }],
    ['negatif süre', { sessions: [makeSession({ sureGercek: -1 })] }],
    ['yanlış sayısal tip', { sessions: [{ ...makeSession(), puan: '100' }] }],
    ['bilinmeyen mod', { sessions: [{ ...makeSession(), mod: 'unknown' }] }],
    ['tekrarlanan kimlik', { sessions: [makeSession(), makeSession()] }],
    ['negatif doğru sayısı', { sessions: [makeSession({ dogruSayisi: -1 })] }],
    ['bozuk iç ayar JSON', { settingsStorage: '{broken' }],
    ['geçersiz tema', { settingsStorage: JSON.stringify({ state: { tema: 'unknown' }, version: 0 }) }],
    ['fonksiyon alanına yazan ayar', { settingsStorage: JSON.stringify({ state: { setSetting: null }, version: 0 }) }],
    ['geçersiz sayaç', { timerStorage: JSON.stringify({ state: { mode: 'serbest', elapsedMs: -1 }, version: 0 }) }],
    ['boş deneme bölümleri', { denemeConfig: JSON.stringify({ mode: 'deneme', bolumler: [] }) }],
  ]

  it.each(invalid)('%s mevcut seansları, ayarları ve kuyruğu korur', async (_name, overrides) => {
    const { db, queue, backup, originalSessions, originalStorage } = await prepare()
    const result = await backup.importFromFile(file(makeBackup(overrides)))
    expect(result.ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
    expect(localStorageSnapshot()).toEqual(originalStorage)
    expect(await queue.getQueueItems()).toEqual([])
  })

  it('applyPayload doğrudan çağrıldığında da doğrulama yapar', async () => {
    const { db, backup, originalSessions } = await prepare()
    const result = await backup.applyPayload(makeBackup({ sessions: {} }))
    expect(result.ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
  })

  it('ikinci seans yazılamazsa ilk yazmayı ve silmeyi geri alır', async () => {
    const { db, queue, backup, originalSessions, originalStorage } = await prepare()
    const originalPut = IDBObjectStore.prototype.put
    let writes = 0
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'sessions' && ++writes === 2) {
        throw new DOMException('Disk yazma hatası', 'QuotaExceededError')
      }
      return originalPut.apply(this, args)
    })

    const result = await backup.importFromFile(file(makeBackup({
      sessions: [makeSession({ id: 'new-a' }), makeSession({ id: 'new-b' })],
    })))

    expect(result.ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
    expect(localStorageSnapshot()).toEqual(originalStorage)
    expect(await queue.getQueueItems()).toEqual([])
  })

  it('ayar yazma hatasında veritabanı ve daha önce yazılan ayarlar geri alınır', async () => {
    const { db, backup, originalSessions, originalStorage } = await prepare()
    const originalSet = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(originalSet).mockImplementationOnce(() => {
      throw new DOMException('Depolama dolu', 'QuotaExceededError')
    })
    const result = await backup.importFromFile(file(makeBackup({
      timerStorage: JSON.stringify({ state: {
        mode: 'serbest', modeConfig: { mode: 'serbest' }, status: 'idle', elapsedMs: 0,
      }, version: 0 }),
      denemeConfig: JSON.stringify({ mode: 'deneme', bolumler: [{ ad: 'AGS', surePlanMs: 6600000 }] }),
    })))

    expect(result.ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
    expect(localStorageSnapshot()).toEqual(originalStorage)
  })

  it('transaction commit hatasında uygulanmış ayarları da geri alır', async () => {
    const { db, backup, originalSessions, originalStorage } = await prepare()
    const originalSet = localStorage.setItem.bind(localStorage)
    let active: IDBTransaction | undefined
    const originalTransaction = IDBDatabase.prototype.transaction
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
      const transaction = originalTransaction.apply(this, args)
      if (args[1] === 'readwrite') {
        active = transaction
      }
      return transaction
    })
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce((key, value) => {
      originalSet(key, value)
      active!.abort()
    })
    const result = await backup.importFromFile(file(makeBackup()))

    expect(result.ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
    expect(localStorageSnapshot()).toEqual(originalStorage)
  })

  it('bekleyen işlem varken içe aktarmayı reddeder ve kuyruğa dokunmaz', async () => {
    const { db, queue, backup, originalSessions, originalStorage } = await prepare()
    await queue.enqueueSync('delete_session', 'original')
    const originalQueue = await queue.getQueueItems()

    const result = await backup.importFromFile(file(makeBackup()))

    expect(result.ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
    expect(localStorageSnapshot()).toEqual(originalStorage)
    expect(await queue.getQueueItems()).toEqual(originalQueue)
  })

  it('aynı anda kuyruğa alınan eski işlem içe aktarmadan önce kontrol edilir', async () => {
    const { db, queue, backup, originalSessions } = await prepare()
    const pending = queue.enqueueSync('upsert_session', 'original', originalSessions[0])
    const importing = backup.importFromFile(file(makeBackup()))
    await pending
    expect((await importing).ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
    expect(await queue.getQueueLength()).toBe(1)
  })

  it('ağ yanıtı beklenirken yeni işlem kalıcılaşır, içe aktarma ise durdurulur', async () => {
    const { db, queue, supabase, backup, originalSessions } = await prepare('test-user-a')
    const remote = createSupabaseStub()
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    let release!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    remote.getUser.mockImplementationOnce(async () => {
      await waiting
      return { data: { user: { id: 'test-user-a', email: 'a@example.invalid', user_metadata: {} } }, error: null }
    })
    remote.respondOnce({ data: null, error: null })
    const processing = queue.processQueue()
    try {
      await vi.waitFor(() => expect(remote.getUser).toHaveBeenCalledOnce())
      await queue.enqueueSync('upsert_session', 'original', originalSessions[0])
      expect(await queue.getQueueLength()).toBe(1)
      expect(await backup.importFromFile(file(makeBackup())))
        .toMatchObject({ ok: false, error: expect.stringContaining('Senkronizasyon devam ediyor') })
      expect(await db.listSessions()).toEqual(originalSessions)
    } finally {
      release()
      await processing
    }
  })

  it('sayısal Infinity doğrudan applyPayload çağrısında da reddedilir', async () => {
    const { db, backup, originalSessions } = await prepare()
    expect((await backup.applyPayload(makeBackup({ sessions: [makeSession({ puan: Infinity })] }))).ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
  })

  it('ayar deposu okunamıyorsa hiçbir kayıt değiştirilmez', async () => {
    const { db, backup, originalSessions } = await prepare()
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Depolamaya erişilemiyor', 'SecurityError')
    })
    expect((await backup.importFromFile(file(makeBackup()))).ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
  })

  it('yerel ayarları geri alma da başarısızsa bunu başarı olarak bildirmez', async () => {
    const { db, backup, originalSessions } = await prepare()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Depolamaya erişilemiyor', 'SecurityError')
    })
    const result = await backup.importFromFile(file(makeBackup()))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('ayarlar geri yüklenemedi') })
    expect(await db.listSessions()).toEqual(originalSessions)
  })

  it('boş seans yedeği de tek işlemle uygulanır', async () => {
    const { db, backup } = await prepare()
    expect(await backup.importFromFile(file(makeBackup({ sessions: [] })))).toEqual({ ok: true })
    expect(await db.listSessions()).toEqual([])
  })

  it('deneme analizi, molalar ve tarih metadatası eksiksiz korunur', async () => {
    const { db, backup } = await loadDataEnvironment()
    const record = makeSession({
      mod: 'deneme', surePlan: 6600, dogruSayisi: 40, yanlisSayisi: 8, bosSayisi: 2,
      templateId: 'ags', templateName: 'AGS', ekstraSureMs: 60000,
      toplamDuraklamaSureSaniye: 15, denemeMolalarSaniye: [60, 90],
      bolumler: [{ ad: 'AGS', surePlan: 6600, sureGercek: 3600 }],
    })
    expect(await backup.importFromFile(file(makeBackup({ sessions: [record] })))).toEqual({ ok: true })
    expect(await db.listSessions()).toEqual([record])
  })

  it.each(Object.values(MODE_DEFAULTS))('$mode modunun uygulamadan alınan yedeği geri yüklenir', async (config) => {
    const { db, backup } = await loadDataEnvironment()
    const { useTimerStore } = await import('../../store/timer')
    const { useSettingsStore } = await import('../../store/settings')
    useTimerStore.getState().setModeConfig(config)
    useSettingsStore.getState().setSetting('kullaniciAdi', 'Test kullanıcısı')
    localStorage.setItem('deneme-config', JSON.stringify(MODE_DEFAULTS.deneme))
    await db.saveSession(makeSession())
    const original = await db.listSessions()
    const blob = await backup.exportData()

    const result = await backup.importFromFile(new File([blob], 'exported.json'))

    expect(result).toEqual({ ok: true })
    expect(await db.listSessions()).toEqual(original)
  })

  it('başarılı geri yükleme zaman damgalarını korur ve gönderim kuyruğu üretmez', async () => {
    const { db, queue, supabase, backup } = await prepare()
    vi.spyOn(supabase, 'isCloudSyncEnabled').mockReturnValue(true)
    const restored = makeSession({ id: 'restored', updatedAt: '2025-02-04T12:00:00Z' })

    const result = await backup.importFromFile(file(makeBackup({ sessions: [restored] })))

    expect(result).toEqual({ ok: true })
    expect(await db.listSessions()).toEqual([restored])
    expect(await queue.getQueueItems()).toEqual([])
    expect(localStorage.getItem('timer-storage')).toBeNull()
    expect(localStorage.getItem('deneme-config')).toBeNull()
    expect(localStorage.getItem('zaman-ders60-pause-state')).toBeNull()
    expect(JSON.parse(localStorage.getItem('zaman-olcer-settings')!).state.tema).toBe('light')
  })

  it('v2 yedeği korunan yerel çakışmaları da geri yükler; v1 onları silmez', async () => {
    const { db, backup } = await loadDataEnvironment()
    const connection = await db.initDb()
    const conflict = { id:'conflict-1',entity:'session' as const,sessionId:'original',createdAt:TEST_TIME,
      action:'upsert_session' as const,local:makeSession({id:'original',not:'Korunan yerel'}),remote:null }
    await connection.put('sync-conflicts',conflict)
    const blob = await backup.exportData()
    const decoded = JSON.parse(await blob.text())
    expect(decoded).toMatchObject({version:2,conflicts:[conflict]})
    await connection.clear('sync-conflicts')
    expect(await backup.importFromFile(new File([blob],'v2.json'))).toEqual({ok:true})
    expect(await connection.getAll('sync-conflicts')).toEqual([conflict])
    expect(await backup.importFromFile(file(makeBackup()))).toEqual({ok:true})
    expect(await connection.getAll('sync-conflicts')).toEqual([conflict])
  })

  it('geçersiz v2 çakışma kaydı tüm mevcut veriyi korur', async () => {
    const { db, backup, originalSessions, originalStorage } = await prepare()
    expect((await backup.importFromFile(file(makeBackup({version:2,conflicts:[{id:'broken',entity:'unknown'}]})))).ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
    expect(localStorageSnapshot()).toEqual(originalStorage)
  })

  it('v2 arşiv yazma hatası seans değişimini de geri alır', async () => {
    const { db, backup, originalSessions } = await prepare()
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){
      if (this.name==='sync-conflicts') throw new Error('Arşiv yazılamadı')
      return put.apply(this,args)
    })
    const conflict = {id:'archive',entity:'session',sessionId:'old',createdAt:TEST_TIME,action:'upsert_session',local:makeSession({id:'old'}),remote:null}
    expect((await backup.importFromFile(file(makeBackup({version:2,conflicts:[conflict]})))).ok).toBe(false)
    expect(await db.listSessions()).toEqual(originalSessions)
  })
})
