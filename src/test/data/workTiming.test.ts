import { describe, expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { createSupabaseStub } from '../helpers/supabase'
import type { ModeConfig } from '../../types'

const configurations: ModeConfig[] = [
  {mode:'serbest'}, {mode:'gerisayim',sureMs:120_000},
  {mode:'ders60mola15',calismaMs:120_000,molaMs:30_000},
  {mode:'deneme',bolumler:[{ad:'A',surePlanMs:120_000}]},
  {mode:'EXAM_SIMULATOR',sureMs:120_000,startTimeHHmm:'23:59'},
]
const base = Date.parse('2026-10-25T23:59:50+03:00')

describe('yeni seansların kesin çalışma çizgisi', () => {
  it.each(configurations)('$mode: pause/yenileme/devam aralıkları çalışma dışı süreyi kaydetmez', async (config) => {
    await loadDataEnvironment(null)
    vi.spyOn(Date,'now').mockReturnValue(base)
    const { useTimerStore } = await import('../../store/timer')
    const { saveFinishedSession } = await import('../../lib/saveFinishedSession')
    const { getDataScope } = await import('../../lib/dataScope')
    useTimerStore.getState().setModeConfig(config)
    useTimerStore.getState().start()
    vi.mocked(Date.now).mockReturnValue(base+10_000)
    useTimerStore.getState().pause()
    const persisted=localStorage.getItem('timer-storage')!
    useTimerStore.setState(useTimerStore.getInitialState(),true)
    localStorage.setItem('timer-storage',persisted)
    await useTimerStore.persist.rehydrate()
    vi.mocked(Date.now).mockReturnValue(base+30_000)
    useTimerStore.getState().recoverSession()
    vi.mocked(Date.now).mockReturnValue(base+60_000)
    useTimerStore.getState().continueRecoveredSession()
    vi.mocked(Date.now).mockReturnValue(base+70_000)
    useTimerStore.getState().finishEarly()
    useTimerStore.getState().prepareFinishedSession([])
    const record=await saveFinishedSession(getDataScope())
    expect(record.sureGercek).toBe(20)
    expect(record.workIntervals).toEqual([{start:base,end:base+10_000},{start:base+60_000,end:base+70_000}])
  })

  it('çalışan seans kurtarılırken kapalı süre son kontrol noktasında kesilir', async () => {
    await loadDataEnvironment(null)
    const { useTimerStore } = await import('../../store/timer')
    vi.spyOn(Date,'now').mockReturnValue(base)
    useTimerStore.getState().start()
    vi.mocked(Date.now).mockReturnValue(base+10_000)
    useTimerStore.getState().syncTimer()
    vi.mocked(Date.now).mockReturnValue(base+100_000)
    useTimerStore.getState().recoverSession()
    useTimerStore.getState().finishRecoveredSession()
    expect(useTimerStore.getState().finishedSession?.workIntervals).toEqual([{start:base,end:base+10_000}])
  })

  it('eski aktif seansa zaman çizgisi uydurulmaz', async () => {
    await loadDataEnvironment(null)
    const { useTimerStore } = await import('../../store/timer')
    vi.spyOn(Date,'now').mockReturnValue(base+100_000)
    useTimerStore.setState({ status:'paused',elapsedMs:10_000,pauseStartTs:base+90_000,workIntervals:undefined })
    useTimerStore.getState().resume()
    vi.mocked(Date.now).mockReturnValue(base+110_000)
    useTimerStore.getState().finishEarly()
    expect(useTimerStore.getState().finishedSession?.workIntervals).toBeUndefined()
  })

  it('özellik eksik sunucuya çalışma aralıkları sessizce gönderilip kaybedilmez', async () => {
    const { scope } = await loadDataEnvironment('a')
    const { ensureSyncProtocol, UPGRADE_MESSAGE } = await import('../../lib/cloudProtocol')
    const remote=createSupabaseStub('a')
    remote.setProtocolResponse({data:{version:3},error:null})
    await expect(ensureSyncProtocol(remote.client,scope.getDataScope())).rejects.toThrow(UPGRADE_MESSAGE)
    expect(remote.mutations).toEqual([])
  })

  it.each(configurations)('$mode: ayrı Date.now çağrıları arasındaki milisaniyeler çizgiyi bozmaz', async (config) => {
    await loadDataEnvironment(null)
    const { useTimerStore } = await import('../../store/timer')
    const { intervalDuration } = await import('../../lib/workIntervals')
    let clock=base
    vi.spyOn(Date,'now').mockImplementation(() => clock++)
    useTimerStore.getState().setModeConfig(config)
    useTimerStore.getState().start()
    clock=base+10_000
    useTimerStore.getState().pause()
    clock=base+20_000
    useTimerStore.getState().resume()
    clock=base+30_000
    useTimerStore.getState().finishEarly()
    const draft=useTimerStore.getState().finishedSession!
    expect(draft.workIntervals).toHaveLength(2)
    expect(intervalDuration(draft.workIntervals!)).toBe(draft.elapsedMs)
  })

  it('sınav kurtarma ticki farklı milisaniyede olsa da aralıklar korunur', async () => {
    await loadDataEnvironment(null)
    const { useTimerStore } = await import('../../store/timer')
    const { intervalDuration } = await import('../../lib/workIntervals')
    let clock=base
    vi.spyOn(Date,'now').mockImplementation(() => clock++)
    useTimerStore.getState().setModeConfig(configurations[4])
    useTimerStore.getState().start()
    clock=base+20_000
    useTimerStore.getState().recoverSession()
    useTimerStore.getState().finishRecoveredSession()
    const draft=useTimerStore.getState().finishedSession!
    expect(draft.workIntervals).toHaveLength(1)
    expect(intervalDuration(draft.workIntervals!)).toBe(draft.elapsedMs)
  })
})
