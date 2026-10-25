# 2. aşama — Güvenli yedek içe aktarma

24 Ekim 2026. Yerel uygulama değişikliği tamamlandı; canlı hesaba veya Supabase şemasına işlem yapılmadı.

## Yeni davranış

- Dosya tamamen doğrulanmadan seans, ayar veya kuyruk verisi değiştirilmez. Doğrudan `applyPayload` çağrıları da aynı doğrulamadan geçer.
- Yalnızca sürüm 1 kabul edilir. Seans listesi, kimlikler, modlar, zorunlu alanlar, gerçek takvim tarihleri, süre/puan değerleri ve deneme analizi kontrol edilir. Tekrarlanan kimlikler reddedilir.
- Sayaç ve ayarların iç JSON'u, Zustand sürümü, mod yapılandırması, deneme bölümleri, tema ve kısayollar kontrol edilir. Store aksiyonlarını veriyle ezebilecek alanlar reddedilir.
- Seans silme ve tüm yeni kayıtları yazma tek IndexedDB transaction'ındadır. Yazma veya commit hatasında eski seanslar korunur; yarım liste kalmaz.
- Ayar/sayaç değişiklikleri, commit öncesinde senkron olarak uygulanır. Yakalanan hata durumunda değişmiş anahtarlar eski değerlerine döndürülür.
- Başarı yalnızca transaction tamamlandıktan sonra döner. Ayarları geri alma sırasında da erişim hatası oluşursa bu durum açık bir hata olarak döner; başarılı yükleme gösterilmez.
- Geçerli yedekteki zaman damgaları aynen korunur. Geri yükleme normal seans kaydetme fonksiyonunu kullanmaz ve kendisi bulut kuyruğuna işlem eklemez.
- Yedekte null olan veya bulunmayan sayaç/deneme/ayar snapshot'ları eski yerel anahtarları temizler. Başka seansa ait eski 60/15 duraklama kaydı da kaldırılır. Böylece eski sayaç bilgisi yeni yedeğe karışmaz.
- Bekleyen veya başarısız kuyruk girdisi varken içe aktarma reddedilir; mevcut kuyruk silinmez. Gönderim sürüyorsa tamamlandıktan sonra yeniden deneme istenir.
- Aynı sekmede kuyruk ekleme, ilk kuyruk okuması ve içe aktarma sınırı sıraya alınır. Ağ beklenirken yeni işlemlerin kalıcılaşması engellenmez.
- Ayarlar ekranında içe aktarmanın yerel seans ve ayarları değiştirdiği açıklanır.

## Doğrulama

Önce 21 senaryo eski kodda başarısız olarak veri kaybını/yanlış kabulü gösterdi.
Ardından kapsam 33 yedek testine çıkarıldı:

- Bozuk liste, sürüm, tarih, zorunlu alan, sayı, mod, kimlik ve iç snapshot'lar.
- İkinci seansın yazılmasında hata, ayar yazma hatası ve transaction iptali.
- Ayar deposunun okunamaması ve geri alma sırasında erişimin de başarısız olması.
- Bekleyen kuyruk ve aynı anda kuyruğa alınan işlem.
- Ağ yanıtı gecikirken yeni kuyruk işleminin kalıcılaşması ve içe aktarmanın durdurulması.
- Beş mod için uygulamanın gerçekten ürettiği yedeğin geri yüklenmesi.
- Boş yedek, deneme analizi/metadatası ve zaman damgalarının korunması.

| Kontrol | Sonuç |
| --- | --- |
| Tüm testler | 9 dosya, 117 test geçti |
| Karıştırılmış sıra | 117 geçti; seed `24102026` |
| TypeScript | Başarılı |
| Değişen veri/test dosyalarında lint | Temiz |
| Genel lint | 16 mevcut kaynak hatası, 0 uyarı; önceki 17 hatadan `sync.ts` hatası giderildi |
| Üretim derlemesi | Başarılı |
| Ana JS | 675,17 kB; gzip 186,08 kB |
| CSS | 33,88 kB; gzip 7,33 kB |

`SettingsModal.tsx` içindeki iki mevcut `any` hatası sürüyor; eklenen açıklama yeni lint hatası üretmedi.

## Kapsam sınırları

- IndexedDB transaction'ı seanslar için atomiktir. IndexedDB ile localStorage ortak bir transaction paylaşmaz; ayarlar için geri alma yakalanan hatalar kapsamında uygulanır. Tarayıcı işleminin aniden kapanması veya depolamanın geri alma sırasında da erişilemez olması için tüm depoları kapsayan dayanıklı bir işlem günlüğü bu aşamada eklenmedi.
- Kuyruk koruması aynı sekmedeki işlemleri kapsar. Birden fazla sekme/cihaz, doğrudan bulut push/pull işlemleri ve hesap sahipliği için uçtan uca eşitleme güvencesi sonraki 3–4. aşamalardadır.
- İçe aktarmanın kendisi bulut yazısı üretmez; başarılı yükleme sonrası sayfa yenilendiğinde uygulamanın normal hesap/eşitleme akışı çalışmaya devam eder. Bu işlem buluttaki bütün kayıtları silip yedekle değiştirme işlemi değildir.
- Testler bellekte IndexedDB ve kontrollü bulut yanıtları kullanır. Gerçek cihaz/depolama ve canlı hesap testi yapılmadı.

Sıradaki iş: 3. aşama — yerel kayıt ve kuyruk sahipliğini hesaplara göre ayırmak.
