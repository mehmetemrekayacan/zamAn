/**
 * PWA Install Prompt — "Uygulamayı Ana Ekrana Ekle" desteği
 *
 * `beforeinstallprompt` event'ini yakalar ve kullanıcıya
 * özel bir UI ile yükleme önerisi sunar.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false

/** PWA yükleme event'ini dinlemeye başla */
export function initPwaInstall(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
  })
}

/** PWA yükleme mevcut mu? (beforeinstallprompt yakalandı mı?) */
export function canInstallPwa(): boolean {
  return deferredPrompt !== null && !installed
}

/** PWA zaten yüklü mü? (standalone modda çalışıyor mu?) */
export function isPwaInstalled(): boolean {
  if (installed) return true
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** PWA yükleme prompt'unu göster */
export async function promptInstallPwa(): Promise<boolean> {
  if (!deferredPrompt) return false

  await deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null

  return outcome === 'accepted'
}
