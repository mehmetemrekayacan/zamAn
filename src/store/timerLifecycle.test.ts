import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimerStore } from './timer'
import type { ModeConfig } from '../types'

const BASE = Date.UTC(2026, 9, 26, 10)
const configs: ModeConfig[] = [
  { mode: 'serbest' },
  { mode: 'gerisayim', sureMs: 60_000 },
  { mode: 'ders60mola15', calismaMs: 60_000, molaMs: 15_000 },
  { mode: 'deneme', bolumler: [{ ad: 'A', surePlanMs: 30_000 }, { ad: 'B', surePlanMs: 60_000 }], currentSectionIndex: 1 },
  { mode: 'EXAM_SIMULATOR', startTimeHHmm: '13:00', sureMs: 60_000 },
]

function at(ms: number) { vi.mocked(Date.now).mockReturnValue(BASE + ms) }

describe('seans yaşam döngüsü ve kurtarma', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(BASE)
    useTimerStore.setState(useTimerStore.getInitialState(), true)
  })

  it.each(configs)('$mode: kaydedilmemiş bitiş yenilemede korunur', async (config) => {
    useTimerStore.getState().setModeConfig(config)
    useTimerStore.getState().start()
    at(10_000)
    useTimerStore.getState().finishEarly()
    const draft = useTimerStore.getState().finishedSession
    const stored = localStorage.getItem('timer-storage')!
    useTimerStore.setState(useTimerStore.getInitialState(), true)
    localStorage.setItem('timer-storage', stored)
    await useTimerStore.persist.rehydrate()
    expect(useTimerStore.getState()).toMatchObject({ status: 'finished', elapsedMs: 10_000 })
    expect(useTimerStore.getState().finishedSession).toEqual(draft)
  })

  it('serbest kurtarmada kapalı süre ve karar ekranında bekleme çalışmaya eklenmez', () => {
    useTimerStore.getState().start()
    at(10_000)
    useTimerStore.getState().syncTimer()
    at(100_000)
    useTimerStore.getState().recoverSession()
    at(130_000)
    useTimerStore.getState().continueRecoveredSession()
    at(135_000)
    useTimerStore.getState().syncTimer()
    expect(useTimerStore.getState().elapsedMs).toBe(15_000)
  })

  it.each(configs)('$mode: duraklama sayısı ve başlangıcı yenilemede korunur', async (config) => {
    useTimerStore.getState().setModeConfig(config)
    useTimerStore.getState().start()
    at(10_000)
    useTimerStore.getState().pause()
    const stored = localStorage.getItem('timer-storage')!
    useTimerStore.setState(useTimerStore.getInitialState(), true)
    localStorage.setItem('timer-storage', stored)
    await useTimerStore.persist.rehydrate()
    at(20_000)
    useTimerStore.getState().recoverSession()
    at(30_000)
    useTimerStore.getState().continueRecoveredSession()
    expect(useTimerStore.getState()).toMatchObject({ pauses: 1, elapsedMs: 10_000, totalPauseDurationMs: 20_000 })
  })

  it('gecikmiş ilk tick uzatma süresini kaybetmez', () => {
    useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 10_000 })
    useTimerStore.getState().start()
    at(15_000)
    useTimerStore.getState().syncTimer()
    expect(useTimerStore.getState().elapsedMs).toBe(15_000)
  })

  it('iki tick arasında bitirmek son geçen süreyi de kaydeder', () => {
    useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 10_000 })
    useTimerStore.getState().start()
    at(12_000)
    useTimerStore.getState().syncTimer()
    at(15_000)
    useTimerStore.getState().finishEarly()
    expect(useTimerStore.getState().elapsedMs).toBe(15_000)
  })

  it('çalışan seans mod değişimiyle kaybolmaz', () => {
    useTimerStore.getState().start()
    at(10_000)
    useTimerStore.getState().setModeConfig({ mode: 'gerisayim', sureMs: 60_000 })
    expect(useTimerStore.getState()).toMatchObject({ mode: 'serbest', status: 'running' })
  })

  it('bölüm seçilince plan süresi seçilen bölümden alınır', () => {
    useTimerStore.getState().setModeConfig(configs[3])
    useTimerStore.getState().jumpToSection(1)
    expect(useTimerStore.getState().plannedMs).toBe(60_000)
  })

  it.each(configs.filter((config) => config.mode !== 'EXAM_SIMULATOR'))('$mode: kurtarılan çalışma kararda beklerken artmaz; devamda net süre korunur', (config) => {
    useTimerStore.getState().setModeConfig(config)
    useTimerStore.getState().start()
    const id = useTimerStore.getState().sessionId
    at(10_000)
    useTimerStore.getState().syncTimer()
    at(100_000)
    useTimerStore.getState().recoverSession()
    at(150_000)
    useTimerStore.getState().syncTimer()
    expect(useTimerStore.getState().elapsedMs).toBe(10_000)
    useTimerStore.getState().continueRecoveredSession()
    at(155_000)
    useTimerStore.getState().finishEarly()
    expect(useTimerStore.getState()).toMatchObject({ elapsedMs: 15_000, sessionId: id, wasEarlyFinish: config.mode !== 'serbest' })
  })

  it('sınav saati kapalıyken son tarihe ulaşır ve bitiş zamanı açılış saati olmaz', () => {
    useTimerStore.getState().setModeConfig(configs[4])
    useTimerStore.getState().start()
    at(100_000)
    expect(useTimerStore.getState().recoverSession()).toBe(false)
    expect(useTimerStore.getState()).toMatchObject({ status: 'finished', elapsedMs: 60_000, finishedSession: { endedAt: BASE + 60_000, wasEarlyFinish: false } })
  })

  it('sınav açılışa kadar ilerler; karar ekranında beklenen süre eklenmez', () => {
    useTimerStore.getState().setModeConfig(configs[4])
    useTimerStore.getState().start()
    at(20_000)
    useTimerStore.getState().recoverSession()
    at(100_000)
    useTimerStore.getState().continueRecoveredSession()
    at(105_000)
    useTimerStore.getState().finishEarly()
    expect(useTimerStore.getState()).toMatchObject({ elapsedMs: 25_000, totalPauseDurationMs: 80_000, wasEarlyFinish: true })
  })

  it('mola işareti ve bitiş taslağı yenilemede kalır; kayıt sonrası geçen mola doğru sayılır', async () => {
    useTimerStore.getState().setModeConfig(configs[2])
    useTimerStore.getState().start()
    at(65_000)
    useTimerStore.getState().finishEarly()
    const draft = useTimerStore.getState().finishedSession!
    const saved = localStorage.getItem('timer-storage')!
    useTimerStore.setState(useTimerStore.getInitialState(), true)
    localStorage.setItem('timer-storage', saved)
    await useTimerStore.persist.rehydrate()
    at(70_000)
    useTimerStore.getState().completeFinishedSession(draft.id)
    expect(useTimerStore.getState()).toMatchObject({ workBreakPhase: 'break', status: 'running', remainingMs: 10_000 })
    at(100_000)
    useTimerStore.getState().recoverSession()
    expect(useTimerStore.getState()).toMatchObject({ workBreakPhase: 'work', status: 'idle', molaToplamMs: 15_000 })
  })

  it('bitiş taslağı start/reset/mod/bölüm komutuyla kaybolmaz', () => {
    useTimerStore.getState().setModeConfig(configs[3])
    useTimerStore.getState().start()
    const id = useTimerStore.getState().sessionId
    useTimerStore.getState().start()
    expect(useTimerStore.getState().sessionId).toBe(id)
    at(10_000)
    useTimerStore.getState().finishEarly()
    const draft = useTimerStore.getState().finishedSession
    useTimerStore.getState().start()
    useTimerStore.getState().reset()
    useTimerStore.getState().jumpToSection(0)
    useTimerStore.getState().setModeConfig(configs[0])
    expect(useTimerStore.getState()).toMatchObject({ status: 'finished', sessionId: id, finishedSession: draft })
  })

  it('yeni seans yeni kimlik alır; duraklama ve devam kimliği değiştirmez', () => {
    useTimerStore.getState().start()
    const id = useTimerStore.getState().sessionId
    useTimerStore.getState().pause()
    useTimerStore.getState().resume()
    expect(useTimerStore.getState().sessionId).toBe(id)
    useTimerStore.getState().reset()
    useTimerStore.getState().start()
    expect(useTimerStore.getState().sessionId).not.toBe(id)
  })
})
