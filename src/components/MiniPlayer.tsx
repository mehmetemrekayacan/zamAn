import { useTimerStore } from '../store/timer'
import { formatDuration } from '../lib/time'
import { toggleMiniPlayer } from '../lib/electronBridge'

interface MiniPlayerProps {
  primaryLabel: string
  primaryAction: () => void
  finishBreakEarly: () => void
  finishEarly: () => void
}

export function MiniPlayer({
  primaryLabel,
  primaryAction,
  finishBreakEarly,
  finishEarly,
}: MiniPlayerProps) {
  const mode = useTimerStore((s) => s.mode)
  const status = useTimerStore((s) => s.status)
  const workBreakPhase = useTimerStore((s) => s.workBreakPhase)
  const elapsedMs = useTimerStore((s) => s.elapsedMs)
  const remainingMs = useTimerStore((s) => s.remainingMs)
  const plannedMs = useTimerStore((s) => s.plannedMs)
  const isOvertime = useTimerStore((s) => s.isOvertime)

  const timeToDisplay = isOvertime && plannedMs != null
    ? Math.max(0, elapsedMs - plannedMs) // Overtime: göster sadece fazla geçen süre
    : plannedMs != null ? remainingMs ?? plannedMs : elapsedMs

  return (
    <div className="mini-player-drag h-screen w-full bg-surface-900 text-text-primary">
      <button
        type="button"
        data-no-drag="true"
        onClick={() => toggleMiniPlayer(false)}
        className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-text-primary/20 bg-surface-700/70 text-text-muted transition hover:border-secondary/60 hover:text-text-primary"
        title="Genişlet"
      >
        ↗
      </button>

      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 px-3">
        <time className="font-mono text-4xl font-bold tabular-nums text-primary">
          {formatDuration(timeToDisplay)}
        </time>

        <div data-no-drag="true" className="flex items-center gap-2">
          <button
            type="button"
            onClick={primaryAction}
            className="rounded-full bg-success px-4 py-1.5 text-xs font-semibold text-success-foreground transition hover:shadow-lg hover:shadow-success/30"
          >
            {primaryLabel}
          </button>

          {mode === 'ders60mola15' && workBreakPhase === 'break' ? (
            <button
              type="button"
              onClick={finishBreakEarly}
              className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25"
            >
              Molayı Bitir
            </button>
          ) : (
            (status === 'running' || status === 'paused') && (
              <button
                type="button"
                onClick={finishEarly}
                className="rounded-full border border-danger/50 bg-danger/15 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/25"
              >
                Bitir
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
