/**
 * Uygulama URL'i — Remote modda Electron ve Capacitor bu adresten yükler.
 * Her deploy sonrası tüm kullanıcılar anında güncelleme alır (yeniden yükleme gerekmez).
 *
 * DEV: Değiştirmek için Vercel'deki gerçek URL'inizi yazın.
 * Örnek: https://zam-an.vercel.app veya https://zaman.alanadiniz.com
 */
const APP_URL = process.env.ZAMAN_APP_URL || 'https://zam-an.vercel.app'

module.exports = { APP_URL }
