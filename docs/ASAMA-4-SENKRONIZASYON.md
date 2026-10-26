# 4. aşama — Sürümlü senkronizasyon ve bulut geçişi

26 Ekim 2026. Durum: Uygulama kodu ve canlı veritabanı geçişi tamamlandı.
Yedek geri yükleme provası, canlı RPC/RLS kontrolleri ve REST erişim kontrolleri geçti.
Vercel yayınını kullanıcı tamamladı; gerçek iki fiziksel cihaz kabulü ayrıca bekliyor.

Hedef proje: `mplndquosywhqscahzyn`.

## Uygulama davranışı

- Değişen seanslar kalıcı bir değişiklik kimliği ve bilinen sunucu sürümüyle
  gönderilir. Bütün yerel kayıtlar koşulsuz upsert edilmez.
- Sunucu yalnızca beklenen sürüm eşleşirse yazar. Cihazın saati karar vermez.
- Yanıt kaybolup aynı işlem tekrar gönderilirse sürüm ikinci kez artırılmaz.
- Silme bilgisi sunucuda korunur ve diğer cihazlara çekilir. Aynı kimlikle
  gönderilen eski kayıt silme işaretini kaldıramaz.
- Çakışan yerel değişiklik ayrı arşivde korunur. Kullanıcı bulut sürümünü kabul
  edebilir, yerel seansı yeni kimlikle saklayabilir veya tercihini tekrar uygulayabilir.
- Uzak kayıtları okumak yerel zaman damgalarını değiştirmez ve yeni gönderim üretmez.
- Güncelleme imleci ve 200 kayıtlık sayfalama kullanılır. Aynı hesap için
  eşzamanlı sync çağrıları koordine edilir.
- Seans ve kalıcı bekleyen değişiklik aynı yerel transaction'da saklanır.
  Kuyruk deposunda hata olsa bile değişiklik sonraki sync'te yeniden kurulabilir.
- Tercihler de sürümle gönderilir. Aktif sayaç ve cihazın bildirim izni diğer
  cihazdan gelen tercihlerle değiştirilmez.
- Sekiz otomatik denemeden sonra durdurulmuş kuyruk, kullanıcı yeniden denediğinde
  açık hesap için tekrar açılır. Diğer hesapların hata durumları değiştirilmez.
- Ayar çakışması yazılırken yapılan yeni kullanıcı düzenlemesi korunur.
  Çakışma ve tercih metadatası yarım transaction olarak bırakılmaz.
- Daha yeni bir uzak sürüm görüldükten sonra gelen eski yanıt, yeni tabana
  dayanan yerel düzenlemeyi tamamlanmış sayıp silemez.
- “Cihaz önbelleğini temizle” buluta silme göndermez. “Tüm cihazlardan sil”
  sürümlü silme akışını kullanır; eşitleme sırasında yeni eklenen seansları körlemesine silmez.

## Bu aşamada kapatılan ek eksikler

Hazır protokol kodu incelenirken eski `sync_data` verileri için aktarım,
başarısız kuyruğu yeniden açma, ayar çakışması sırasında yeni değişikliğin
korunması ve eski yanıtın yeni değişikliği tüketmesi senaryoları tamamlandı.

`scripts/supabase-upload-sync.cjs` devre dışı bırakıldı. Eski yardımcı,
service-role ile `sync_data` tablosuna doğrudan yazıp yeni protokolü atlıyordu.
Şimdi ağ isteği göndermeden açıklayıcı hata verir. Normal yedekler hedef hesaba
giriş yaptıktan sonra uygulamanın doğrulanan içe aktarma akışıyla yüklenmelidir.

## SQL geçişi

Kaynak: [supabase-v3-sync.sql](../database/supabase-v3-sync.sql).

- Temel v2 `sessions` ve `user_settings` tablolarını gerektirir.
- Tek transaction içinde sürüm, sunucu zamanı, değişiklik sırası, tekrar deneme
  günlüğü, RPC uçları ve erişim kuralları hazırlanır.
- Dış RPC fonksiyonları `SECURITY INVOKER` olarak kalır. Ayrıcalıklı yazma
  gövdeleri, Data API'ye açılmaması gereken `zaman_private` şemasındadır.
- Ayrıcalıklı fonksiyonlar `auth.uid()` üzerinden gerçek sahibini belirler;
  payload'daki kullanıcı kimliği yetki kaynağı değildir. Search path sabittir.
- Anon çağrılar kapalıdır. Tekrar deneme ve eski veri aktarım günlükleri
  doğrudan `anon`/`authenticated` erişimine açılmaz; RLS etkindir.
- Eski istemcilerin doğrudan yazma yetkileri, sütun bazlı verilmiş yetkiler dahil
  kaldırılır. Başka rollerden miras kalan yazma yetkisi varsa migration sessizce
  devam etmez; transaction geri alınır ve rol incelemesi istenir.
- Eski TRUNCATE yetkisi de kaldırılır. Üç uygulama tablosunda yalnızca hesap sahibine
  okuma politikası kalır; `(select auth.uid())` sorgu başına hesaplanır.
- Canlıda bulunan iki eski tetikleyici fonksiyonunun search_path ayarı sabitlenir.
  `analiz_suresi`, `updated_by_device` ve bigint `ekstra_sure_ms` alanları korunur.

Eski `sync_data` varsa:

- Sunucudaki bilinen `user_id` korunarak seanslar yeni tabloya aktarılır.
- Aynı kimlikli mevcut v2 kaydı veya tercihleri eski blobla ezilmez.
- Aktif sayaç başka cihaza taşınmaz.
- Orijinal JSON değiştirilmez. Geçersiz girdiler `sync_legacy_imports` tablosunda
  nedeni ve ham değeriyle incelemeye alınır; geçerli diğer kayıtların aktarımı sürer.
- Tekrar çalıştırmak kopya kayıt veya gereksiz yeni sürüm üretmez.
- Süre birimi gibi belirsiz eski değerler tahminle dönüştürülmez. İnceleme
  günlüğündeki girdiler canlı geçişin kabulünden önce değerlendirilmelidir.

## Canlı geçiş sırası

1. Bağlantıdaki hedefin `mplndquosywhqscahzyn` olduğunu doğrula. Başka projeye işlem yapma.
2. [sync-preflight.sql](../database/sync-preflight.sql) sorgularını salt okunur çalıştır.
   Tabloları, kolonları, anahtarları, RLS'yi, eski fonksiyonları ve gerçek yetkileri
   kontrol et. Standart v2 şemasıyla fark varsa SQL'i canlıda deneyerek ilerleme;
   farkı önce yerel test örneğine taşı.
3. Mevcut `sessions`, `user_settings`, `sync_data`, fonksiyonlar ve rol yetkileri
   için geri yüklenebilir yedek al ve yedeğin okunabildiğini doğrula. Veri boyutunu
   kontrol et. `zaman_private` şemasının Data API exposed schemas listesinde
   bulunmadığını doğrula; SQL ayarı null dönüyorsa Dashboard ayarına bak.
4. SQL kaynağını test/staging ortamında çalıştır, güvenlik advisors sonuçlarını
   incele. Daha sonra kontrollü yayın penceresinde canlı migration olarak uygula.
   Bu repository'deki `database/` dosyası SQL kaynağıdır. Canlı migration geçmişi
   ve uygulanan SQL aşağıdaki sonuç bölümünde kayıtlıdır.
5. [sync-verify.sql](../database/sync-verify.sql) ve preflight sorgularını tekrar
   çalıştır. Protokol sürümü 3, eski yazıcı erişimi sayısı 0 ve geçersiz aktif
   kayıt sayısı 0 olmalı. Kaynak JSON, kayıt sayıları ve aktarım sonuçlarını yedekle
   karşılaştır; `invalid` aktarım girdilerini incele.
6. Yeni istemciyi test et ve yayımla. Eski istemcilerin yazması artık reddedileceği
   için PWA/Windows/Android oturumlarının güncellenmesi gerekir. Yerel veriler
   korunur; eski istemcilere sürüm kontrolünü atlayan yazma yetkisi geri verme.
7. Gerçek iki cihazda sırayla oluşturma, düzenleme, çevrimdışı düzenleme,
   çakışma, silme, yeniden giriş ve tekrar deneme senaryolarını doğrula.
8. Advisors ve uygulama hatalarını tekrar kontrol et. Veritabanı geçişi ile
   yayın/gerçek cihaz kabulünü ayrı işaretle; yayınlanmamış kodu canlı ürün sayma.

Migration bir SQL hatasında kendi transaction'ını geri alır. Başarılı migration
sonrası uygulamada sorun çıkarsa eski koşulsuz yazıcıları açmak yerine bulut
eşitlemesini durdurup yerel kayıtları/yedekleri koru ve yeni protokolü düzelt.
Canlı yedeğin geri yüklenmesi ayrı ve kontrollü bir işlemdir.

## Doğrulama sonuçları

| Kontrol | Sonuç |
| --- | --- |
| Bütün testler | 14 dosya, 191 test geçti |
| Önceki karıştırılmış sıra kontrolü | 189 geçti; seed `26102026`; son iki SQL testi ayrıca geçti |
| Yerel PostgreSQL/PGlite protokol ve cihaz senaryoları | 46 test geçti |
| Eski blob aktarımı ve kontrol SQL'leri | 6 test; migration tekrarında veri korunuyor |
| TypeScript | Başarılı |
| Değişen kaynak/test dosyalarında lint | Temiz |
| Genel lint | 13 mevcut hata; canlı sonuç raporu değildir |
| Eski yükleme scripti | Ağ işlemi yapmadan beklenen hata kodu 1 ile duruyor |
| Üretim derlemesi | Başarılı |
| Ana JS | 697,17 kB; gzip 192,74 kB |

PGlite testleri RPC, RLS, tablo/sütun ACL'leri, eski kaynak geçişi ve uygulama
akışını PostgreSQL SQL semantiğiyle sınar. Buna ek olarak bu çalışmada canlı
yedek yerel PostgreSQL'e geri yüklendi; gerçek cihazların ağ zamanlaması sınanmadı.

## Canlı geçiş sonucu — 26 Ekim 2026

Proje: `mplndquosywhqscahzyn` / **zamAn Project**, PostgreSQL 17.
Migration: `20261025230104_versioned_sync_v3_and_legacy_preservation`.
Migration kimliği sunucunun UTC zamanını içerir; Türkiye'deki işlem tarihi 26 Ekim'dir.

| Kontrol | Canlı sonuç |
| --- | --- |
| Protokol | 3 |
| Seanslar | 2471; 2382 aktif, 89 silme işareti |
| Mevcut seans alanları | Tamamı yedekle birebir aynı |
| Mevcut ayarlar | 3 satır, eski alanlar aynı |
| Eski sync_data | 2 satır, içerik aynı |
| Eski veri aktarımı | 43 kept_existing; 0 invalid; mevcut veri ezilmedi |
| Geçersiz seans | 0; tüm kayıtlar istemci doğrulamasından da geçti |
| Eski yazıcı yetkileri | 0; tablo, sütun ve TRUNCATE kontrol edildi |
| Performans advisors | 12 uyarıdan 0'a indi |
| Değişken search_path | 2 fonksiyondan 0'a indi |
| REST özel şema kontrolü | 406 / PGRST106; zaman_private dışa açık değil |
| Anonim REST RPC | 401 / 42501; reddediliyor |

[sync-smoke.sql](../database/sync-smoke.sql) canlıda çalıştırıldı: oluşturma,
aynı işlemi tekrar gönderme, aynı işlem kimliğini farklı içerikle kullanmayı
reddetme, sürüm çakışması, delta okuma, silme işareti, yeniden oluşturmayı
reddetme, ayar sürümü, doğrudan yazmayı reddetme ve iki hesap arasında RLS
ayrımı geçti. Testler gerçek authenticated/anon veritabanı rolleriyle yürütüldü.
Tamamı ROLLBACK edildi; sonrasında üç tablonun eski alan özetleri tekrar aynı çıktı.
SQL rol testleri, gerçek kullanıcı JWT'siyle iki fiziksel cihaz testinin yerine geçmez.

Kalan güvenlik bildirimi: Önceden mevcut
[sızdırılmış parola koruması kapalı](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Bu Auth ayarı değiştirilmedi. `sync_mutations` ve `sync_legacy_imports` için
[RLS açık, politika yok](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
bilgilendirmeleri beklenir: bu iki yönetim günlüğünün istemcilere tüm yetkileri
kaldırılmıştır; erişim politikası bilerek açılmadı.

## Yedek ve geri dönüş kanıtı

Yerel dizin: `.local-backups/stage4-2026-10-26/` (Git ve lint dışında).
`data.json` üç uygulama tablosunun tam verisini; `schema.json` ilgili kolon,
anahtar, indeks, politika, yetki ve iki eski fonksiyonun tanımını içerir.
`restore-application.sql` bu tabloları boş bir hedef şemada geri kurar;
Auth hesaplarını/şifrelerini içermez ve hedefte ilgili auth.users satırları gerekir.
Üretimde doğrudan çalıştırılacak otomatik bir geri dönüş değildir.

`rehearse.mjs`, yedeği izole PGlite'a geri yükledi. UTC ile hesaplanan tüm satır
sayıları ve içerik MD5 özetleri canlıyla eşleşti. Ardından migration gerçek veri
kopyasında iki kez çalıştı; tüm eski alanlar korundu, bütün seans ve ayarlar
uygulama doğrulayıcılarından geçti. Dosya bütünlüğü için ayrıca SHA-256 manifesti
`checksums.json` içindedir. `applied-migration.sql` ve `live-evidence.json`
uygulanan sorguyu ve canlı doğrulama sonuçlarını saklar.

Geçiş, tabloları transaction içinde kilitledikten sonra canlı verinin yedekle
hâlâ eşleştiğini kontrol ederek uygulandı. Arada değişiklik olsaydı migration
duracaktı. Hassas kayıtlar Git'e, Vercel'e veya yayın çıktısına eklenmedi.

## Kullanıcının yayın adımı

Kullanıcı Vercel yayınını kendisi yapacağını belirtti. Yeni kaynak koduyla
`npm run build` başarılıdır; Vercel build komutu aynı, çıktı dizini `dist`.
Mevcut `VITE_SUPABASE_URL` hedef projeyi göstermeli; frontend yalnızca publishable
veya anon anahtar kullanmalı. `.env.local` ve `.local-backups` yayımlanmamalıdır.
Supabase SQL geçişi zaten uygulandı; Dashboard'da tekrar çalıştırmak gerekmiyor.

Yayın sonrası PWA/Electron/Android açık oturumları güncellenmeli. Önce aynı hesapta
iki cihazla yeni seans, değişiklik, çevrimdışı çakışma, silme ve yeniden giriş
kontrolü yapılmalı. Vercel yayını ve bu fiziksel cihaz kabulü bu oturumda yapılmadı.
Eski istemciler sürüm kontrolünü atlayan bulut yazmaları yapamaz; yayınlanana kadar
bulut yazma hatası gösterebilirler. Yerel kayıtlar korunur.

Güncel kılavuzlar: [Supabase Database Functions](https://supabase.com/docs/guides/database/functions),
[Supabase MCP bağlantısı](https://supabase.com/docs/guides/getting-started/mcp).
