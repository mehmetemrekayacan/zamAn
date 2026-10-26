import { describe, expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { makeSession } from '../helpers/fixtures'
import type { ModeConfig } from '../../types'

const BASE = Date.UTC(2026, 9, 26, 10)

const configurations: ModeConfig[] = [
  { mode: 'serbest' },
  { mode: 'gerisayim', sureMs: 120_000 },
  { mode: 'ders60mola15', calismaMs: 120_000, molaMs: 30_000 },
  { mode: 'deneme', bolumler: [{ ad: 'A', surePlanMs: 30_000 }, { ad: 'B', surePlanMs: 120_000 }], currentSectionIndex: 1 },
  { mode: 'EXAM_SIMULATOR', sureMs: 120_000, startTimeHHmm: '13:00' },
]

async function finished(owner: string | null = null, config: ModeConfig = configurations[3]) {
  const env = await loadDataEnvironment(owner)
  vi.spyOn(Date, 'now').mockReturnValue(BASE)
  const { useTimerStore } = await import('../../store/timer')
  const { useSessionsStore } = await import('../../store/sessions')
  const { saveFinishedSession } = await import('../../lib/saveFinishedSession')
  useTimerStore.getState().setModeConfig(config)
  useTimerStore.getState().start()
  vi.mocked(Date.now).mockReturnValue(BASE + 65_000)
  useTimerStore.getState().finishEarly()
  useTimerStore.getState().prepareFinishedSession([])
  useTimerStore.getState().updateFinishForm({ note: 'Not', examName: 'Deneme 1', analysis: { dogru: 40, yanlis: 4, bos: 6 } })
  return { ...env, timer: useTimerStore, sessions: useSessionsStore, save: saveFinishedSession }
}

describe('kalıcı bitiş taslağı ve kayıt', () => {
  it('çift kaydetme tek yazmayı paylaşır; sonraki tekrar aynı kimliği kullanır', async () => {
    const { scope, timer, sessions, save, db } = await finished()
    const id = timer.getState().sessionId
    const first = save(scope.getDataScope())
    const second = save(scope.getDataScope())
    expect(first).toBe(second)
    await Promise.all([first, second])
    await save(scope.getDataScope())
    expect((await db.listSessions()).map((record) => record.id)).toEqual([id])
    expect(sessions.getState().sessions.map((record) => record.id)).toEqual([id])
  })

  it.each(configurations)('$mode: yerel yazma hatasında taslak kalır ve aynı kimlikle tekrar denenir', async (config) => {
    const { scope, timer, save, db } = await finished(null, config)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = timer.getState().finishedSession
    const write = vi.spyOn(db, 'saveSession').mockRejectedValueOnce(new Error('Disk dolu'))
    await expect(save(scope.getDataScope())).rejects.toThrow('Disk dolu')
    expect(timer.getState()).toMatchObject({ status: 'finished', finishedSession: draft })
    expect(await db.listSessions()).toEqual([])
    const result = await save(scope.getDataScope())
    expect(result.id).toBe(draft?.id)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('kayıt commit olduktan sonraki hatada yeniden deneme ikinci kayıt oluşturmaz', async () => {
    const { scope, timer, sessions, save, db } = await finished()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const realWrite = db.saveSession
    vi.spyOn(db, 'saveSession').mockImplementationOnce(async (...args) => {
      await realWrite(...args)
      throw new Error('Commit sonrası bildirim hatası')
    })
    await expect(save(scope.getDataScope())).rejects.toThrow('Commit sonrası')
    await save(scope.getDataScope())
    expect(await db.listSessions()).toHaveLength(1)
    expect(sessions.getState().sessions).toHaveLength(1)
    expect(timer.getState().status).toBe('finished')
  })

  it('bitiş zamanı, puan ve aktif bölüm planı kayıt ekranında beklemekle değişmez', async () => {
    const { scope, timer, save } = await finished()
    const score = timer.getState().finishScore
    vi.mocked(Date.now).mockReturnValue(BASE + 600_000)
    timer.getState().prepareFinishedSession([makeSession()])
    expect(timer.getState().finishScore).toEqual(score)
    const record = await save(scope.getDataScope())
    expect(record).toMatchObject({ surePlan: 120, sureGercek: 65, templateName: 'B', not: 'Deneme 1', dogruSayisi: 40, tarihISO: new Date(BASE + 65_000).toISOString() })
  })

  it('bitiş, not ve analiz yeni yedek biçiminde kayıpsız geri yüklenir', async () => {
    const { timer, backup } = await finished()
    const { validateBackup } = await import('../../lib/backupValidation')
    const payload = validateBackup(JSON.parse(await (await backup.exportData()).text()))
    const before = timer.getState().finishedSession
    expect(payload.timerStorage).toContain('Deneme 1')
    timer.setState(timer.getInitialState(), true)
    expect(await backup.applyPayload(payload)).toEqual({ ok: true })
    await timer.persist.rehydrate()
    expect(timer.getState()).toMatchObject({ status: 'finished', finishedSession: before, finishForm: { note: 'Not', analysis: { dogru: 40 } } })
  })

  it('yedekte bitiş taslağına eylem veya bozuk analiz eklenmesi reddedilir', async () => {
    const { backup } = await finished()
    const { validateBackup } = await import('../../lib/backupValidation')
    const payload = JSON.parse(await (await backup.exportData()).text())
    const runtime = JSON.parse(payload.timerStorage)
    runtime.state.finishedSession.reset = null
    expect(() => validateBackup({ ...payload, timerStorage: JSON.stringify(runtime) })).toThrow('reset')
    delete runtime.state.finishedSession.reset
    runtime.state.finishForm.analysis.dogru = -1
    expect(() => validateBackup({ ...payload, timerStorage: JSON.stringify(runtime) })).toThrow('dogru')
  })

  it('hesap değişirken eski kaydın devamı yeni hesabın sayacını temizlemez', async () => {
    const { timer, save, scope } = await finished('a')
    const { activateAccount } = await import('../../lib/accountLifecycle')
    const saving = save(scope.getDataScope())
    const rejected = expect(saving).rejects.toThrow('Hesap')
    await activateAccount('b')
    timer.getState().start()
    const newId = timer.getState().sessionId
    await rejected
    expect(timer.getState()).toMatchObject({ status: 'running', sessionId: newId })
  })
})
