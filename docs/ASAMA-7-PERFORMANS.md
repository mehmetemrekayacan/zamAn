# 7. aşama — ölçülen performans iyileştirmeleri

26 Ekim 2026. Yerel kod ve otomatik kontroller tamamlandı; Vercel yayını ve aşağıdaki manuel kabul kullanıcı tarafından yapılacak. Bu aşama veritabanı migration'ı gerektirmez.

## Önce / sonra

| Ölçüm | Önce | Sonra |
| --- | ---: | ---: |
| 60 saniye / 120 normal tick: ana ekran yeniden çizimi | 120 | 0 |
| Aynı aralık: timer localStorage yazması | 120 | 12 |
| Aynı aralık: sayaç göstergesinin güncellenmesi | 120 | 120 |
| Başlangıç statik import zinciri: JavaScript | 908.056 bayt | 513.004 bayt |
| Aynı dosyaların ayrı ayrı gzip toplamı | 258.222 bayt | 146.285 bayt |
| Özet + tahmin + istatistikler için süre dağılımının hesaplanması | 6 tarama | 1 ortak tarama |
| 1.000 denemede aynı anda bağlanan kart | 1.000 | 20 |

Başlangıç JS miktarı yaklaşık %43,5, normal tick yazmaları %90 azaldı. Beş modun tamamında 120 tick sırasında ana ekranın 0 kez, sayaç göstergesinin 120 kez çizildiği doğrulandı. Durum geçişleri bu ölçümün dışında tutuldu; başlatma/duraklatma/bitiş ana ekranı gerektiği gibi yeniler.

React ölçümü jsdom içinde gerçek App/AccountApp, gerçek Zustand store'ları, bellek içi IndexedDB ve Storage ile yapıldı. Ana ekranın render sayısı memo uygulanmamış DashboardHeader test probuyla sayıldı; TimerHero yerine gerçek elapsed aboneliği kullanan küçük bir sayaç probu kondu. Bu sayılar tarayıcı boyama/FPS veya fiziksel cihaz ölçümü değildir. Gerçek ekran bileşenleri ayrıca gezinme testinde yüklenir.

İlk paket ölçümü üretim manifest'indeki giriş ve yalnızca statik bağımlılıklarının boyutlarını toplar. Üç ekranın dinamik giriş olduğu ve başlangıç zincirinde bulunmadığı ölçüm komutunda kontrol edilir. Recharts analitik ekranında kalır; `react-is` gibi grafik yardımcıları geniş `includes('react')` koşuluyla zorla başlangıca alınmaz.

PWA, çevrimdışı ekranların açılması için dinamik paketleri de arka planda önbelleğe alır. Bu nedenle yukarıdaki azalma ilk ziyaretteki tüm ağ aktarımında aynı oranda azalma anlamına gelmez. HTML/CSS/ikonlar, worker ve service worker da JS tablosuna dahil değildir. Toplam PWA precache: önce 21 dosya / 937,04 KiB, sonra 24 dosya / 942,45 KiB.

Sentetik verilerle, tek test worker'ında alınan örnek süreler:

| Senaryo | Önce | Sonra |
| --- | ---: | ---: |
| 1.000 seans: özet/tahmin + dört ortak dağılım tüketicisi | 32,80 ms | 7,16 ms |
| 10.000 seans: aynı hesap | 219,21 ms | 67,37 ms |
| 1.000 deneme: ilk React liste çizimi | 771,41 ms | 72,56 ms |

Seans örnekleri yarı eski kayıtlardan, yarı ölçülmüş çalışma aralıklarından oluşur. Önceki/yeni istatistik sonuçlarının tamamı eşitlik kontrolünden geçer. Süreler makine yükü, JIT ve test koşullarına bağlıdır; CI sınırı yapılmaz. Kalıcı regresyon sınırları render/yazma/kart sayısı ve sonuç doğruluğudur. Liste önce/sonra süreleri ayrı çalıştırmalardan alınmıştır.

## Değişiklikler ve kurtarma kuralı

- AccountApp yalnızca kullandığı timer/ayar alanlarına `useShallow` ile abone olur. Tick'in elapsed/remaining/checkpoint değişimleri ana ekrana yayılmaz.
- Timer persist katmanı yalnızca saat ilerlemesinden oluşan güncellemeleri 5 saniyede bir yazar. Atlanan tick'lerde JSON serileştirmesi de yapılmaz. Başlatma, duraklatma, devam, bitiş, otomatik sınav bitişi, mola geçişi ve form değişiklikleri hemen yazılır.
- `syncTimer()` açık bir checkpoint'tir. Mevcut `visibilitychange` ve `pagehide` dinleyicileri ile aktif hesap değişimi güncel süreyi hemen yazar. Gecikmeli yazma kuyruğu veya eski hesaba sonradan çalışabilecek timeout yoktur; hydration depolama karşılaştırmasını sıfırlar. Başarısız yazma checkpoint olarak hatırlanmaz.
- Uygulama/işletim sistemi zorla kapatılırsa normal çalışma son periyodik checkpoint'e döner; son yaklaşık 5 saniye kurtarılamayabilir. Tarayıcı/işletim sistemi arka planda hiç tick veya kapanış olayı göndermiyorsa bu süre daha uzun olabilir. Bilinmeyen kapalı süre çalışma sayılmaz. Sınav Saati'nin sabit bitişi ve molanın duvar saati kuralı korunur.
- Tam açılış testinde ek bir hata bulundu: diskteki çalışan misafir kaydı ilk hesap aktivasyonunda kurtarma kararından önce ilerletilebiliyordu. Hesap geçişi yalnızca bu sayfada başlatılmış/devam ettirilmiş sayacı ilerletip checkpoint eder. Diskten yüklenen kayıt kurtarma akışına bırakılır. Hata önce testle gösterildi (5 saniye yerine 30 saniye), ardından düzeltildi.
- Ayarlar, istatistikler ve Denemelerim `React.lazy` ile açıldığında yüklenir. Yüklenme durumu ve paket hatasında geri dönme/yeniden yükleme seçenekleri vardır. Yükleme sırasında da timer kısayol engeli korunur.
- `useStudyStatistics`, seans dizisi + yerel takvim anahtarı için tek dağılımı paylaşır. Kayıt/hesap, gün veya saat dilimi değişince yenilenir. WeakMap, kullanılmayan hesap dizilerini güçlü referansla tutmaz. Özet ve tahmin aynı dağılımı kullanır.
- Denemelerim sayfa başına 20 kayıt gösterir. Filtre seçimi ilk sayfaya döner; son sayfadaki kayıtlar silinince geçerli sayfa gösterilir. Ana ekran geçmişi zaten son 10 kayıtla sınırlıdır.

## Doğrulama

- **297 test / 28 dosya başarılı**; tüm paket sırası karıştırılarak da çalıştırıldı (`--sequence.shuffle --sequence.seed=26102026`). Önceki 275 teste 22 test eklendi.
- Beş modun render/yazma sayısı; gerçek Worker mesaj yoluyla checkpoint; yazma hatası ve yeniden deneme; normal/ani kapanış ve hesap açılışı; çalışma aralıkları ve hesap geçişi doğrulandı.
- React ortamında gerçek istatistik/deneme/ayar ekranlarının dinamik yüklenmesi, kapalı hesaplama açıklaması, gezinme ve klavye engelleri doğrulandı. Yükleme hatası ayrıca sınandı.
- TypeScript, değişen dosyaların ESLint kontrolü, `git diff --check`, üretim ve PWA derlemesi başarılı.
- Genel ESLint'te önceki **4 hata** sürüyor: Toast'ta 1 effect/state, notifications'ta 3 `@ts-ignore`. Bunlar 8. aşamanın kapsamındadır. Derlemede mevcut karışık statik/dinamik import ve eski Browserslist uyarıları sürer; 500 KB chunk uyarısı kalktı.
- jsdom grafiklerin ilk boyut ölçümünde iki uyarı verir; bu ortam gerçek yerleşim motoru değildir. Bu oturumda Computer Use envanterinde kullanılabilir tarayıcı bulunmadığından fiziksel tarayıcı, PWA çevrimdışı güncelleme, Windows mini oynatıcı ve Android arka plan kabulü yapılmadı.

Komutlar:

```powershell
npm.cmd test
npm.cmd run test:performance
npm.cmd run typecheck
npm.cmd run measure:bundle
```

`test:performance` süre karşılaştırmasını tek worker ile raporlar. `measure:bundle` üretim derlemesi yapıp manifest üzerinden başlangıç JS'ini ölçer. jsdom yalnızca geliştirme bağımlılığıdır; testler gerçek bulut SDK'sı/ağ kullanamaz.

## Yayın sonrası kısa kabul

1. Vercel'e yayın yap; varsa uygulamanın güncelleme bildirimini kabul edip yeni sürümü aç.
2. Her modda başlat/duraklat/devam/bitir; sayaç, başlık ve kaydın süresini kontrol et.
3. Çalışan seansı yenile ve kurtar. Duraklatıp yenile; süre ve duraklamanın korunduğunu kontrol et. Kaydetmeden bitiş ekranını yenile; notu ve kaydı doğrula.
4. Sayaç çalışırken İstatistikler ve Denemelerim arasında geç. Sayaç geri dönünce doğru ilerlemeli; bu ekranlarda Space sayacı yönetmemeli.
5. Ayarları aç/kapat; tema ve hesap bilgilerini kontrol et. İlk açılıştaki yükleme durumu kısa süre görünebilir.
6. 20'den fazla deneme varsa Sonraki/Önceki ve şablon filtresini dene; tüm kayıtlarına ulaşılmalı.
7. PWA'yı bir kez çevrimiçi açıp güncellemeyi tamamladıktan sonra çevrimdışı ekranları kontrol et.

Yerel dosyalar hazırdır; canlı veritabanında ek işlem gerekmez. Geri dönüş için önceki frontend yayını kullanılabilir; timer depolama formatı ve seans/senkron protokolü değişmedi.
