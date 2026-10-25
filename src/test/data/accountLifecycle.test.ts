import { describe, expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { makeSession } from '../helpers/fixtures'

describe('hesap ekranı ve kalıcı durum', () => {
  it('hesaplar arasında ayar, sayaç, deneme ayarı ve son sync bilgisi sızmaz', async () => {
    const { db } = await loadDataEnvironment()
    const { activateAccount } = await import('../../lib/accountLifecycle')
    const { useSettingsStore } = await import('../../store/settings')
    const { useTimerStore } = await import('../../store/timer')
    const { getScopedStorage } = await import('../../lib/accountStorage')

    await activateAccount(null)
    useSettingsStore.getState().setSetting('kullaniciAdi', 'Misafir')
    await db.saveSession(makeSession({ not: 'Eski yerel veri' }))

    await activateAccount('a')
    expect(useSettingsStore.getState().kullaniciAdi).toBe('')
    useSettingsStore.getState().setSetting('kullaniciAdi', 'A')
    useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 60000 })
    getScopedStorage().setItem('deneme-config', 'A denemesi')
    getScopedStorage().setItem('zaman-last-sync', 'A tarihi')

    await activateAccount('b')
    expect(useSettingsStore.getState().kullaniciAdi).toBe('')
    expect(useTimerStore.getState()).toMatchObject({ mode: 'serbest', status: 'idle', elapsedMs: 0 })
    expect(getScopedStorage().getItem('deneme-config')).toBeNull()
    expect(getScopedStorage().getItem('zaman-last-sync')).toBeNull()
    useSettingsStore.getState().setSetting('kullaniciAdi', 'B')

    await activateAccount('a')
    expect(useSettingsStore.getState().kullaniciAdi).toBe('A')
    expect(useTimerStore.getState().mode).toBe('gerisayim')
    expect(getScopedStorage().getItem('deneme-config')).toBe('A denemesi')

    await activateAccount(null)
    expect(useSettingsStore.getState().kullaniciAdi).toBe('Misafir')
    expect(await db.listSessions()).toMatchObject([{ not: 'Eski yerel veri' }])
  })

  it('hesap değişirken eski worker durdurulur ve yeni sayaç temiz başlar', async () => {
    await loadDataEnvironment()
    const messages: string[] = []
    let onmessage: unknown
    vi.stubGlobal('Worker', class {
      set onmessage(value: unknown) { onmessage = value }
      postMessage(value: string) { messages.push(value) }
    })
    const { activateAccount } = await import('../../lib/accountLifecycle')
    const { useTimerStore } = await import('../../store/timer')
    await activateAccount('a')
    useTimerStore.getState().start()
    expect(messages).toContain('start')
    await activateAccount('b')
    expect(messages.at(-1)).toBe('stop')
    expect(onmessage).toBeNull()
    expect(useTimerStore.getState().status).toBe('idle')
    await activateAccount('a')
    expect(useTimerStore.getState().status).toBe('running')
    // Önceki oturumun kurtarılmasına bırakılır; worker otomatik başlatılmaz.
    expect(messages.at(-1)).toBe('stop')
  })

  it('geç kalan seans yüklemesi ve yazması yeni ekranı doldurmaz', async () => {
    await loadDataEnvironment()
    const { activateAccount } = await import('../../lib/accountLifecycle')
    const { useSessionsStore } = await import('../../store/sessions')
    await activateAccount('a')
    const adding = useSessionsStore.getState().addSession(makeSession())
    await activateAccount('b')
    await adding
    expect(useSessionsStore.getState().sessions).toEqual([])
    await activateAccount('a')
    const loading = useSessionsStore.getState().loadSessions()
    await activateAccount('b')
    await loading
    expect(useSessionsStore.getState()).toMatchObject({ sessions: [], loading: false, syncStatusById: {} })
  })

  it('hesap değişiminde depolama hatası başarıyla yüklenmiş gibi gösterilmez', async () => {
    const { scope } = await loadDataEnvironment()
    const { activateAccount } = await import('../../lib/accountLifecycle')
    await activateAccount('a')
    const old = scope.getDataScope()
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('Depo kapalı') })
    await expect(activateAccount('b')).rejects.toThrow('Depo kapalı')
    expect(old.signal.aborted).toBe(true)
    expect(scope.getDataScope().ownerId).toBe('b')
  })

  it('aynı hesaptan tekrar auth olayı gelirse kaydedilmemiş bitiş korunur', async () => {
    const { scope } = await loadDataEnvironment()
    const { activateAccount } = await import('../../lib/accountLifecycle')
    const { useTimerStore } = await import('../../store/timer')
    await activateAccount('a')
    const active = scope.getDataScope()
    useTimerStore.getState().start()
    useTimerStore.getState().finishEarly()
    expect(useTimerStore.getState().status).toBe('finished')
    await activateAccount('a')
    expect(scope.getDataScope()).toBe(active)
    expect(active.signal.aborted).toBe(false)
    expect(useTimerStore.getState().status).toBe('finished')
  })
})
