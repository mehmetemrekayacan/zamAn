import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration } from '../lib/time'
import type { TimerStatus, WorkBreakPhase, Mode } from '../types'

export interface TimerHeroProps {
  timeToDisplay: number
  status: TimerStatus
  mode: Mode
  workBreakPhase?: WorkBreakPhase
  dersCycle?: number
  pauses: number
  primaryLabel: string
  primaryAction: () => void
  onReset: () => void
}

const MODE_LABELS: Record<string, string> = {
  serbest: 'Kronometre',
  gerisayim: 'Zamanlayıcı',
  ders60mola15: '60/15 Pomodoro',
  deneme: 'Deneme Sınavı',
}

const MODE_EMOJIS: Record<string, string> = {
  serbest: '⏱️',
  gerisayim: '⏳',
  ders60mola15: '🍅',
  deneme: '📋',
}

/**
 * Hero Timer bileşeni — sayfanın en dikkat çekici, merkezi öğesi.
 *
 * Tasarım prensipleri:
 * – Büyük, okunabilir monospace zaman gösterimi (text-7xl → text-8xl)
 * – Geniş padding & radial glow arka plan ile "kart içinde sahne" etkisi
 * – Büyük, erişilebilir CTA butonları (min 48 px touch target)
 * – Çalışıyorken dinamik pulse animasyonu
 * – Minimal iç bilgi: sadece mod etiketi + duraklatma sayacı
 */
export const TimerHero = memo(function TimerHero({
  timeToDisplay,
  status,
  mode,
  workBreakPhase,
  dersCycle,
  pauses,
  primaryLabel,
  primaryAction,
  onReset,
}: TimerHeroProps) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isActive = isRunning || isPaused

  /* ── Buton pulse: durum değiştiğinde tetiklenir ── */
  const [pulse, setPulse] = useState(false)
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      queueMicrotask(() => setPulse(true))
      const t = setTimeout(() => setPulse(false), 500)
      prevStatusRef.current = status
      return () => clearTimeout(t)
    }
  }, [status])

  /* ── Ripple efekti ── */
  const btnRef = useRef<HTMLButtonElement>(null)
  const handlePrimaryClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Ripple oluştur
      const btn = btnRef.current
      if (btn) {
        const rect = btn.getBoundingClientRect()
        const ripple = document.createElement('span')
        ripple.className = 'btn-ripple-ring'
        ripple.style.left = `${e.clientX - rect.left}px`
        ripple.style.top = `${e.clientY - rect.top}px`
        ripple.style.color = isRunning ? 'rgba(245,158,11,0.3)' : 'rgba(56,189,248,0.3)'
        btn.appendChild(ripple)
        setTimeout(() => ripple.remove(), 600)
      }
      primaryAction()
    },
    [primaryAction, isRunning],
  )

  return (
    <section className="relative isolate">
      {/* Arka plan glow — Timer çalışırken vurgu */}
      <div
        className={`pointer-events-none absolute -inset-4 -z-10 rounded-3xl transition-opacity duration-700 ${
          isRunning ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(56,189,248,0.12), transparent 70%)',
        }}
      />

      <div
        className={`
          relative overflow-hidden rounded-2xl border bg-surface-800/70 backdrop-blur-sm
          shadow-2xl transition-all duration-500
          ${isRunning
            ? 'border-accent-blue/40 shadow-accent-blue/20'
            : isPaused
              ? 'border-accent-amber/40 shadow-accent-amber/10'
              : 'border-text-primary/10 shadow-black/20'
          }
        `}
      >
        {/* Üst şerit: Mod etiketi + Duraklatma bilgisi */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{MODE_EMOJIS[mode]}</span>
            <span className="text-sm font-medium text-text-muted">
              {MODE_LABELS[mode]}
            </span>
            {mode === 'ders60mola15' && (
              <span className="ml-1 rounded-full bg-accent-amber/20 px-2.5 py-0.5 text-[11px] font-semibold text-accent-amber">
                {workBreakPhase === 'break' ? 'Mola' : 'Çalışma'} · Tur{' '}
                {((dersCycle ?? 0) + 1).toString()}
              </span>
            )}
          </div>

          {isActive && pauses > 0 && (
            <span className="rounded-full bg-surface-700/80 px-2.5 py-0.5 text-xs text-text-muted">
              ⏸ {pauses} duraklama
            </span>
          )}
        </div>

        {/* Merkezi zaman gösterimi */}
        <div className="flex flex-col items-center gap-6 px-6 py-8 sm:py-12">
          <div className="relative">
            {/* Running pulse ring */}
            {isRunning && (
              <div className="absolute -inset-6 animate-ping rounded-full bg-accent-blue/10 [animation-duration:2s]" />
            )}
            <time
              className={`
                relative font-display tabular-nums tracking-tight
                text-6xl sm:text-7xl md:text-8xl lg:text-[7rem]
                transition-colors duration-300
                ${isRunning
                  ? 'text-accent-blue drop-shadow-[0_0_30px_rgba(56,189,248,0.3)]'
                  : isPaused
                    ? 'text-accent-amber drop-shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    : 'text-text-primary'
                }
              `}
            >
              {formatDuration(timeToDisplay)}
            </time>
          </div>

          {/* Aksiyon butonları */}
          <div className="flex items-center gap-3">
            <button
              ref={btnRef}
              onClick={handlePrimaryClick}
              className={`
                relative overflow-hidden
                min-w-[140px] rounded-full px-8 py-3.5 text-base font-bold
                shadow-lg transition-all duration-200
                active:scale-[0.97] hover:-translate-y-0.5
                ${pulse ? 'animate-btn-pulse' : ''}
                ${isRunning
                  ? 'bg-accent-amber text-surface-900 shadow-amber-500/30 hover:shadow-amber-500/50'
                  : isPaused
                    ? 'bg-accent-blue text-surface-900 shadow-cyan-500/30 hover:shadow-cyan-500/50'
                    : 'bg-accent-blue text-surface-900 shadow-cyan-500/40 hover:shadow-cyan-500/60'
                }
              `}
            >
              {/* Durum ikonu + metin geçişi */}
              <span className="inline-flex items-center gap-2 transition-all duration-300">
                <span className="text-lg transition-transform duration-300" style={{ transform: isRunning ? 'rotate(0deg)' : 'rotate(360deg)' }}>
                  {isRunning ? '⏸' : isPaused ? '▶️' : '▶️'}
                </span>
                {primaryLabel}
              </span>
            </button>

            {isActive && (
              <button
                onClick={onReset}
                className="rounded-full border border-text-primary/15 bg-surface-700/50 px-6 py-3.5 text-base
                           font-medium text-text-primary transition-all duration-200
                           hover:border-accent-red/40 hover:text-accent-red active:scale-[0.97]"
              >
                Sıfırla
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
})
