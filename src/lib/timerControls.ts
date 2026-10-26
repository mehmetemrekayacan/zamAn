import { useTimerStore } from '../store/timer'
import { getDataScope } from './dataScope'

const blockers = new Set<symbol>()
export function blockTimerControls(): () => void {
  const blocker = Symbol()
  blockers.add(blocker)
  return () => { blockers.delete(blocker) }
}

/** Web ve Electron kısayolları aynı ekran/sayaç kurallarına uyar. */
export function runTimerShortcut(action: 'startStop' | 'reset'): boolean {
  const timer = useTimerStore.getState()
  if (!getDataScope().ready || blockers.size || timer.recoveryPending || timer.status === 'finished') return false
  if (action === 'reset') timer.reset()
  else if (timer.status === 'running') timer.pause()
  else if (timer.status === 'paused') timer.resume()
  else timer.start()
  return true
}
