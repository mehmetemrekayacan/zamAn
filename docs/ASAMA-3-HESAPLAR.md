# 3. aşama — Hesap ve kuyruk sahipliği

Tamamlanma: 25 Ekim 2026.

Hedef: Bir hesabın yerel seanslarının, ayarlarının veya bekleyen işlemlerinin
başka hesaba taşınmasını önlemek; mevcut verileri silmeden ayırmak.

## Uygulanan davranış

- Seans veritabanları hesap kimliğine göre ayrıdır. Aynı seans kimliği misafir,
  A ve B alanlarında birbirinden bağımsız saklanabilir.
- İşlem başladığında hesap bağlamı yakalanır. Daha sonra hesap değişirse yerel
  yazma yeni hesabın deposuna yönelmez; geç tamamlanan yükleme yeni ekranı doldurmaz.
- Kuyruk girdileri `ownerId` ve hesap anahtarı taşır. Aynı seans için eski işlemi
  değiştirme yalnızca o hesabın kuyruğunda yapılır ve tek transaction ile tamamlanır.
- Kuyruk işlenirken açık veri sahibi ve auth kullanıcısı karşılaştırılır.
  Misafir işlemleri veya diğer hesabın girdileri açık hesaba gönderilmez.
- Hesap değişimi eski bağlamın AbortSignal'ını ilk await'ten önce iptal eder.
  Başlamış uzak istekler iptal sinyali alır; geç yanıtlar yeni hesabın yerel
  verisine, ayarlarına veya son eşitleme tarihine uygulanmaz.
- İptal edilen gönderimin eski hesaba ait girdisi başarıyla tüketilmiş gibi
  silinmez. İlgili hesaba yeniden girişte bekleyen veri korunur.
- Sayaç, ayarlar, deneme yapılandırması ve son eşitleme bilgisi hesaplara göre
  farklı localStorage anahtarlarında tutulur. Yeni hesapta önceki hesabın
  değerleri varsayılan olarak kullanılmaz.
- Hesap değişiminde sayaç worker'ı durdurulur, bellekteki seans listesi temizlenir,
  hedef hesabın persist durumu yüklenir ve hesap ekranı yeniden kurulur.
- Başlangıçta auth/yerel yükleme tamamlanmadan seans ekranı açılmaz. Hesap deposu
  okunamazsa eski hesabın ekranı gösterilmek yerine hata döner.
- Çıkış, kalıcı seansları veya kuyruğu silmez. Aynı hesabın tekrar bildirildiği
  auth olayları çalışan/kaydedilmemiş sayacı yeniden hydrate etmez.
- Dosya okuma veya yedek transaction'ı sürerken hesap değişirse yedek yeni
  hesabın üzerine uygulanmaz. Geri alma, yakalanmış eski hesap deposunu kullanır.

## Mevcut veri ve misafir kuralı

Eski seanslar ve eski yerel ayarlar güvenilir hesap sahipliği bilgisi taşımıyor.
`zaman-last-user` tek başına sahiplik kanıtı sayılmıyor.

- Eski seans deposu ve anahtarlar misafir alanında korunur; girişte herhangi
  bir hesaba otomatik atanmaz veya silinmez.
- Eski kuyruk veritabanına sahiplik indeksleri eklenir; sahibi olmayan satırlar
  tahminle doldurulmaz ve otomatik gönderilmez.
- Misafir alanındaki Ayarlar → Veri bölümünde sahipsiz işlem sayısı gösterilir.
  “Eski işlemleri yedekle” düğmesi bunları ham JSON arşivi olarak indirir.
- Ham işlem arşivi normal seans yedeği gibi içe alınmaz; kaynağı incelemek ve
  gerektiğinde açık bir kurtarma kararı verebilmek için saklanır.
- Misafir seanslarını hesaba taşımak için önce misafir alanında dışa aktarma,
  sonra hedef hesaba giriş ve açıkça içe aktarma yapılır. Misafirdeki kopya korunur.
  İçe aktarma, 2. aşamada tanımlandığı gibi hedefteki yerel seansları değiştirir.

## Doğrulama

`src/test/data/accounts.test.ts`: 20 test.
`src/test/data/accountLifecycle.test.ts`: 5 test.

Bu 25 kontrol; A/B/misafir ayrımı, aynı kimlikler, çıkış, geç yazma/okuma,
auth uyuşmazlığı, gönderim sırasında hesap değişimi, ayar yanıtları, eski kuyruk,
misafirden açık aktarım, kuyruk yazma hatası, yedek sırasında hesap değişimi,
worker durması ve aynı hesaptan tekrarlanan auth olaylarını kapsar.

| Kontrol | Sonuç |
| --- | --- |
| Mevcut çalışma alanındaki bütün testler | 13 dosya, 173 test geçti |
| Karıştırılmış sıra | 173 geçti; seed `25102026` |
| TypeScript | Başarılı |
| Hesap ayrımı için değişen kaynak/test dosyalarında lint | Temiz |
| Genel lint | 13 mevcut hata, 0 uyarı |
| Üretim derlemesi | Başarılı |
| Mevcut ana JS | 696,34 kB; gzip 192,52 kB |
| Mevcut CSS | 33,91 kB; gzip 7,34 kB |
| Görsel tarayıcı kontrolü | Bağlı tarayıcı bulunmadığı için yapılamadı |

Genel lint'te kalanlar: FinishScreen, TimerHero, Toast içindeki effect/setState
kuralları; notifications içindeki üç `@ts-ignore`; timerStrategies içindeki
yedi kullanılmayan parametre. Kurallar kapatılarak gizlenmedi.

## Kapsam ve sonraki adım

- Son doğrulama, çalışma alanında bulunan 4. aşama senkronizasyon hazırlıklarını
  da koruyarak yapıldı. 173 sayısı bu ek SQL/protokol/iki cihaz testlerini de içerir;
  yalnızca bu aşamada eklenen hesap testlerinin sayısı değildir.
- Testlerde bellekte IndexedDB, kontrollü Supabase yanıtları ve mevcut yerel
  PGlite test altyapısı kullanılır. Canlı Supabase hesabına veri veya migration gönderilmedi.
- Hazır `database/supabase-v3-sync.sql` dosyasının canlıya uygulanmış olduğu
  varsayılmaz. Yeni protokol bulunmazsa eşitleme güncelleme gereksinimi bildirir
  ve yerel kayıtları korur. Canlı geçiş ve iki cihazlı ürün doğrulaması 4. aşamada
  ayrıca tamamlanmalıdır.
- Hesap depolarının ayrılması, aynı cihazda şifreleme veya işletim sistemi
  seviyesinde ayrı kullanıcı alanı sağlamaz.
- Sayaç persist alanları artık doğru hesaba aittir. Süre kurtarma hesabı ve
  kaydedilmemiş bitişin yeniden açılışta tam kurtarılması 5. aşamada ele alınacaktır.

Sıradaki iş: 4. aşama — mevcut senkronizasyon hazırlıklarını, migration ve canlı
geçiş gereksinimleriyle birlikte tamamlamak.
