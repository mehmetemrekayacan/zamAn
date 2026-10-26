/**
 * Uygulama URL'i — Remote modda Electron ve Capacitor bu adresten yükler.
 * Arayüz güncellemeleri sonraki yüklemede/PWA güncellemesiyle alınır.
 * Electron main/preload değişiklikleri için yeni Windows paketi gerekir.
 *
 * DEV: Değiştirmek için Vercel'deki gerçek URL'inizi yazın.
 * Örnek: https://zam-an.vercel.app veya https://zaman.alanadiniz.com
 */
const APP_URL = process.env.ZAMAN_APP_URL || 'https://zam-an.vercel.app'

module.exports = { APP_URL }
