/* zamAn startup recovery — vendor paketlerinden bağımsız tutulur. */
(() => {
  const startup = document.getElementById('app-startup')
  if (!startup) return
  const panel = document.getElementById('app-startup-recovery')
  const message = document.getElementById('app-startup-message')
  const button = document.getElementById('app-startup-retry')
  const stillStarting = () => document.getElementById('app-startup') === startup
  const show = () => {
    if (!stillStarting()) return
    panel.hidden = false
    message.textContent = 'Uygulama başlatılamadı.'
  }
  window.addEventListener('error', event => {
    // Vite üretimde giriş scriptini head'e taşır ve özel data özniteliklerini
    // kaldırabilir. Gerçek module script hatasını dinle.
    if (event.target instanceof HTMLScriptElement && event.target.type === 'module') show()
  }, true)
  window.addEventListener('unhandledrejection', event => {
    if (/module|import|fetch|load/i.test(String(event.reason))) show()
  })
  // Ağ isteği yanıtsız kalırsa da kullanıcıya bir çıkış yolu sun.
  setTimeout(show, 12_000)

  button.addEventListener('click', async () => {
    if (button.disabled) return
    if (!/^https?:$/.test(window.location.protocol)) { window.location.reload(); return }
    button.disabled = true
    message.textContent = 'Bağlantı kontrol ediliyor…'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      // Özel sorgu precache ile eşleşmez. Çevrimdışıyken çalışan önbelleği silme.
      const probe = new URL('./app-recovery.js', document.baseURI)
      probe.searchParams.set('__zaman_recovery', String(Date.now()))
      const response = await fetch(probe.href, { cache: 'no-store', signal: controller.signal })
      if (!response.ok || !(await response.text()).includes('zamAn startup recovery')) throw new Error('network unavailable')
      message.textContent = 'Uygulama önbelleği yenileniyor…'
      const scope = new URL('./', document.baseURI).href
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration(scope)
        if (registration && registration.scope === scope) await registration.unregister()
      }
      if (typeof caches !== 'undefined') {
        // Yalnızca bu uygulamanın dosyaları. IndexedDB/Storage/oturumlara dokunma.
        // Cache API arızası yeniden açmayı engellemesin; worker kaldırıldı.
        try {
          const keys = await caches.keys()
          await Promise.allSettled(keys.filter(key => key === 'app-shell'
            || (key.startsWith('workbox-precache-') && key.endsWith(scope))).map(key => caches.delete(key)))
        } catch { /* Ağdan temiz açılış yine denenebilir. */ }
      }
      window.location.reload()
    } catch {
      message.textContent = 'Onarım tamamlanamadı. İnternet bağlantını kontrol edip tekrar dene.'
    } finally {
      clearTimeout(timeout)
      button.disabled = false
    }
  })
})()
