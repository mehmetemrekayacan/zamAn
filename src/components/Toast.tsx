import { useEffect } from 'react'

export interface ToastProps {
  message: string
  visible: boolean
  onDismiss: () => void
  duration?: number
  type?: 'success' | 'info' | 'celebration'
}

export function Toast({ message, visible, onDismiss, duration = 3000, type = 'info' }: ToastProps) {
  useEffect(() => {
    if (!visible || duration <= 0) return
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [visible, duration, onDismiss])

  if (!visible) return null
  const bg =
    type === 'success'
      ? 'bg-emerald-500/95 dark:bg-emerald-600/95'
      : type === 'celebration'
        ? 'bg-accent-amber/95'
        : 'bg-accent-blue/95'
  return (
    <div
      className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 shadow-xl text-white font-semibold text-sm border border-white/20"
      role="status"
      aria-live="polite"
    >
      <span className={`inline-block rounded-full px-4 py-2 ${bg}`}>{message}</span>
    </div>
  )
}
