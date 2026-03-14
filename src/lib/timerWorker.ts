/**
 * Timer Web Worker
 *
 * Arka planda throttle olmadan çalışır.
 * Ana thread'e her 500ms'de bir 'tick' mesajı gönderir.
 * start / stop mesajları ile kontrol edilir.
 */

let intervalId: ReturnType<typeof setInterval> | null = null

self.onmessage = (e: MessageEvent<'start' | 'stop'>) => {
  if (e.data === 'start') {
    // Önceki interval varsa temizle
    if (intervalId != null) {
      clearInterval(intervalId)
    }
    // İlk tick'i hemen gönder
    self.postMessage('tick')
    // Sonraki tick'leri 500ms aralıkla gönder
    intervalId = setInterval(() => {
      self.postMessage('tick')
    }, 500)
  } else if (e.data === 'stop') {
    if (intervalId != null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}
