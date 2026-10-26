# 6. aşama — Yerel takvim ve çalışma istatistikleri

26 Ekim 2026. Kod ve canlı Supabase eklemesi tamamlandı. Yeni frontend yayını
ve yayın sonrası görsel/gerçek cihaz kabulü bekliyor. Kullanıcı 5. aşamanın
Vercel yayınını ve önerilen manuel kontrolleri başarılı olarak bildirdi.

## Hesaplama kuralları

- Depolamadaki ISO zamanları mutlak anları gösterir; ekranlar bunları cihazın
  yerel takvimine çevirir. Gün anahtarı UTC metninin ilk on karakteri değildir.
- “Bu Hafta” pazartesi 00:00'dan, “Bu Ay” ayın ilk günü 00:00'dan başlar.
  Gelecek tarihli kayıtlar bugünkü sonuçlara eklenmez.
- Günlük grafik bugünü içeren **son 30 takvim gününü**, ısı haritası **365 günü**
  gösterir. Hafta sütunları pazartesi hizalıdır; ilk eksik hafta kaydırılmaz.
- Seansın tamamlanma tarihi `tarihISO`'dur. `createdAt` depolama metadatası,
  istatistikte farklı bir tarih kaynağı olarak kullanılmaz.
- Yeni kayıtlarda net çalışma aralıkları saat ve gün sınırlarında bölünür.
  Duraklama, kurtarma kararı ve 60/15 molası çalışma süresine eklenmez.
- Süreler çalışmanın gerçekleştiği güne; seans sayısı ve puanlar bitiş gününe
  yazılır. Aynı seans iki güne çalışma ekleyebilir; puanı bir kez sayılır.
- Günlük ve saatlik toplam, seansın kayıtlı saniye toplamını korur. Milisaniyeden
  tam saniyeye dönüşün kalanı en büyük kesirlere dağıtılır; negatif bölüm oluşmaz.
- Seri, pozitif çalışma olan yerel günlere dayanır. Bugün henüz çalışma yoksa
  dünden devam eden seri korunur; dün de boşsa sıfırlanır. Tarihteki en uzun seri
  aynı günlerden hesaplanır. Artık gün/yıl değişimi ve 23/25 saatlik günlerde
  sabit 24 saat çıkarma kullanılmaz.
- Günlük tur çarpanı, seansın bittiği yerel güne göre önceki tamamlanan
  seanslardan hesaplanır. İlk seansın seri hesabı yeni çalışılan günü içerir.
  Kaydedilmemiş taslak ertesi gün açılırsa bitiş gününün referansı kullanılır.
- Sınava kalan gün, yerel takvim günleri farkıdır. Hatalı tarih reddedilir.
  Yedek dosya adları da yerel tarihi kullanır.

## Eski veri ve bilinmeyen zaman çizgileri

Eski seansların süreleri ve puanları değiştirilmedi. Çalışmanın hangi aralıklarda
yapıldığı bilinmiyorsa başlangıç, pause veya saat dağılımı tahmin edilmez;
sürenin tamamı bilinen bitiş gününe/saatine yazılır. Kullanıcının arayüz sadeleştirme
isteğiyle bu sınırlama, istatistiklerde varsayılan kapalı “Veriler nasıl hesaplanıyor?”
alanında açıklanır. Grafiklerin ve rozetlerin aynı ortak dağılımı
kullanması, eski kayıtların artık kesin ölçülmüş hale geldiği anlamına gelmez.

Güncellemeden önce başlamış aktif seans da aralık geçmişi yoksa bu kurala uyar.
Yeni başlayan seanslar başlatma/duraklatma/devam/bitiş aralıklarını saklar.
Kapanıştan kurtarmada bilinmeyen çalışma son kalıcı kontrol noktasında kesilir.
Sınavın otomatik bitişinde aralık, gecikmiş açılış anına değil son tarihe kesilir.
Saat geriye alınmış ve çizgi tutarsızlaşmışsa kesin olmayan çizgi üretilmez;
net süre korunarak eski kayıt gösterim kuralına dönülür.

## Açık ekranın yenilenmesi

`localCalendarClock.ts` bütün aboneler için tek gece yarısı zamanlayıcısı paylaşır.
`visibilitychange`, `focus` ve `pageshow` olaylarında da takvim tekrar okunur.
Boşta açık kalan özet, grafik, ısı haritası ve sınava kalan gün yeni güne geçer.
Son abone ayrılınca zamanlayıcı ve dinleyiciler temizlenir. Test ortamının varsayılan
saat dilimi `Europe/Istanbul`; DST senaryoları ayrıca `America/New_York` ile sınanır.

## Canlı veritabanı geçişi

Proje: `mplndquosywhqscahzyn` / zamAn Project.
Migration: **20261026150258_session_work_intervals**.
Kaynak: [migration SQL](../supabase/migrations/20261026150258_session_work_intervals.sql).
Dosya resmi Supabase CLI ile oluşturuldu; uygulama MCP üzerinden yapıldığı için
dosyanın timestamp'i gerçek migration geçmişindeki kimlikle eşleştirildi.
Bu dosya mevcut v2/v3 şemasına ek geçiştir; boş bir veritabanının tek başına
kurulum dosyası değildir. Önceki SQL kaynakları `database/` altındadır.

- `sessions.work_intervals` nullable JSONB kolonu eklendi; mevcut satırlar yeniden
  yazılmadı ve eski seanslara tahmini aralık doldurulmadı.
- RPC yazıcısı aralıkları ekler/günceller. Sunucu dizi yapısını, yalnız start/end
  alanlarını, tamsayı zamanları, sıralı/çakışmayan aralıkları, bitiş sınırını ve
  toplam sürenin `sure_gercek` ile eşleşmesini doğrular.
- Doğrulama fonksiyonu `zaman_private` içinde, sabit search_path ile ve istemci
  EXECUTE yetkisi olmadan çalışır. Mevcut RLS/yazma yetkileri genişletilmedi.
- Protokol sürümü **3** kaldı; `features: ["work_intervals"]` eklendi. Yeni istemci
  özelliği olmayan sunucuya aralıkları sessizce göndermez; yerel veriyi korur.
- Eski istemcilerin not/analiz değişiklikleri bilinen aralıkları korur. Eski
  istemci süreyi, modu veya tarihi aralık göndermeden değiştirirse artık doğru
  olmayan aralıklar NULL olur; kayıt yeni içeriğe ait kesin çizgi gibi gösterilmez.
- Aralığı olmayan eski kayıtların gönderim biçimi ve içerik fingerprint'i değişmez.
  Geçişten önce tamamlanmış bir mutation'ın aynı kimlikle yeniden gönderilmesi
  de test edildi; tekrar deneme günlüğü bozulmaz.
- Yeni aralıklar yedek ve çakışma kayıtlarında doğrulanır; senkronizasyonda iki
  yöne taşınır. IndexedDB şema sürümünü değiştirmek gerekmedi.

## Yedek ve canlı doğrulama

`.local-backups/stage6-2026-10-26/` Git/lint dışında tutulur. `data-before.json`
üç uygulama tablosunun verisini, `schema-before.json` kolonları ve değişecek
fonksiyonların tanım/yetki bilgisini içerir. Auth şifreleri/anahtarları toplanmadı.
Bu yedek, önceki tam şema kaynaklarıyla birlikte uygulama verisinin kurtarılması
içindir; Supabase sistem/Auth/Storage için tam proje yedeği değildir.

Yedek izole PGlite'a geri yüklendi. UTC içerik özetleri ve sayılar eşleşti;
ardından eski v3 ve yeni ek migration uygulanıp yeni migration tekrarlandı.
Üç tablonun eski alan özetleri aynı kaldı. Geçiş kilit alındıktan sonra yedeğin
hâlâ güncel olduğunu doğrulayan guard ile canlıya uygulandı.

| Kontrol | Sonuç |
| --- | --- |
| Seanslar | 2477 satır, mevcut alan içerikleri aynı |
| Ayarlar / eski blob | 3 / 2 satır, içerikler aynı |
| Mevcut aktif kayıt | 2388; tamamı aralık bilgisi olmayan eski kayıt |
| Aktif kayıt toplamı | 5.859.592 saniye |
| Günlük / saatlik toplam | Her ikisi 5.859.592 saniye; süre kaybı/çoğalması yok |
| Mevcut seanslara eklenen tahmini aralık | 0 |
| Doğrudan eski yazıcı yetkisi | 0 |
| Performance advisors | 0 bulgu |
| Yeni güvenlik uyarısı | Yok |

[sync-work-interval-smoke.sql](../database/sync-work-interval-smoke.sql) hem yerel
kopyada hem canlıda authenticated rolüyle çalıştı: aralık oluşturma/okuma, aynı
işlemi tekrar gönderme, eski istemciyle not/süre değişimi, hatalı süreyi reddetme,
doğrudan yazmayı ve yardımcı fonksiyon erişimini reddetme geçti. Bütün test
değişiklikleri ROLLBACK edildi; veri özetleri tekrar aynı çıktı.

Önceden mevcut [sızdırılmış parola koruması kapalı](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
uyarısı değişmedi. İki yönetim tablosundaki
[RLS açık, politika yok](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
bilgileri de önceki gibi istemci erişiminin kapalı olduğu günlükler içindir.

`rehearse.mjs`, `rehearsal.json`, `applied-migration.sql`, `live-evidence.json`
ve SHA-256 `checksums.json` yerel yedek dizinindedir. Bunlar yayına eklenmez.

## Otomatik kontroller ve kalan kabul

| Kontrol | Sonuç |
| --- | --- |
| Testler | 23 dosya, 275 test geçti |
| Karıştırılmış sıra | 275 geçti; seed 26102026 |
| Yeni aşama testleri | 44: takvim 3, istatistik 13, gece yarısı/saat dilimi 3, runtime 14, SQL 11 |
| TypeScript | Başarılı |
| Değişen kaynak/test dosyalarında lint | Temiz |
| Genel lint | 4 önceki hata: Toast 1, notifications 3 |
| Üretim derlemesi | Başarılı; ana JS 708,55 kB / gzip 196,43 kB |

Vercel'e yeni kaynak kodu yayımlanmalı; SQL canlıya zaten uygulandı. Yayın sonrası
normal ve duraklatılmış yeni seansların tek kayda dönüştüğünü, grafiklerdeki
tarih/etiketleri ve mümkünse gece yarısı açık kalan ekranı kontrol edin. Gerçek
tarayıcı/Windows/Android etkileşimi ve iki fiziksel cihaz kabulü bu oturumda
yapılmadı. Sayaç render/yazma sıklığı ve paket küçültme 7. aşamanın konusudur.
