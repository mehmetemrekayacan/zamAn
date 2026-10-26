import { expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import type { ModeConfig } from '../../types'

const base = Date.parse('2026-10-26T12:00:00+03:00')
async function setup(owner: string | null = null) {
  const workers: { onmessage: ((event: { data: string }) => void) | null }[] = []
  vi.stubGlobal('Worker', class {
    onmessage = null
    constructor() { workers.push(this) }
    postMessage() {}
  })
  const env = await loadDataEnvironment(owner)
  const { useTimerStore: timer } = await import('../../store/timer')
  const clock = vi.spyOn(Date, 'now').mockReturnValue(base)
  const tick = (ms: number) => {
    clock.mockReturnValue(base + ms)
    workers.at(-1)?.onmessage?.({ data: 'tick' })
  }
  const read = () => JSON.parse(env.scope.getDataScope().ownerId === null
    ? localStorage.getItem('timer-storage')!
    : localStorage.getItem(`zaman-account:${owner}:timer-storage`)!).state
  return { ...env, timer, clock, tick, read }
}

it('Worker tickleri yalnızca 5 saniyelik checkpoint yazar; hata sonrası yeniden dener', async () => {
  const { timer, tick, read } = await setup()
  timer.getState().start()
  const writes = vi.spyOn(localStorage, 'setItem')
  for (let ms = 500; ms < 5000; ms += 500) tick(ms)
  expect(writes).not.toHaveBeenCalled()
  expect(read().elapsedMs).toBe(0)
  writes.mockImplementationOnce(() => { throw new Error('disk dolu') })
  expect(() => tick(5000)).toThrow('disk dolu')
  tick(5500)
  expect(read().elapsedMs).toBe(5500)
  expect(writes).toHaveBeenCalledTimes(2)
})

const modes: ModeConfig[] = [
  { mode: 'serbest' }, { mode: 'gerisayim', sureMs: 120_000 },
  { mode: 'ders60mola15', calismaMs: 120_000, molaMs: 30_000 },
  { mode: 'deneme', bolumler: [{ ad: 'A', surePlanMs: 120_000 }] },
  { mode: 'EXAM_SIMULATOR', sureMs: 120_000, startTimeHHmm: '12:00' },
]

it.each(modes)('$mode: kapanış checkpoint’i ve tekrar açılış net çalışma çizgisini korur', async config => {
  const { timer, tick, clock, read } = await setup()
  timer.getState().start(config)
  tick(4000)
  expect(read().elapsedMs).toBe(0)
  timer.getState().syncTimer()
  expect(read().elapsedMs).toBe(4000)
  const raw = localStorage.getItem('timer-storage')!
  timer.setState(timer.getInitialState(), true)
  localStorage.setItem('timer-storage', raw)
  await timer.persist.rehydrate()
  clock.mockReturnValue(base + 30_000)
  timer.getState().recoverSession()
  expect(timer.getState().elapsedMs).toBe(config.mode === 'EXAM_SIMULATOR' ? 30_000 : 4000)
  timer.getState().finishRecoveredSession()
  const draft = timer.getState().finishedSession!
  expect(read().finishedSession.id).toBe(draft.id)
  expect(draft.workIntervals).toEqual([{ start: base, end: base + draft.elapsedMs }])
})

it('ani kapanış en son periyodik checkpoint’i kurtarır ve bilinmeyen süre eklemez', async () => {
  const { timer, tick, read } = await setup()
  timer.getState().start()
  tick(5000)
  tick(9500)
  expect(read().elapsedMs).toBe(5000)
  const raw = localStorage.getItem('timer-storage')!
  timer.setState(timer.getInitialState(), true)
  localStorage.setItem('timer-storage', raw)
  await timer.persist.rehydrate()
  timer.getState().recoverSession()
  expect(timer.getState()).toMatchObject({ status: 'paused', elapsedMs: 5000, recoveryPending: true })
  expect(timer.getState().workIntervals).toEqual([{ start: base, end: base + 5000 }])
})

it('ilk hesap açılışı diskteki çalışan checkpoint’i kurtarma kararından önce ilerletmez', async () => {
  const { timer, tick, clock } = await setup()
  timer.getState().start()
  tick(5000)
  // Yeni sayfa: store diski okur, bu sayfada henüz start/resume çağrılmamıştır.
  await loadDataEnvironment()
  clock.mockReturnValue(base + 30_000)
  const { activateAccount } = await import('../../lib/accountLifecycle')
  const { useTimerStore: reopened } = await import('../../store/timer')
  await activateAccount(null)
  reopened.getState().recoverSession()
  expect(reopened.getState().elapsedMs).toBe(5000)
  expect(reopened.getState().workIntervals).toEqual([{ start: base, end: base + 5000 }])
})

it('duraklatma/devam/bitiş/not değişikliği aralığı beklemeden yazılır', async () => {
  const { timer, tick, clock, read } = await setup()
  timer.getState().start()
  tick(1500)
  timer.getState().pause()
  expect(read()).toMatchObject({ status: 'paused', elapsedMs: 1500, pauses: 1 })
  clock.mockReturnValue(base + 2000)
  timer.getState().resume()
  expect(read()).toMatchObject({ status: 'running', totalPauseDurationMs: 500 })
  clock.mockReturnValue(base + 2500)
  timer.getState().finishEarly()
  expect(read()).toMatchObject({ status: 'finished', finishedSession: { elapsedMs: 2000 } })
  timer.getState().updateFinishForm({ note: 'Kalıcı not' })
  expect(read().finishForm.note).toBe('Kalıcı not')
})

it('sınavın otomatik bitişi checkpoint süresini beklemez', async () => {
  const { timer, tick, read } = await setup()
  timer.getState().start({ mode: 'EXAM_SIMULATOR', sureMs: 3000, startTimeHHmm: '12:00' })
  tick(3000)
  expect(read()).toMatchObject({ status: 'finished', finishedSession: { elapsedMs: 3000, endedAt: base + 3000 } })
})

it('hesap değişimi önce eski hesabı checkpoint eder; sonradan diğer hesaba yazma olmaz', async () => {
  const { timer, tick, clock } = await setup('a')
  const { activateAccount } = await import('../../lib/accountLifecycle')
  timer.getState().start()
  tick(4000)
  await activateAccount('b')
  const keyA = 'zaman-account:a:timer-storage'
  expect(JSON.parse(localStorage.getItem(keyA)!).state.elapsedMs).toBe(4000)
  expect(timer.getState().status).toBe('idle')
  clock.mockReturnValue(base + 6000)
  timer.getState().start()
  tick(7000)
  expect(JSON.parse(localStorage.getItem(keyA)!).state.elapsedMs).toBe(4000)
  expect(JSON.parse(localStorage.getItem('zaman-account:b:timer-storage')!).state.elapsedMs).toBe(0)
})
