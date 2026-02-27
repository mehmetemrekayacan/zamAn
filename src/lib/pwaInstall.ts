import { usePwaInstallStore, type BeforeInstallPromptEvent } from '../store/pwaInstall'

let initialized = false

/** PWA yükleme event'ini dinlemeye başla */
export function initPwaInstall(): void {
  if (typeof window === 'undefined' || initialized) return
  initialized = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    usePwaInstallStore.getState().setDeferredPrompt(e as BeforeInstallPromptEvent)
  })

  window.addEventListener('appinstalled', () => {
    usePwaInstallStore.getState().markInstalled()
  })
}

/** PWA yükleme mevcut mu? (beforeinstallprompt yakalandı mı?) */
export function canInstallPwa(): boolean {
  return usePwaInstallStore.getState().isInstallable
}

/** PWA zaten yüklü mü? (standalone modda çalışıyor mu?) */
export function isPwaInstalled(): boolean {
  return usePwaInstallStore.getState().isInstalled
}

/** PWA yükleme prompt'unu göster */
export async function promptInstallPwa(): Promise<boolean> {
  return usePwaInstallStore.getState().promptInstall()
}
