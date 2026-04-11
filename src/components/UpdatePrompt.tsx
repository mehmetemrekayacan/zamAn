import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * PWA Service Worker güncelleme banner'ı.
 * vite-plugin-pwa registerType:'prompt' ile çalışır.
 * Yeni SW "waiting" durumuna geçtiğinde belirip
 * kullanıcının onayıyla anında güncelleme yapar.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-surface-800/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md">
        <span className="text-sm font-medium text-text-primary">
          🎉 Yeni güncelleme mevcut!
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow shadow-primary/30 hover:bg-primary/90 active:scale-95 transition"
          >
            Güncelle
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="rounded-full border border-text-primary/15 px-3 py-1.5 text-xs font-medium text-text-muted hover:border-text-primary/30 active:scale-95 transition"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
