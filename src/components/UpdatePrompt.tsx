import { useRegisterSW } from 'virtual:pwa-register/react'
import { useRef, useState } from 'react'
import { useTimerStore } from '../store/timer'

/**
 * PWA Service Worker güncelleme banner'ı.
 * vite-plugin-pwa registerType:'prompt' ile çalışır.
 * Yeni SW "waiting" durumuna geçtiğinde belirip
 * kullanıcının onayıyla anında güncelleme yapar.
 */
export function UpdatePrompt() {
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const updatingRef = useRef(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const handleUpdate = async () => {
    if (updatingRef.current) return
    updatingRef.current = true
    setUpdating(true)
    setError(null)
    try {
      useTimerStore.getState().syncTimer()
      await updateServiceWorker(true)
    } catch {
      setError('Güncelleme uygulanamadı. Bağlantını kontrol edip yeniden deneyebilirsin.')
    } finally {
      updatingRef.current = false
      setUpdating(false)
    }
  }

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-surface-800/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md">
        <span className="text-sm font-medium text-text-primary">
          🎉 Yeni güncelleme mevcut!
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleUpdate}
            disabled={updating}
            aria-busy={updating}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow shadow-primary/30 hover:bg-primary/90 active:scale-95 transition"
          >
            {updating ? 'Güncelleniyor…' : 'Güncelle'}
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            disabled={updating}
            className="rounded-full border border-text-primary/15 px-3 py-1.5 text-xs font-medium text-text-muted hover:border-text-primary/30 active:scale-95 transition"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
        {error && <p role="alert" className="w-full text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
