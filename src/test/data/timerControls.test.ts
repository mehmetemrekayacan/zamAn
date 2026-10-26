import { describe, expect, it } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'

describe('web ve Electron sayaç kısayol kuralları', () => {
  it('açık ekranlar kısayolları engeller; son ekran kapanınca tekrar açılır', async () => {
    await loadDataEnvironment(null)
    const { useTimerStore } = await import('../../store/timer')
    const { runTimerShortcut, blockTimerControls } = await import('../../lib/timerControls')
    const settings = blockTimerControls()
    const recovery = blockTimerControls()
    expect(runTimerShortcut('startStop')).toBe(false)
    settings()
    expect(runTimerShortcut('startStop')).toBe(false)
    recovery()
    expect(runTimerShortcut('startStop')).toBe(true)
    expect(useTimerStore.getState().status).toBe('running')
    useTimerStore.getState().finishEarly()
    expect(runTimerShortcut('startStop')).toBe(false)
    expect(runTimerShortcut('reset')).toBe(false)
    expect(useTimerStore.getState().status).toBe('finished')
  })

  it('kurtarma kararı verilmeden global komutlar seansı değiştiremez', async () => {
    await loadDataEnvironment(null)
    const { useTimerStore } = await import('../../store/timer')
    const { runTimerShortcut } = await import('../../lib/timerControls')
    useTimerStore.getState().start()
    useTimerStore.getState().recoverSession()
    expect(runTimerShortcut('reset')).toBe(false)
    expect(runTimerShortcut('startStop')).toBe(false)
    expect(useTimerStore.getState()).toMatchObject({ status: 'paused', recoveryPending: true })
  })
})
