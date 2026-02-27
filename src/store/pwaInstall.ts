import { create } from 'zustand'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

const INSTALLED_KEY = 'zaman-pwa-installed'

type PwaInstallState = {
  deferredPrompt: BeforeInstallPromptEvent | null
  isInstallable: boolean
  isInstalled: boolean
  setDeferredPrompt: (event: BeforeInstallPromptEvent | null) => void
  markInstalled: () => void
  promptInstall: () => Promise<boolean>
}

function detectStandaloneMode() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function detectInstalled() {
  if (typeof window === 'undefined') return false
  const persistedInstalled = window.localStorage.getItem(INSTALLED_KEY) === '1'
  return persistedInstalled || detectStandaloneMode()
}

export const usePwaInstallStore = create<PwaInstallState>((set, get) => ({
  deferredPrompt: null,
  isInstallable: false,
  isInstalled: detectInstalled(),

  setDeferredPrompt: (event) => {
    const installed = get().isInstalled
    set({
      deferredPrompt: event,
      isInstallable: Boolean(event) && !installed,
    })
  },

  markInstalled: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(INSTALLED_KEY, '1')
    }
    set({
      isInstalled: true,
      isInstallable: false,
      deferredPrompt: null,
    })
  },

  promptInstall: async () => {
    const promptEvent = get().deferredPrompt
    if (!promptEvent) return false

    await promptEvent.prompt()
    const result = await promptEvent.userChoice

    set({
      deferredPrompt: null,
      isInstallable: false,
    })

    if (result.outcome === 'accepted') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(INSTALLED_KEY, '1')
      }
      set({ isInstalled: true })
      return true
    }

    return false
  },
}))

export type { BeforeInstallPromptEvent }
