import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ToastProps {
  message: string
  visible: boolean
  onDismiss: () => void
  duration?: number
  type?: 'success' | 'info' | 'celebration'
}

function ToastMessage({ message, onDismiss, duration = 3000, type = 'info' }: Omit<ToastProps, 'visible'>) {
  const [exiting, setExiting] = useState(false)
  const dismiss = useRef(onDismiss)
  useLayoutEffect(() => { dismiss.current = onDismiss }, [onDismiss])
  useEffect(() => {
    if (duration <= 0) return
    const exitTimer = setTimeout(() => setExiting(true), duration)
    const dismissTimer = setTimeout(() => dismiss.current(), duration + 280)
    return () => { clearTimeout(exitTimer); clearTimeout(dismissTimer) }
  }, [duration])

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[110] max-w-[calc(100%-2rem)] -translate-x-1/2
        ${exiting ? 'animate-toast-exit' : 'animate-toast-enter'}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="relative overflow-hidden rounded-2xl px-5 py-3 shadow-2xl text-white font-semibold text-sm border border-white/20 bg-primary/95">
        <span>{message}</span>
        {/* Progress bar — süre dolunca otomatik kapanır */}
        {duration > 0 && !exiting && (
          <div
            className={`absolute bottom-0 left-0 h-0.5 w-full ${type === 'celebration' ? 'bg-white/25' : 'bg-white/30'} toast-progress-bar`}
            style={{ '--toast-duration': `${duration}ms` } as React.CSSProperties}
          />
        )}
      </div>
    </div>
  )
}

export function Toast({ visible, ...props }: ToastProps) {
  return visible ? <ToastMessage key={`${props.message}:${props.duration}`} {...props} /> : null
}
