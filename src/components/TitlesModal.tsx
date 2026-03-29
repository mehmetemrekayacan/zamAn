import { useEffect, useMemo } from 'react'
import { TITLES } from '../lib/scoring'

export interface TitlesModalProps {
  isOpen: boolean
  onClose: () => void
  currentScore: number
}

export function TitlesModal({ isOpen, onClose, currentScore }: TitlesModalProps) {
  const safeScore = Math.max(0, currentScore)

  const currentIndex = useMemo(() => {
    let idx = 0
    for (let i = 0; i < TITLES.length; i++) {
      if (safeScore >= TITLES[i].minScore) idx = i
      else break
    }
    return idx
  }, [safeScore])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-card border border-text-primary/15 bg-surface-800 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-text-primary/10 px-5 py-4">
          <div>
            <p className="section-label">Kariyer Yolu</p>
            <h2 className="section-title text-lg">Tüm Ünvanlar</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-text-primary/15 bg-surface-700/40 px-3 py-1 text-sm text-text-muted transition hover:border-secondary/45 hover:text-secondary"
          >
            Kapat
          </button>
        </div>

        <div className="border-b border-text-primary/10 bg-surface-700/30 px-5 py-3 text-sm text-text-secondary">
          Toplam puanın: <span className="font-semibold text-info">{safeScore}</span>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {TITLES.map((title, index) => {
            const unlocked = safeScore >= title.minScore
            const isCurrent = index === currentIndex

            return (
              <div
                key={title.name}
                className={`flex items-center justify-between rounded-card-sm border px-3 py-2.5 transition ${
                  isCurrent
                    ? 'border-info/55 bg-info/12 ring-1 ring-info/35'
                    : unlocked
                      ? 'border-success/35 bg-success/10'
                      : 'border-text-primary/10 bg-surface-700/30 opacity-55 grayscale'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{title.name}</p>
                  <p className="text-xs text-text-muted">Gerekli puan: {title.minScore}</p>
                </div>

                <div className="ml-3 flex items-center gap-2">
                  {isCurrent && (
                    <span className="rounded-full bg-info/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-info">
                      AKTIF
                    </span>
                  )}
                  <span className={`text-lg ${unlocked ? 'text-success' : 'text-text-muted'}`}>
                    {unlocked ? '✓' : '🔒'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
