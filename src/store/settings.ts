import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'high-contrast'
export type VurguRengi = 'mavi' | 'mor' | 'yeşil' | 'pembe'

export interface Settings {
  sesAçık: boolean
  titreşimAçık: boolean
  sessizMod: boolean
  tema: Theme
  bildirimİzni: 'granted' | 'denied' | 'default'
  kısayollar: { startStop: string; reset: string; modGeçiş: string }
  /** Selam ve motivasyonda kullanılacak isim (örn. Luna) */
  kullaniciAdi: string
  /** KPSS / alan sınavı tarihi (YYYY-MM-DD). X gün kaldı için. */
  sinavTarihi: string | null
  /** Vurgu rengi: butonlar, çubuklar, rozetler */
  vurguRengi: VurguRengi
}

const DEFAULT_SETTINGS: Settings = {
  sesAçık: true,
  titreşimAçık: true,
  sessizMod: false,
  tema: 'dark',
  bildirimİzni: 'default',
  kısayollar: { startStop: 'Space', reset: 'KeyR', modGeçiş: 'KeyM' },
  kullaniciAdi: '',
  sinavTarihi: null,
  vurguRengi: 'mavi',
}

export type SettingsState = Settings & {
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setTema: (tema: Theme) => void
  requestNotificationPermission: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setSetting: (key, value) => {
        set((state) => ({ ...state, [key]: value }))
      },

      setTema: (tema) => {
        set({ tema })
      },

      requestNotificationPermission: async () => {
        if (!('Notification' in window)) {
          console.warn('Notifications not supported')
          return
        }

        if (Notification.permission === 'granted') {
          set({ bildirimİzni: 'granted' })
          return
        }

        if (Notification.permission !== 'denied') {
          const permission = await Notification.requestPermission()
          set({ bildirimİzni: permission as 'granted' | 'denied' })
        }
      },
    }),
    {
      name: 'zaman-olcer-settings',
      merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
    },
  ),
)
