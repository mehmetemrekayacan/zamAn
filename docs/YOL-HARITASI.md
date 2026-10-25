# zamAn geliştirme yol haritası

Oluşturulma: 24 Ekim 2026.
Dayanak: [Teknik inceleme](INCELEME-2026-10-24.md).
Durum: İnceleme ve 1–4. aşamaların kod çalışması tamamlandı. 4. aşamanın canlı Supabase geçişi ve RPC/RLS kontrolleri geçti; Vercel yayınını kullanıcı yapacak, yayın sonrası gerçek iki cihaz kabulü bekliyor. Sonuçlar: [Test altyapısı](TEST-ALTYAPISI.md), [güvenli yedekleme](ASAMA-2-YEDEKLEME.md), [hesap ve kuyruk ayrımı](ASAMA-3-HESAPLAR.md), [senkronizasyon geçişi](ASAMA-4-SENKRONIZASYON.md). Son güncelleme: 26 Ekim 2026.

Amaç: Mevcut verileri korumak, sayaç ve istatistikleri doğru çalıştırmak, ardından ölçülebilir performans iyileştirmesi yapmak.

## Çalışma yöntemi

- Aşamalar aşağıdaki sırayla uygulanacak. Her aşama küçük, incelenebilir değişikliklere bölünecek.
- Hata düzeltmelerinde önce ilgili hata senaryosu testle gösterilecek, ardından düzeltme doğrulanacak. Test işi sona bırakılmayacak.
- Her aşamada ilgili testler, TypeScript/üretim derlemesi ve değişen kaynakların lint kontrolü yapılacak. İlgisiz mevcut hatalar ayrıca takip edilecek.
- Her aşama sonunda değişen davranış, kontrol sonuçları ve kalan sınırlamalar raporlanacak.
- Mevcut kayıtları dönüştüren işlemler sürümlü ve geri alınabilir olacak. Gerçek veriye dokunmadan önce yedek ve geri yükleme yolu doğrulanacak.
- Canlı bulut şemasına geçiş, yerel kodun tamamlanmasından ayrı takip edilecek. Yerel testlerin geçmesi canlı geçişin tamamlandığı anlamına gelmeyecek.

## Kesin uygulama sırası

### 1. Doğrulama altyapısını hazırla

Öncelik: P0 — sonraki düzeltmeleri güvenle yapabilmek.

- IndexedDB, localStorage ve Supabase davranışlarını gerçek kullanıcı verisine dokunmadan sınayacak test yardımcılarını kur.
- Bozuk yedek, hesap değişimi, iki cihazda çakışma/silme ve yeniden açılış senaryolarını ilgili aşamalarda kullanılacak şekilde tanımla.
- Eski `npm test` komutunu güncel test sistemine bağla; üretilmiş Android/build dosyalarını lint kapsamından çıkar.
- İncelemedeki test, derleme ve paket boyutu ölçümlerini başlangıç noktası olarak koru.

Tamamlanma ölçütü: Testler üretim hesabına bağlanmadan çalışır; standart test komutu günceldir; başlangıç sonuçları kayıtlıdır.

### 2. Yedek içe aktarmayı güvenli yap

Öncelik: P0 — doğrudan veri kaybını önlemek.

- Dosya sürümü, seans listesi, zorunlu alanlar, tarih ve sayısal değerleri silme/yazma öncesinde doğrula.
- Desteklenmeyen sürümü ve geçersiz dosyayı mevcut veriye dokunmadan reddet.
- Yerel seans değişimini atomik yap; hata durumunda eski kayıtları koru.
- Ayarlar/sayaç verilerinin uygulanması ve kuyruk etkisini açıkça yönet; yarım içe aktarmayı başarı gibi gösterme.
- Dışa aktarılan geçerli bir yedeğin geri alınmasını test et.

Tamamlanma ölçütü: Bozuk dosyada ve işlem hatasında eski veri korunur; geçerli yedek eksiksiz geri yüklenir.

### 3. Hesap ve senkron kuyruğu sahipliğini düzelt

Öncelik: P0 — verilerin hesaplar arasında karışmasını önlemek.

- Yerel seansları, kuyruk girdilerini ve eşitleme bilgisini kullanıcı kimliğine göre ayır.
- Hesap değişirken devam eden gönderimleri de kontrol et; yalnızca yeni kuyruk girdilerini etiketlemekle yetinme.
- Çıkıştaki yanlış localStorage anahtarlarını düzelt; bekleyen veriyi kaybetmeden hesap değişimini yönet.
- Misafir kayıtlarının hesaba aktarılma kuralını belirle; sahibi bilinmeyen eski kuyruk girdilerini otomatik olarak yeni hesaba gönderme.
- Eski yerel veri için kayıpsız geçiş uygula.

Tamamlanma ölçütü: A hesabının bekleyen işlemleri B hesabına gitmez; çıkış/giriş ve çevrimdışı hesap değişimi testleri geçer.

### 4. İki cihazlı senkronizasyonu ve silmeyi düzelt

Öncelik: P0 — güncel verinin korunması.

- Tüm kayıtları koşulsuz gönderme yerine değişiklik odaklı eşitlemeye geç.
- Sunucuda sürüm kontrolüyle eski yazmayı reddet; istemci saatini tek doğruluk kaynağı olarak kullanma.
- Silme bilgisini diğer cihazlara taşı; silinen kaydın eski cihaz tarafından yeniden oluşturulmasını engelle.
- Buluttan gelen kaydı uygularken zaman damgasını koru ve tekrar gönderim kuyruğuna ekleme.
- Eşzamanlı sync çağrılarını, tekrar denemeyi ve kuyruk durumlarını tutarlı yönet.
- Ayar eşitlemesindeki sürüm, hata bildirimi ve Zustand güncellemesini düzelt.
- “Yerel veriyi temizle” ile “Tüm cihazlardan sil” davranışlarını ayır; yedekten geri yüklemenin bulut etkisini bu akışa bağla.
- Gerekli SQL migration'larını ve eski istemcilerle geçiş planını hazırla.

Tamamlanma ölçütü: İki cihaz simülasyonunda yeni değişiklik ezilmez, silinen kayıt geri gelmez, tekrarlanan sync sonucu değiştirmez. Canlı geçiş durumu ayrıca belirtilir.

### 5. Seans yaşam döngüsü ve kurtarmayı düzelt

Öncelik: P1 — süre ve kayıt doğruluğu.

- Başlatılan seansa kalıcı bir kimlik ver; bitişte değişmez bir kayıt taslağı oluştur.
- Başlangıç, duraklama, devam ve bitiş zamanlarını güvenilir biçimde sakla.
- Yeniden açılışta geçen sürenin mod bazındaki kuralını netleştir; kurtarma ekranında beklenen süreyi çalışmaya ekleme.
- Duraklatma sayısı/süresi, kaydedilmemiş bitiş ve arka plan mola durumunu kurtar.
- Çift tıklamada tek kayıt oluşmasını sağla; başarısız kayıtta yeniden denemeyi mümkün kıl.
- Bitiş/ayar/kurtarma ekranlarında kısayolların seansı bozmasını engelle; çalışan seansın mod geçişinde sessizce kaybolmasını önle.
- Deneme kaydında plan süresini aktif bölümden al.

Tamamlanma ölçütü: Beş modda yenileme, duraklatma, devam, bitiş, kayıt hatası ve tekrar kaydetme senaryoları doğru çalışır.

### 6. Tarih, istatistik ve puan girdilerini tutarlı yap

Öncelik: P1 — gösterilen sonuçlara güvenebilmek.

- Gün/hafta/ay hesaplarını ortak yerel tarih yardımcılarında topla; UTC depolama ile yerel gösterimi ayır.
- Günlük grafik ve ısı haritasındaki bir günlük etiket kaymasını düzelt.
- Gece yarısında açık ekranın özetlerini yenile; seri ve günlük tur hesabını aynı gün tanımıyla çalıştır.
- “Bu hafta/ay” ile “Son 7/30 gün” etiketlerini gerçek hesap aralığıyla eşleştir.
- Yeni seansların çalışma aralıklarını kullanarak saat/gün sınırlarına süre dağıt; mola ve duraklamayı çalışma sayma.
- Eski kayıtlarda bilinmeyen başlangıç/duraklama bilgisini kesin veri gibi üretme; uygun gösterim veya açıkça belirtilen tahmin kullan.

Tamamlanma ölçütü: Türkiye gece yarısı, hafta/ay/yıl sınırı ve geceyi aşan seans senaryoları geçer; aynı kapsamlı özetler birbirini tutar.

### 7. Performansı ölçerek iyileştir

Öncelik: P2 — doğru davranışı koruyarak maliyeti azaltmak.

- Önce sayaç çalışırken kök render sayısını, depolama yazmalarını ve açılış paketini ölç.
- Zustand aboneliklerini daralt; sayaç rakamlarının güncellenmesini ilgili bileşenlerle sınırla.
- Her tick'te localStorage yazmayı kaldır; durum geçişleri ve gerektiğinde kontrollü checkpoint kullan. Kurtarma testlerini yeniden çalıştır.
- İstatistik, ayar ve deneme yönetimini ihtiyaç anında yükle; grafik bağımlılıklarının başlangıç paketinden ayrıldığını doğrula.
- Çok kayıtlı kullanımda ortak hesaplama ve liste performansını ölç; ihtiyaç varsa sayfalama ekle.

Tamamlanma ölçütü: Sayaç tick'i kök ekranı yeniden çizdirmez; yazma sıklığı düşer; başlangıç JS miktarı azalır. Önce/sonra değerleri raporlanır; veri kurtarma davranışı korunur.

### 8. Kullanım akışını sadeleştir ve sürümü doğrula

Öncelik: P2 — değişiklikleri tutarlı bir ürün hâline getirmek.

- Mod açıklamaları, kayıt/iptal işlemleri ve senkron durum mesajlarını ortaklaştır.
- Modal/klavye kullanımı, hata ve yüklenme geri bildirimlerini tamamla.
- Kalan kaynak lint hatalarını gider; README ve mimari belgelerini güncelle.
- Web/PWA çevrimdışı kullanım ve güncelleme; Windows mini oynatıcı/kısayollar; Android arka plan/dönüş davranışını erişilebilen ortamlarda doğrula.
- Test edilemeyen platformları ve canlı migration gereksinimlerini açıkça listele.

Tamamlanma ölçütü: Otomatik kontroller geçer; erişilebilen platformlarda temel kullanım senaryoları doğrulanır; sürüm notları ve geri dönüş planı hazırdır.

## Takip

- [x] Kaynak incelemesi ve ilk bulgular
- [x] Uygulama sırasının belirlenmesi
- [x] 1. Doğrulama altyapısı
- [x] 2. Güvenli yedek içe aktarma
- [x] 3. Hesap ve kuyruk sahipliği
- [x] 4. Senkronizasyon ve silme — kod, canlı veritabanı geçişi ve protokol kontrolleri tamam
- [ ] 4. aşama yayın kabulü — kullanıcı Vercel'e yayımlayacak; gerçek iki cihaz kontrolü bekliyor
- [ ] 5. Seans yaşam döngüsü ve kurtarma
- [ ] 6. Tarih ve istatistik doğruluğu
- [ ] 7. Performans
- [ ] 8. Kullanım akışı ve sürüm doğrulama

Sıradaki iş: Supabase SQL araçları oturuma geldiğinde hedef projenin salt okunur preflight kontrolü, yedekleme ve kontrollü canlı geçiş. Hazır dosyalar ve test sonuçları 4. aşama belgesinde kayıtlıdır.
