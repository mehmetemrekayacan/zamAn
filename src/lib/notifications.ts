/**
 * Notification, sound, and vibration utilities for session completion
 */

export interface NotificationOptions {
  title?: string
  body?: string
  enableSound?: boolean
  enableVibration?: boolean
  enableBrowserNotification?: boolean
}

const PUSH_TOKEN_STORAGE_KEY = 'zaman-push-token'
let pushInitialized = false

/**
 * Trigger vibration (mobile: Capacitor Haptics, web: Vibration API).
 * Android'de WebView'daki navigator.vibrate bazen çalışmaz; native Haptics kullanırız.
 */
export const triggerVibration = async (pattern: number[] = [200, 100, 200, 100, 300]): Promise<void> => {
  try {
    // @ts-ignore - Capacitor run-time dependency, build’te olmayabilir
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor?.isNativePlatform?.()) {
      const { Haptics } = await import('@capacitor/haptics')
      // Android’de pattern için ardışık titreşim (toplam ~900ms)
      await Haptics.vibrate({ duration: pattern[0] ?? 200 })
      if (pattern.length > 2) {
        await new Promise((r) => setTimeout(r, (pattern[1] ?? 100) + 50))
        await Haptics.vibrate({ duration: pattern[2] ?? 200 })
      }
      return
    }
  } catch {
    // Capacitor/Haptics yok veya hata → Web API dene
  }
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch (error) {
      console.warn('Vibration not available:', error)
    }
  }
}

/**
 * Play notification sound
 * Creates a simple beep sound using Web Audio API
 */
export const playNotificationSound = (frequency: number = 800, duration: number = 500): void => {
  try {
    // @ts-ignore - webkitAudioContext for Safari compatibility
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + duration / 1000)
  } catch (error) {
    console.warn('Audio notification not available:', error)
  }
}

/**
 * Play multi-tone success sound (daha uzun, arka planda da duyulabilir)
 * 3 yükselen ton: 800Hz → 1000Hz → 1200Hz, her biri ~250ms
 */
export const playSuccessSound = async (): Promise<void> => {
  try {
    // @ts-ignore - webkitAudioContext for Safari compatibility
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    const now = audioContext.currentTime
    const duration = 0.25
    const gap = 0.08
    const tones = [800, 1000, 1200]

    for (let i = 0; i < tones.length; i++) {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.frequency.value = tones[i]
      osc.type = 'sine'
      const start = now + i * (duration + gap)
      gain.gain.setValueAtTime(0.35, start)
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration)
      osc.start(start)
      osc.stop(start + duration)
    }
  } catch (error) {
    console.warn('Success sound not available:', error)
  }
}

const FLASH_TITLE = '🔔 Seans Tamamlandı!'
let titleFlashInterval: ReturnType<typeof setInterval> | null = null
let originalTitle = 'zamAn'

function startTitleFlash(): void {
  if (typeof document === 'undefined') return
  originalTitle = document.title || 'zamAn'
  if (titleFlashInterval) return
  let showFlash = true
  titleFlashInterval = setInterval(() => {
    document.title = showFlash ? FLASH_TITLE : originalTitle
    showFlash = !showFlash
  }, 800)
}

/** Sekme başlığını normale döndürür; finish ekranı kapatılınca veya sekme öne gelince çağrılmalı. restoreTitle verilirse o kullanılır. */
export function stopTitleFlash(restoreTitle?: string): void {
  if (titleFlashInterval) {
    clearInterval(titleFlashInterval)
    titleFlashInterval = null
  }
  if (typeof document !== 'undefined') {
    document.title = restoreTitle ?? originalTitle
  }
}

/**
 * Show browser notification — tıklanınca sekmeyi odaklar
 */
export const showBrowserNotification = (
  title: string = 'Seans Tamamlandı!',
  options: NotificationOptions = {}
): void => {
  if (!('Notification' in window)) return

  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body: options.body || 'Çalışma seansınız tamamlandı!',
        icon: '/icon-192x192.png',
        tag: 'session-complete',
      })
      n.onclick = () => {
        window.focus()
        n.close()
      }
    } catch {
      /* ignore */
    }
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        try {
          const n = new Notification(title, {
            body: options.body || 'Çalışma seansınız tamamlandı!',
            icon: '/icon-192x192.png',
            tag: 'session-complete',
          })
          n.onclick = () => {
            window.focus()
            n.close()
          }
        } catch {
          /* ignore */
        }
      }
    })
  }
}

let pendingSound = false

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    if (pendingSound) {
      pendingSound = false
      void playSuccessSound()
    }
    stopTitleFlash()
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/** Kullanıcı Başlat'a bastığında çağrılmalı — ses ve bildirim için context hazırlar */
export const prepareForBackgroundNotify = (): void => {
  if (typeof window === 'undefined') return
  requestNotificationPermission().then((granted) => {
    if (granted) {
      import('../store/settings').then(({ useSettingsStore }) => {
        useSettingsStore.getState().setSetting('bildirimİzni', 'granted')
      }).catch(() => {})
    }
  })
  prepareAudioContext()
  void initPushNotifications()
}

let sharedAudioContext: AudioContext | null = null

function prepareAudioContext(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new Ctx()
    }
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume()
    }
  } catch {
    /* ignore */
  }
}

/**
 * Trigger all notification methods
 * Arka plandaysa: bildirim + başlık yanıp sönme; ses geri dönünce çalar
 */
export const notifySessionComplete = (options: NotificationOptions = {}): void => {
  const {
    enableSound = true,
    enableVibration = true,
    enableBrowserNotification = true,
  } = options

  const isBackground = document.visibilityState === 'hidden'

  if (enableSound) {
    if (isBackground) {
      void playSuccessSoundWithSharedContext()
      pendingSound = true
    } else {
      void playSuccessSound()
    }
  }

  if (enableVibration) {
    void triggerVibration()
  }

  if (enableBrowserNotification) {
    showBrowserNotification(
      options.title || 'Seans Tamamlandı! 🎉',
      options
    )
  }

  if (isBackground) {
    startTitleFlash()
  }
}

async function playSuccessSoundWithSharedContext(): Promise<void> {
  try {
    if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
      if (sharedAudioContext.state === 'suspended') {
        await sharedAudioContext.resume()
      }
      const now = sharedAudioContext.currentTime
      const duration = 0.25
      const gap = 0.08
      const tones = [800, 1000, 1200]
      for (let i = 0; i < tones.length; i++) {
        const osc = sharedAudioContext.createOscillator()
        const gain = sharedAudioContext.createGain()
        osc.connect(gain)
        gain.connect(sharedAudioContext.destination)
        osc.frequency.value = tones[i]
        osc.type = 'sine'
        const start = now + i * (duration + gap)
        gain.gain.setValueAtTime(0.35, start)
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration)
        osc.start(start)
        osc.stop(start + duration)
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Request notification permissions (should be called on user interaction)
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

/**
 * Android (Capacitor) FCM Push Notifications init.
 * - requestPermissions
 * - register
 * - token/listener yönetimi
 */
export const initPushNotifications = async (): Promise<void> => {
  if (pushInitialized) return

  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor?.isNativePlatform?.()) return

    const {
      PushNotifications,
    } = await import('@capacitor/push-notifications')

    const permStatus = await PushNotifications.requestPermissions()
    if (permStatus.receive !== 'granted') {
      console.warn('[push] Permission denied:', permStatus.receive)
      return
    }

    await PushNotifications.register()

    await PushNotifications.addListener('registration', (token) => {
      console.log('[push] FCM token:', token.value)
      try {
        localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token.value)
      } catch {
        /* ignore */
      }
    })

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[push] Registration error:', error)
    })

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[push] Foreground notification:', notification)
      notifySessionComplete({
        title: notification.title ?? 'Yeni Bildirim',
        body: notification.body ?? '',
        enableBrowserNotification: false,
        enableSound: true,
        enableVibration: true,
      })
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[push] Notification action:', action)
      window.focus()
      const dataTitle = action.notification?.data?.title as string | undefined
      const dataBody = action.notification?.data?.body as string | undefined
      if (dataTitle || dataBody) {
        showBrowserNotification(dataTitle ?? 'Bildirim Açıldı', {
          body: dataBody,
          enableBrowserNotification: true,
        })
      }
    })

    pushInitialized = true
  } catch (error) {
    console.warn('[push] Capacitor push init skipped:', error)
  }
}

export const getStoredPushToken = (): string | null => {
  try {
    return localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}
