# Yayın sonrası Auth kilidi konsol hatası

26 Ekim 2026. Kullanıcı 1.2.5 yayını sonrasında site açılırken F12'de
`Acquiring an exclusive Navigator LockManager lock ... immediately failed`
hatası bildirdi. Paylaşılan stack otomatik Auth token yenilemesine gidiyor.

## Doğrulananlar ve sınır

Kurulu `supabase-js`/`auth-js` sürümü 2.98.0. Varsayılan kilit fonksiyonunda
0 ms deneme `ifAvailable: true` kullanıyor. Kilit doluyken native callback
içinden reddedilen Promise üretiyor; SDK otomatik tick'i normalde bunu
`isAcquireTimeout` üzerinden yakalayıp atlıyor. Bu iki davranış kurulu SDK
kodu üzerinden kontrollü testle doğrulandı. Firefox'taki gerçek konsol
raporlaması bu ortamda yeniden üretilmedi.

Paylaşılan genel `NetworkError` satırı URL veya HTTP durumu içermiyor;
çevrimdışı test, geçici bağlantı veya servis hatası arasında karar vermek
için başarısız isteğin adresi gerekir. Stil yüklenmeden yerleşim uyarısı
tek başına Auth veya veri hatası kanıtı değildir. `index.js:1583` için tam
kaynak adresi verilmediğinden site/eklenti ayrımı yapılamaz.

## Değişiklik

`supabaseAuthLock.ts`, yalnızca 0 ms beklemeden deneme yolunu uyumlaştırır:

- Kilit doluyken tarayıcı callback'i başarılı bir “alınamadı” sonucu döner.
  Ardından uygulamanın Promise'i SDK'nin tanıdığı timeout işaretiyle
  reddedilir. Böylece normal kilit çakışması native callback reddi üretmez.
- Kilit alınamadığında token işi kilitsiz çalıştırılmaz. Sıra bekleyen
  diğer işlemler SDK'nin mevcut Navigator Lock yolunu kullanır.
- Web Locks olmayan ortamda SDK'nin süreç kilidi kullanılır.
- Otomatik yenileme, oturum saklama ve mevcut storage anahtarı değişmez.
  Gerçek işlem hataları timeout diye gizlenmez; global konsol/rejection
  bastırması eklenmez.
- `getSupabase()` tek istemci üretmeye devam eder. Kurulu 2.98.0 paketi
  tam sürüme sabitlendi; yeni SDK sürümüne yükseltme veya kilit iptali yapılmadı.

Kaynaklar: [2.98.0 kilit uygulaması](https://github.com/supabase/supabase-js/blob/v2.98.0/packages/core/auth-js/src/lib/locks.ts),
[SDK hata kaydı](https://github.com/supabase/supabase-js/issues/936).
Güncel master dalındaki kilit mimarisi kurulu 2.98.0 ile aynı değildir;
bu düzeltmede master davranışı varsayılmadı.

## Doğrulama ve yayın

Sekiz yeni test: eski callback reddi, yeni dolu kilit sonucu, kurulu SDK
otomatik tick'inin timeout'u yakalaması, işlemin bitimine kadar kilidin
tutulması, gerçek hata aktarımı, iki bekleme süresi ve Web Locks olmaması.
Testte istemci oluşturulmaz; SDK'den yalnızca kilit fonksiyonu ve constructor
çağrılmadan prototip tick yöntemi kullanılır. Ağ yasağı ve yanlışlıkla
bulutu etkinleştirme testi korunur.

Sonuç: **330 test / 35 dosya**, TypeScript, genel ESLint ve web/PWA üretim
derlemesi başarılı. Mevcut Browserslist/import ve jsdom grafik boyut uyarıları
bu düzeltmenin kapsamı dışında sürer.

1. Frontend'i Vercel'e yeniden yayımla, PWA güncellemesini kabul et.
2. Konsoldaki önceki logları temizleyip sayfayı bir kez aç.
3. Hesapta Ayarlar → Şimdi eşitle ile sonucu kontrol et.
4. Aynı siteyi iki sekmede aç; sekmeler arasında birkaç kez geç, en az bir
   dakika bekle. `LockManager ... immediately failed` tekrarını kontrol et.
5. `NetworkError` sürerse Ağ sekmesindeki başarısız isteğin adresi, durumu
   ve internet açık/kapalı bilgisini incele. Aynı satır için tüm site verilerini
   temizlemek veya veritabanını sıfırlamak gerekmez.

Canlı veritabanına işlem yapılmadı; SQL migration gerekmez. TinyFish
kullanılmadı. Gerçek Firefox doğrulaması yayın sonrası kullanıcıda yapılır.
