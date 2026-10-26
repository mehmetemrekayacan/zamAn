# PWA yayın sonrası paket yükleme düzeltmesi

26 Ekim 2026. Kullanıcı 7. aşamanın manuel kontrollerinin başarılı olduğunu, ancak Vercel yayını sonrasında Firefox'ta `zustand-vendor-BuiM4fwn.js` için Service Worker yükleme hatası gördüğünü bildirdi.

## Doğrulanan bulgular

Canlı siteye doğrudan HTTP istekleriyle yapılan kontrolde:

- `/assets/zustand-vendor-BuiM4fwn.js`: **200, application/javascript**, 3.408 karakter. Bildirilen dosya kontrol anında sunucuda mevcut.
- `/sw.js`: **200, application/javascript**.
- `/assets/does-not-exist-check.js`: **200, text/html**, ana sayfa. Genel Vercel rewrite eksik dosyaları HTML'e dönüştürüyor.

Bu bulgular kullanıcının tarayıcısındaki Cache Storage hatasını birebir yeniden üretmez. Eski worker/paket uyumsuzluğu, geçici ağ veya tarayıcı depolama hatası olasılıkları birbirinden kesin olarak ayrılmadı. İlk stil/erken yerleşim mesajı modül yükleme hatasından ayrı değerlendirilir.

## Düzenleme

- Uygulama ekranları kök URL altında yerel state ile değiştiğinden genel `/(.*) → /index.html` rewrite kaldırıldı. Eksik JS dosyalarının HTML yerine 404 dönmesi yeni Vercel yayınıyla doğrulanmalı.
- HTML, `sw.js` ve bağımsız kurtarma scriptine `no-cache`; hash içeren `/assets/` dosyalarına immutable başlığı eklendi.
- Uygulama dosyalarının zaten sürümlü precache'te olması nedeniyle ikinci `app-shell / NetworkFirst` runtime deposu kaldırıldı. Worker'ın navigation fallback'i yalnızca `/` ve `/index.html` (+ sorgu) için geçerli.
- `public/app-recovery.js`, React/Zustand paketlerinden bağımsız yüklenir. Başlangıç modülü yüklenemezse veya açılış yanıtsız kalırsa kurtarma düğmesi gösterir. Vite giriş scriptini üretimde head'e taşıdığı ve özel özniteliklerini kaldırabildiği için dinleyici gerçek `type="module"` script hatasını tanır.
- Onarım otomatik yapılmaz. Kullanıcı düğmeye bastığında önbelleğe eşleşmeyen bir ağ kontrolü yapılır; yanıt gerçek kurtarma scripti değilse mevcut worker/cache korunur. Kontrol başarılıysa yalnızca aynı kapsamdaki worker kaydı kaldırılır ve uygulamanın `app-shell` / kök scope Workbox precache dosyaları yenilenir. Diğer kapsamların cache/worker'ları, IndexedDB, localStorage ve hesap oturumu korunur. Otomatik yeniden yükleme döngüsü yoktur.
- Başlangıç paket ölçümü klasik kurtarma scriptini de kapsar: **516.062 bayt JS / 147.698 bayt gzip**. Grafikler/ayarlar/deneme yönetimi ayrı paketlerde kalır. PWA precache 25 dosya / 946,06 KiB.

## Kontrol sonucu ve sınırlar

- 303 test / 29 dosya başarılı; yeni 6 test, React yüklenemediğinde geri bildirim, başarısız bağlantıda önbelleği koruma, çift tıklama, oturum/taslak koruma, başka scope'a dokunmama ve bozuk Cache API senaryolarını kapsar.
- TypeScript, değişen TypeScript dosyalarının ESLint'i ve iki JavaScript dosyasının sözdizimi kontrolü başarılı. Önceki genel lint hataları bu düzeltmenin kapsamında değiştirilmedi.
- Üretim/PWA derlemesi başarılı. Derlenmiş gerçek HTML, jsdom'da gerçek kurtarma scriptiyle çalıştırıldı; giriş scriptinin error olayı kurtarma panelini açtı. Precache'teki 25 dosyanın tamamının çıktıda bulunduğu ve ikinci `app-shell` rotasının kaldırıldığı doğrulandı.
- Gerçek tarayıcı Service Worker yaşam döngüsü, işletim sistemi önbelleği ve düzeltilmiş Vercel yanıtları henüz yayın sonrası doğrulanmadı. Testler gerçek kullanıcı verisi veya hesap bağlantısı kullanmaz.

## Kullanıcının yapacağı kabul

1. Yeni dosyaları Vercel'e yayımla.
2. Siteyi `Ctrl+Shift+R` ile aç. Yeni başlangıç ekranında onarım düğmesi görünürse çevrimiçiyken kullan.
3. Eski worker hâlâ eski sayfayı veriyorsa Firefox `about:debugging#/runtime/this-firefox` ekranında yalnızca `zam-an.vercel.app` Service Worker kaydını kaldırıp siteyi yeniden aç. Bu işlem site verilerini topluca silmekten farklıdır; IndexedDB/localStorage temizlenmemelidir.
4. Hata veren vendor URL'si JavaScript; uydurma `/assets/does-not-exist-check.js` **404** dönmeli. Konsolda modül yükleme hatası olmamalı.
5. Seanslar, hesap oturumu ve taslak korunmalı. Bir kez çevrimiçi açılıp PWA önbelleği tamamlandıktan sonra çevrimdışı açılış ve istatistik/deneme ekranları tekrar denenmeli.

Kaynaklar: [Vite yayın sonrası import hataları](https://vite.dev/guide/build.html#load-error-handling), [Vite PWA Vercel başlıkları](https://vite-pwa-org.netlify.app/deployment/vercel), [Workbox precache yaşam döngüsü](https://developer.chrome.com/docs/workbox/modules/workbox-precaching).
