import { useEffect } from 'react'
import { useTimerStore } from '../store/timer'
import { formatDuration } from '../lib/time'
import { stopTitleFlash } from '../lib/notifications'
import { isElectron, sendTimerUpdate } from '../lib/electronBridge'

export function TimerTitleAndTraySync() {
  const status = useTimerStore((s) => s.status)
  const elapsedMs = useTimerStore((s) => s.elapsedMs)
  const remainingMs = useTimerStore((s) => s.remainingMs)
  const plannedMs = useTimerStore((s) => s.plannedMs)
  const isOvertime = useTimerStore((s) => s.isOvertime)

  const timeToDisplay = isOvertime && plannedMs != null
    ? Math.max(0, elapsedMs - plannedMs) // Overtime: göster sadece fazla geçen süre
    : plannedMs != null ? remainingMs ?? plannedMs : elapsedMs

  /* ── Dinamik tab başlığı: çalışırken sayaç göster ── */
  useEffect(() => {
    const timeStr = formatDuration(timeToDisplay)
    if (status === 'running') {
      document.title = `▶ ${timeStr} — zamAn`
    } else if (status === 'paused') {
      document.title = `⏸ ${timeStr} — zamAn`
    } else if (status === 'finished') {
      // finished durumunda notifications.ts zaten title flash yapıyor
      stopTitleFlash('zamAn')
      document.title = 'zamAn'
    } else {
      stopTitleFlash('zamAn')
      document.title = 'zamAn'
    }

    // Electron tray tooltip güncellemesi
    if (isElectron() && (status === 'running' || status === 'paused')) {
      sendTimerUpdate(timeStr)
    }
  }, [status, timeToDisplay])

  return null
}
