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
  onFinishEarly: () => void
  onReset: () => void
  /** ders60mola15: Mola modundaysa true — Duraklat gizlenir, sadece "Molayı Bitir" gösterilir */
  isBreakMode?: boolean
  /** ders60mola15: Molayı erken bitirip sonraki tura geçme */
  onFinishBreak?: () => void
  /** deneme: Uzatma/ekstra süre modunda mı? */
  isOvertime?: boolean
}

function formatPauseTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
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
  onFinishEarly,
  onReset,
  isBreakMode = false,
  onFinishBreak,
  isOvertime = false,
}: TimerHeroProps) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isActive = isRunning || isPaused

  /* ── Duraklatma sayacı: pause süresi ── */
  const [pauseElapsedMs, setPauseElapsedMs] = useState(0)
  useEffect(() => {
    if (isPaused) {
      setPauseElapsedMs(0)
      const start = Date.now()
      const interval = setInterval(() => {
        setPauseElapsedMs(Date.now() - start)
      }, 1000)
      return () => clearInterval(interval)
    } else {
      setPauseElapsedMs(0)
    }
  }, [isPaused])

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
        ripple.style.color = isRunning ? 'var(--warning)' : 'var(--success)'
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
            'radial-gradient(ellipse 60% 50% at 50% 40%, color-mix(in srgb, var(--info) 14%, transparent), transparent 70%)',
        }}
      />

      <div
        className={`
          relative overflow-hidden rounded-[20px] border backdrop-blur-md
          shadow-2xl transition-all duration-500
          ${isRunning
            ? 'border-success/35 bg-[var(--card-bg)] shadow-success/20'
            : isPaused
              ? 'border-warning/35 bg-[var(--card-bg)] shadow-warning/20'
              : 'border-[var(--card-border)] bg-[var(--card-bg)] shadow-black/20'
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
              <span className="ml-1 rounded-full bg-info/20 px-2.5 py-0.5 text-[11px] font-semibold text-info">
                {workBreakPhase === 'break' ? 'Mola' : 'Çalışma'} · Tur{' '}
                {workBreakPhase === 'break'
                  ? (dersCycle ?? 1).toString()
                  : ((dersCycle ?? 0) + 1).toString()}
              </span>
            )}
            {isOvertime && (
              <span className="ml-1 rounded-full bg-warning/25 px-2.5 py-0.5 text-[11px] font-semibold text-warning animate-pulse [animation-duration:1.2s]">
                ⏰ Uzatma Süresi
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
        <div className="relative flex flex-col items-center gap-6 px-6 py-8 sm:py-12">
          <div className="relative">
            {/* Running pulse ring */}
            {isRunning && !isOvertime && (
              <div className="pointer-events-none absolute -inset-6 animate-ping rounded-full bg-success/15 [animation-duration:2s]" />
            )}
            {isRunning && isOvertime && (
              <div className="pointer-events-none absolute -inset-6 animate-ping rounded-full bg-warning/20 [animation-duration:1.5s]" />
            )}
            <time
              className={`
                relative font-mono timer-digits font-bold
                text-6xl sm:text-7xl md:text-8xl lg:text-[7rem]
                transition-colors duration-300
                ${isOvertime
                  ? 'text-warning drop-shadow-[0_0_12px_var(--warning)]'
                  : isRunning
                    ? 'text-success'
                    : isPaused
                      ? 'text-warning'
                      : 'text-text-primary'
                }
              `}
            >
              {isOvertime ? `+ ${formatDuration(timeToDisplay)}` : formatDuration(timeToDisplay)}
            </time>
          </div>

          {/* Duraklatma sayacı — sağ alt köşe */}
          {isPaused && (
            <div className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded-full bg-warning/15 border border-warning/35 px-3 py-1.5 backdrop-blur-sm animate-pulse [animation-duration:2s]">
              <span className="text-[11px] font-medium text-warning/85">⏸ Duraklatıldı:</span>
              <span className="font-mono text-xs font-bold text-warning tabular-nums">
                {formatPauseTime(pauseElapsedMs)}
              </span>
            </div>
          )}

          {/* Aksiyon butonları */}
          <div className="relative z-10 flex items-center gap-3">
            {/*
             * Break Mode Constraints (Hard Limits):
             * - Mola sırasında: Duraklat/Devam/Başlat butonu YOK
             * - Tek kontrol: "Molayı Bitir / Sonraki Tur"
             */}
            {isBreakMode ? (
              <button
                onClick={onFinishBreak}
                className={`
                  relative overflow-hidden
                  min-w-[200px] rounded-full px-8 py-3.5 text-base font-bold
                  shadow-lg transition-all duration-200
                  active:scale-[0.97] hover:-translate-y-0.5
                  bg-info text-info-foreground shadow-info/30 hover:bg-info/90 hover:shadow-info/45
                  ${pulse ? 'animate-btn-pulse' : ''}
                `}
              >
                <span className="inline-flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M2 10a.75.75 0 01.75-.75h12.59l-2.1-1.95a.75.75 0 111.02-1.1l3.5 3.25a.75.75 0 010 1.1l-3.5 3.25a.75.75 0 11-1.02-1.1l2.1-1.95H2.75A.75.75 0 012 10z" clipRule="evenodd" />
                  </svg>
                  Sonraki Tura Geç
                </span>
              </button>
            ) : (
              <>
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
                      ? 'bg-warning text-warning-foreground shadow-warning/30 hover:bg-warning/90 hover:shadow-warning/45'
                      : isPaused
                        ? 'bg-success text-success-foreground shadow-success/30 hover:bg-success/90 hover:shadow-success/45'
                        : 'bg-success text-success-foreground shadow-success/40 hover:bg-success/90 hover:shadow-success/55'
                    }
                  `}
                >
                  <span className="inline-flex items-center gap-2 transition-all duration-300">
                    <span className="text-lg transition-transform duration-300" style={{ transform: isRunning ? 'rotate(0deg)' : 'rotate(360deg)' }}>
                      {isRunning ? '⏸' : isPaused ? '▶️' : '▶️'}
                    </span>
                    {primaryLabel}
                  </span>
                </button>

                {isActive && (
                  <button
                    onClick={onFinishEarly}
                    className="rounded-full border border-danger/35 bg-danger/12 px-5 py-3.5 text-base
                               font-semibold text-danger transition-all duration-200
                               hover:bg-danger/18 hover:border-danger/55 hover:shadow-lg hover:shadow-danger/20
                               active:scale-[0.97]"
                    title="Seansı erken bitir ve kaydet"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      Bitir
                    </span>
                  </button>
                )}

                {isActive && (
                  <button
                    onClick={onReset}
                    className="rounded-full border border-text-primary/15 bg-surface-700/50 px-6 py-3.5 text-base
                               font-medium text-text-primary transition-all duration-200
                               hover:border-secondary/45 hover:text-secondary active:scale-[0.97]"
                  >
                    Sıfırla
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
})
