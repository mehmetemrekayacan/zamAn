# 5. aşama — Seans yaşam döngüsü ve kurtarma

26 Ekim 2026. Uygulama kodu tamamlandı. Kullanıcı Vercel yayınının ve önerilen
manuel kontrol listesinin sorunsuz olduğunu bildirdi. Tam Windows/Android ve
iki fiziksel cihaz kabulü ayrıca takip edilir.
Bu aşamada canlı Supabase şeması veya mevcut seanslar değiştirilmedi.

## Düzeltilen davranışlar

- Seans başlatıldığında UUID oluşturulur. Duraklama, devam, kurtarma ve kayıt
  aynı kimliği kullanır; yeni seans yeni kimlik alır.
- Başlangıç zamanı, son kontrol zamanı, duraklatma başlangıcı/sayısı ve toplam
  duraklatma süresi hesap kapsamındaki sayaç deposunda korunur.
- Bitişte süre, aktif bölüm, plan, duraklama, mod konfigürasyonu ve bitiş zamanı
  ayrı bir taslağa kopyalanır. Kayıt ekranındaki bekleme bu değerleri değiştirmez.
- Bitiş taslağı, hesaplanan puan, deneme adı, not ve analiz localStorage'da kalır.
  Yenilemede veya aynı hesaba geri dönüldüğünde bitiş ekranı tekrar açılır.
- Normal tick gecikmesinde uzatma süresi ilk güncellemede de tam hesaplanır.
  İki güncelleme arasında duraklatmak veya bitirmek son geçen süreyi kaybetmez.
- Sınav otomatik biterse bitiş zamanı gecikmiş worker/yeniden açılış anı yerine
  gerçek son tarih olur. Mola sonrasındaki gecikme mola planını aşan süre üretmez.
- Beş modda kayıt hatası taslağı silmez. Arayüz hatayı ve “Tekrar Dene” düğmesini
  gösterir; kayıt sırasında düğmeler ve form alanları kilitlenir.
- Eşzamanlı kayıt çağrıları aynı Promise'i paylaşır. İlk yazma tamamlandıktan
  sonra hata alınsa bile yeniden deneme aynı ID'yi kullanır; seans listesinde
  aynı ID ikinci kez eklenmez. Hesap değişirse eski devam yeni sayacı temizlemez.
- Deneme kaydındaki `surePlan` bütün bölümlerin toplamından değil, aktif bölümün
  planından alınır. Bölüm seçimi de ilgili planı sayaçta doğru gösterir.
- Çalışan/duraklatılmış seansın modu veya bölümü değiştirilerek seans silinemez.
  Yapılandırma alanları seans sırasında kapalıdır; mod değişiminde açıklama gösterilir.
- Ayar, kurtarma ve bitiş ekranlarında web/Electron kısayolları sayaç durumunu
  değiştiremez. Tekrarlanan keydown olayları ve düzenlenebilir alanlar atlanır.
- Electron dinleyicileri temizlenir. Eski preload sürümü temizleme fonksiyonu
  döndürmese de kaldırılmış callback artık komut çalıştırmaz.
- Duraklatma göstergesi bileşenin açıldığı zamandan değil, kalıcı pause başlangıcından
  hesaplanır. Kaydedilmiş bitiş saati ekranda da değişmeden gösterilir.

## Yeniden açılışta süre kuralı

| Durum | Uygulanan kural |
| --- | --- |
| Serbest, gerisayım, deneme ve 60/15 çalışma | Son kalıcı net çalışma korunur. Kapalı geçen bilinmeyen süre çalışma sayılmaz. |
| Zaten duraklatılmış çalışma | Duraklama sayısı ve başlangıcı korunur. Devam/bitirişte bilinen duraklama aralığı toplama eklenir. |
| Sınav Saati çalışıyor | Açılış anına kadar mutlak son tarih uygulanır; süre dolduysa plan kadar çalışma ile bitiş taslağı hazırlanır. |
| Kurtarma kararı bekleniyor | Çalışma donuktur. “Devam” gerçek devam işlemini yapar; “Bitir” kayıt ekranını açar. Karar ekranında bekleme net çalışma değildir. |
| 60/15 molası | Mutlak mola bitişi korunur. Yeniden açılışta devam eder veya planı kadar sayılarak sonraki çalışmaya hazırlanır. |
| Kaydedilmemiş bitiş + arka plan molası | Önce çalışma taslağı açılır. Kaydet/iptal sonrası mola kalan süresiyle devam eder; dolmuşsa yeni tura hazırlanır. |

Beklenmedik kapanmada son kalıcı kontrol ile kapanış arasındaki kaydedilmemiş
kısım kesin olarak bilinemez; çalışma tahmin edilerek büyütülmez. Sekme görünürlüğü
değişiminde, `pagehide` ve hesap değişiminden önce kontrol noktası güncellenir.
Eski sürümün hiç saklamadığı pause başlangıcı/sayısı veya kaybolmuş bitiş taslağı
geriye dönük olarak uydurulmaz. Eski 60/15 duraklama önbelleği okunabiliyorsa korunur.

## Veri ve yayın uyumu

Yeni yerel sayaç alanları yedek doğrulayıcısına eklendi. Taslak, puan ve formun
alanları/type'ları doğrulanır; bu nesnelere store eylemleri eklenen yedek reddedilir.
Eski sürüm 1/2 yedekleri desteklenir. Yeni sayaç taslağı bulut tercihleriyle başka
cihaza taşınmaz; kaydedilen seans mevcut v3 protokolü üzerinden eşitlenir.

Kayıt zamanı bitişte sabitlenir. Mevcut eski seansların kimlikleri veya tarihleri
yeniden yazılmaz; önceden oluşmuş olası kopyalar otomatik birleştirilmez.
Çalışma aralıklarını gün/saat sınırlarına dağıtma ve ortak tarih hesapları 6. aşamadır.
Her tick'teki persist yazısını azaltma ve kök render optimizasyonu 7. aşamadır.

Web yayını ve önerilen manuel kontroller kullanıcı tarafından doğrulandı. Yeni Electron preload temizliğinin
pakete alınması sonraki Windows derlemesinde yapılır; frontend eski preload ile
de güvenli callback iptalini destekler. Ajan tarafından yayın veya paket oluşturulmadı.

## Doğrulama

İlk yazılan 15 regression testi mevcut kodda başarısız oldu; düzeltmelerden sonra
tamamı geçti. Ek testlerle beş modda yenileme, duraklatma/devam, kurtarma, bitiş,
kayıt hatası ve tekrar deneme; çift kayıt, commit sonrası hata, hesap değişimi,
aktif bölüm, yedek dönüşü, mola/sınav son tarihi ve IPC temizliği sınandı.

| Kontrol | Sonuç |
| --- | --- |
| Bütün testler | 18 dosya, 231 test geçti |
| Yeni yaşam döngüsü testleri | 40 test: timer 24, kayıt/yedek 11, kısayol 2, IPC 3 |
| TypeScript | Başarılı |
| Değişen kaynak/test dosyalarında lint | Temiz |
| Genel lint | 4 mevcut hata: Toast 1, notifications 3 |
| Üretim derlemesi | Başarılı |
| Ana JS | Yaklaşık 704 kB; gzip 195 kB |
| Gerçek tarayıcı/Windows/Android etkileşim testi | Bu oturumda yapılmadı; otomatik kontroller fiziksel cihaz kabulü değildir |

Testler gerçek Supabase istemcisi veya kullanıcı deposuna bağlanmaz. Başarısız
kayıt senaryolarında hata enjeksiyonu ve izole IndexedDB kullanılır. Üretim
derlemesindeki mevcut büyük paket, dinamik import ve Browserslist uyarıları sürer.
