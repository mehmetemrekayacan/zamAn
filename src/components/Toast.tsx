import { useEffect, useState } from 'react'

export interface ToastProps {
  message: string
  visible: boolean
  onDismiss: () => void
  duration?: number
  type?: 'success' | 'info' | 'celebration'
}

export function Toast({ message, visible, onDismiss, duration = 3000, type = 'info' }: ToastProps) {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit' | 'hidden'>('hidden')

  useEffect(() => {
    if (visible) {
      setPhase('enter')
      // enter → visible
      const enterT = setTimeout(() => setPhase('visible'), 50)
      return () => clearTimeout(enterT)
    } else if (phase === 'visible' || phase === 'enter') {
      setPhase('exit')
      const exitT = setTimeout(() => {
        setPhase('hidden')
        onDismiss()
      }, 280)
      return () => clearTimeout(exitT)
    }
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss
  useEffect(() => {
    if (phase !== 'visible' || duration <= 0) return
    const t = setTimeout(() => {
      setPhase('exit')
      setTimeout(() => {
        setPhase('hidden')
        onDismiss()
      }, 280)
    }, duration)
    return () => clearTimeout(t)
  }, [phase, duration, onDismiss])

  if (phase === 'hidden') return null

  const bg =
    type === 'success'
      ? 'bg-emerald-500/95'
      : type === 'celebration'
        ? 'bg-accent-amber/95'
        : 'bg-accent-blue/95'

  const progressBg =
    type === 'success'
      ? 'bg-white/30'
      : type === 'celebration'
        ? 'bg-white/25'
        : 'bg-white/30'

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2
        ${phase === 'enter' || phase === 'visible' ? 'animate-toast-enter' : 'animate-toast-exit'}
      `}
      role="status"
      aria-live="polite"
    >
      <div className={`relative overflow-hidden rounded-2xl px-5 py-3 shadow-2xl text-white font-semibold text-sm border border-white/20 ${bg}`}>
        <span>{message}</span>
        {/* Progress bar — süre dolunca otomatik kapanır */}
        {duration > 0 && phase === 'visible' && (
          <div
            className={`absolute bottom-0 left-0 h-0.5 w-full ${progressBg} toast-progress-bar`}
            style={{ '--toast-duration': `${duration}ms` } as React.CSSProperties}
          />
        )}
      </div>
    </div>
  )
}
