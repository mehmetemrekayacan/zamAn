import { describe, expect, it } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { makeSession } from '../helpers/fixtures'

describe('yerel veri altyapısı', () => {
  it('seans kaydeder, aynı kimliği günceller, filtreler ve siler', async () => {
    const { db } = await loadDataEnvironment()
    const first = makeSession()
    await db.saveSession(first)
    await db.saveSession({ ...first, not: 'Güncellendi' })
    await db.saveSession(makeSession({ id: 'exam', mod: 'deneme' }))

    expect(await db.listSessions()).toHaveLength(2)
    expect(await db.getSession(first.id)).toMatchObject({ not: 'Güncellendi' })
    expect(await db.listSessions({ mod: 'deneme' })).toMatchObject([{ id: 'exam' }])
    await db.deleteSession(first.id)
    expect(await db.getSession(first.id)).toBeUndefined()
  })

  it('aynı adlı IndexedDB her testte boş başlar', async () => {
    const { db, queue } = await loadDataEnvironment()
    expect(await db.listSessions()).toEqual([])
    expect(await queue.getQueueItems()).toEqual([])
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    // Sonraki testlere sızmaması gereken değerler.
    await db.saveSession(makeSession())
    await queue.enqueueSync('delete_session', 'test-session')
    localStorage.setItem('test-leak', 'value')
    sessionStorage.setItem('test-leak', 'value')
  })

  it('iptal edilen transaction eski kayıtları korur', async () => {
    const { db } = await loadDataEnvironment()
    await db.saveSession(makeSession())
    const connection = await db.initDb()
    const transaction = connection.transaction('sessions', 'readwrite')
    const aborted = expect(transaction.done).rejects.toMatchObject({ name: 'AbortError' })
    await transaction.store.clear()
    await transaction.store.put(makeSession({ id: 'replacement' }))
    transaction.abort()
    await aborted

    expect(await db.listSessions()).toMatchObject([{ id: 'test-session' }])
  })

  it('dışa aktarılan geçerli yedek yeniden yüklenebilir', async () => {
    const { db, backup } = await loadDataEnvironment()
    await db.saveSession(makeSession({ not: 'Yedek testi' }))
    const original = await db.listSessions()
    const settings = JSON.stringify({ state: { tema: 'dark' }, version: 0 })
    localStorage.setItem('zaman-olcer-settings', settings)
    const exported = await backup.exportData()

    await db.clearAllSessions()
    localStorage.clear()
    const result = await backup.importFromFile(new File([exported], 'backup.json'))

    expect(result).toEqual({ ok: true })
    expect(await db.getSession('test-session')).toMatchObject({
      ...original[0],
      updatedAt: expect.any(String),
    })
    expect(localStorage.getItem('zaman-olcer-settings')).toBe(settings)
  })

  it('JSON olmayan yedek mevcut kayda dokunmaz', async () => {
    const { db, backup } = await loadDataEnvironment()
    await db.saveSession(makeSession())
    const original = await db.listSessions()

    const result = await backup.importFromFile(new File(['{invalid'], 'broken.json'))

    expect(result).toEqual({ ok: false, error: 'Geçersiz JSON.' })
    expect(await db.listSessions()).toEqual(original)
  })
})
