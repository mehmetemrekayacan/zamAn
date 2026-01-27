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
 * Trigger vibration pattern (mobile devices)
 * @param pattern - Vibration pattern in milliseconds [vibrate, pause, vibrate...]
 */
export const triggerVibration = (pattern: number[] = [200, 100, 200, 100, 300]): void => {
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
    // @ts-expect-error - webkitAudioContext for Safari compatibility
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
 * Play multi-tone notification (success sound)
 */
export const playSuccessSound = (): void => {
  try {
    // @ts-expect-error - webkitAudioContext for Safari compatibility
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const now = audioContext.currentTime
    const duration = 0.1
    const gap = 0.05

    // First beep (higher frequency)
    const osc1 = audioContext.createOscillator()
    const gain1 = audioContext.createGain()
    osc1.connect(gain1)
    gain1.connect(audioContext.destination)
    osc1.frequency.value = 800
    osc1.type = 'sine'
    gain1.gain.setValueAtTime(0.3, now)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + duration)
    osc1.start(now)
    osc1.stop(now + duration)

    // Second beep (even higher frequency)
    const osc2 = audioContext.createOscillator()
    const gain2 = audioContext.createGain()
    osc2.connect(gain2)
    gain2.connect(audioContext.destination)
    osc2.frequency.value = 1200
    osc2.type = 'sine'
    gain2.gain.setValueAtTime(0.3, now + duration + gap)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + duration + gap + duration)
    osc2.start(now + duration + gap)
    osc2.stop(now + duration + gap + duration)
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

/**
 * Trigger all notification methods
 */
export const notifySessionComplete = (options: NotificationOptions = {}): void => {
  const {
    enableSound = true,
    enableVibration = true,
    enableBrowserNotification = true,
  } = options

  if (enableSound) {
    playSuccessSound()
  }

  if (enableVibration) {
    triggerVibration()
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
