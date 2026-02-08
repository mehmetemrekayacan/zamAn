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

/**
 * Show browser notification
 * Requires user permission (Notification.permission)
 */
export const showBrowserNotification = (
  title: string = 'Seans Tamamlandı!',
  options: NotificationOptions = {}
): void => {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported by browser')
    return
  }

  // Check if already granted permission
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: options.body || 'Çalışma seansınız tamamlandı!',
        icon: '/favicon.svg',
        tag: 'session-complete',
      })
    } catch (error) {
      console.warn('Failed to show notification:', error)
    }
  } else if (Notification.permission !== 'denied') {
    // Request permission if not denied
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        try {
          new Notification(title, {
            body: options.body || 'Çalışma seansınız tamamlandı!',
            icon: '/favicon.svg',
            tag: 'session-complete',
          })
        } catch (error) {
          console.warn('Failed to show notification:', error)
        }
      }
    })
  }
}

let pendingSound = false

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && pendingSound) {
    pendingSound = false
    void playSuccessSound()
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/**
 * Trigger all notification methods
 * Ses: Arka plandaysa, kullanıcı geri döndüğünde çalar
 */
export const notifySessionComplete = (options: NotificationOptions = {}): void => {
  const {
    enableSound = true,
    enableVibration = true,
    enableBrowserNotification = true,
  } = options

  if (enableSound) {
    if (document.visibilityState === 'visible') {
      void playSuccessSound()
    } else {
      pendingSound = true
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
