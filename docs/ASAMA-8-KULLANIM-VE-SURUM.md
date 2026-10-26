# 8. aşama — Kullanım akışı ve sürüm doğrulama

26 Ekim 2026. Kod, yerel otomatik kontroller ve belgeler hazır.
Bu aşamanın yeni Vercel yayını ve aşağıdaki gerçek cihaz kabulü bekliyor.
Sürüm numarası değiştirilmedi; yayın kullanıcı tarafından yapılır.

## Düzeltilen davranışlar

- Ayarlar (paketi yüklenirken ve yükleme hatasında da), Ünvanlar, seans
  ayrıntıları, deneme silme ve kurtarma pencereleri ortak modal kullanır.
  Odak içeri geçer, Tab/Shift+Tab arka plana kaçmaz; arka plan inert ve
  kaydırma kilitlidir. Kapanış, açan kontrol hâlâ mevcutsa odağı geri verir.
  İç içe pencerelerde yalnızca üstteki etkindir. Önceden inert olan alanlar
  ve kaydırma stili kapanışta korunur.
- Escape, yazı alanından da Ayarlar/Ünvanlar/ayrıntı/silme onayını kapatır.
  Silme sürerken kapanış engellenir. Kurtarma ekranı, bitir/devam/sil seçimi
  gerektirdiği için Escape veya arka plan tıklamasıyla kapanmaz.
- Modal açıkken web ve Electron sayaç kısayolları engellenir. Düğme, seçici,
  bağlantı, kart veya yazı alanı odaktayken web Space/R/mod kısayolu bu
  kontrolün işlevini bozmaz. Seans kartı hem Enter hem Space ile açılır.
- Mobil özet panelinin kapalı içeriği inert'tir; görünmeyen kontrollere
  Tab ile gidilmez. Escape ile küçültmede odak tutma düğmesine döner.
  Bu panel arka planı tümüyle kilitleyen modal olarak tanımlanmaz.
- Deneme silme tamamlanana kadar onay açık kalır, çift istek engellenir.
  Store hatayı çağırana iletir; hata ekranda gösterilir ve tekrar denenebilir.
  Düzenlemede girilen analiz kaybolmaz. Negatif, kesirli veya 999 üzeri
  analiz sayıları kaydedilmez; sınır bitiş ekranıyla aynıdır.
- Hesaba giriş yapılmışken de eşitleme/çıkış hataları görünür. Gönder/Çek/
  Eşitle için beklenmeyen hatalar yakalanır ve düğmeler yeniden açılır.
  Çift tıklama aynı manuel isteği ikinci kez başlatmaz. Sayaç/seans
  dışındaki değişiklikler kesin olarak doğrulanmadığı için “tüm veriler
  eşitlendi” iddiası kaldırıldı; özet listelenen seanslarla sınırlıdır.
- Ayar anahtarları ad ve açık/kapalı durumunu bildirir. Tema ve mod
  düğmeleri seçim durumunu sunar; klavye odağı görünürdür. Bildirim desteği/
  izin hatası panel içinde açıklanır. Kaydı atan “İptal” işlemi
  “Kaydetmeden Sil” olarak açık adlandırılır.
- Toast yaşam döngüsündeki effect/state lint hatası giderildi; mesaj
  değişiminde ve unmount'ta eski zamanlayıcılar temizlenir. Bildirim
  kodundaki üç `@ts-ignore` kaldırıldı; bağımsız ses context'leri ses
  bitince kapatılır. Genel ESLint artık hatasızdır.
- PWA güncellemesi öncesinde sayaç checkpoint'i alınır. Güncelleme hatası
  görünürdür ve yeniden denenebilir; aynı anda ikinci istek engellenir.

## Windows mini oynatıcı düzeltmesi

Önceki `toggleMiniPlayer`, mevcut pencereyi `destroy()` edip tekrar
oluşturuyordu. Bu sayfayı yeniden yükler, çalışan sayaçta kurtarma
gerektirir ve en son checkpoint sonrası süreyi kaybettirebilirdi.
Yeni akış aynı pencerenin minimum boyutunu/boyutunu değiştirir; normal
konum, boyut, büyütme ve üstte tutma tercihini geri getirir.

Windows'un native başlık çubuğu mini görünümde de kalır. `main.cjs`
değişikliği Vercel ile mevcut EXE'ye taşınmaz; yeni Windows paketi
üretilip kurulmalıdır. Bu aşamada EXE/APK paketi üretilmedi.

Gerçek `main.cjs`, kontrollü Electron API'siyle VM testinde çalıştırıldı:
önce pencerenin yok edilmesi ve büyütme durumunun kaybı iki testte
gösterildi; düzeltmeden sonra aynı testler geçti. Bu gerçek Windows
pencere yöneticisi testi değildir. Kullanılan boyut/sınır API'leri hem
kurulu Electron 33 tiplerinde hem [Electron belgelerinde](https://www.electronjs.org/docs/latest/api/browser-window)
doğrulandı.

## Yerel doğrulama

- Son tam paket çalıştırmasında **322 test / 34 dosya** başarılı.
  Bu aşamada 19 test eklendi. Ağ ve gerçek Supabase SDK'sı testlerde engellidir.
- `npm.cmd run lint`, `npm.cmd run typecheck`, Electron main/preload
  sözdizimi kontrolleri başarılı.
- `build:win`, `build:android` ve web/PWA `measure:bundle` başarılı.
  Bunlar arayüz derlemeleridir; native EXE/APK çalışma kabulü değildir.
- Başlangıç statik JS: **518.729 bayt / 148.714 bayt gzip**; üç ekran
  başlangıç zinciri dışında kaldı. 7. aşama sonrası PWA düzeltmesindeki
  516.062 / 147.698 bayta göre artış 2.667 / 1.016 bayt.
- Beş modda 120 tick / 60 saniye ölçümü hâlâ 0 ana ekran render'ı,
  120 sayaç render'ı, 12 depolama yazmasıdır. Paketlenmiş PWA precache
  25 dosya / 950,94 KiB'dir.
- Derlemedeki eski Browserslist verisi ve karışık statik/dinamik import
  uyarıları sürer. jsdom grafik boyutu uyarıları fiziksel yerleşim testi
  değildir; gizlenmedi.

```powershell
npm.cmd run test:ui
npm.cmd test -- --maxWorkers=2
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build:win
npm.cmd run build:android
npm.cmd run measure:bundle
```

## Yayın ve kabul sırası

1. Mevcut kayıtları Ayarlar → Dışa aktar ile yedekle. Bu aşama ek SQL
   geçişi gerektirmez; canlı veritabanında bu çalışma sırasında işlem yapılmadı.
2. Hazır kodu Vercel'e yayımla. Yayın sonrası Ayarlar'da **Hesap ve
   eşitleme**, **Şimdi eşitle**, bitiş ekranında **Kaydetmeden Sil**
   ifadelerini kontrol ederek yeni arayüzün açıldığını doğrula.
3. Ayarları klavyeyle aç; Tab/Shift+Tab panel içinde kalmalı. Bir yazı
   alanındayken Escape kapatmalı ve odak Ayarlar düğmesine dönmeli.
   Ünvanlar/seans ayrıntısını aynı şekilde dene. Açık pencerede sayaç
   kısayolları sayacı değiştirmemeli. Kurtarmada açık karar istenmeli.
4. Denemelerim'de yalnızca bir test kaydı üzerinde düzenle, iptal et,
   sonra yeniden düzenleyip kaydet. Negatif/kesirli değer reddedilmeli.
   Sil onayında İptal/Escape kaydı korumalı; onayla silme tamamlanmalı.
5. Hesapta bağlantıyı kesip **Şimdi eşitle** de: başarısızsa hata görünmeli,
   düğme tekrar kullanılmalı. Bağlantıyı açıp yeniden eşitle. Korunan
   değişiklik varsa ilgili panelden çöz; bekleyen seans sayısının sıfır
   olması tek başına bütün cihazların eşit olduğunu kanıtlamaz.
6. PWA'yı çevrimiçi aç, ilk service worker kurulmasını/güncellemeyi tamamla.
   Çevrimdışı yeniden aç; sayaç, istatistik ve deneme ekranları açılmalı.
   Misafir test seansı kaydet; çevrimiçine dönünce kayıt korunmalı.
   Kurulumda önbelleğe alınmamış ilk ziyaretin çevrimdışı açılması beklenmez.
7. Yeni PWA güncellemesini çalışan ve duraklatılmış test seansında uygula;
   kurtarma ve bitiş taslağı korunmalı. Ana paket yüklenemezse onarım
   düğmesini deneyebilirsin. Kayıtları silen “tüm site verilerini temizle”
   işlemi bu kabulün parçası değildir.
8. **Windows kullanılıyorsa:** yeni paketle normal → mini → normal geçişi
   çalışan/duraklatılmış sayaçta ve açık bitiş taslağında dene; sayfa
   yeniden yüklenmemeli, süre/not korunmalı. Ctrl+Shift+Space/R ve
   pencereler açıkken engeller; Ctrl+Shift+M; tepsiye gizle/göster;
   büyütülmüş pencere ve üstte tut tercihi kontrol edilmeli.
9. **Android kullanılıyorsa:** gerçek cihazda çalışırken/duraklatılmışken
   arka plana al, ekranı kilitle ve geri dön. Normal modlarda bilinmeyen
   kapalı süre çalışma sayılmamalı; Sınav Saati bitiş kuralı korunmalı.
   Bildirim/ses/titreşim hem izinli hem izinsiz durumda kontrol edilmeli.
10. İki fiziksel cihazda aynı test hesabını aç: A'da test seansı ekle,
    eşitle, B'de al. B çevrimdışıyken A'da bu test kaydını sil/eşitle;
    B'yi yeniden bağlayıp eşitle. Silinen kayıt geri gelmemeli.
    İki cihazda aynı analiz farklı düzenlenirse çakışma arşivi görülmeli.
    Üretim kayıtları yerine yalnızca test kaydı kullan.

Bu aşamada TinyFish kullanılmadı. Önceki TinyFish incelemesi eski yayındaki
misafir açılışı ve temel sayaç/gezinme içindi; yeni modal davranışı,
telefon yerleşimi, hesap, PWA yaşam döngüsü veya fiziksel cihaz kabulünün
yerini almaz. Fiziksel tarayıcı/Windows/Android kabulü bu oturumda yapılmadı.

## Geri dönüş

- Frontend için v3 protokolü ve `work_intervals` desteği olan önceki
  başarılı Vercel dağıtımına dön. Eşitleme öncesi eski istemcileri tekrar
  desteklemek için RPC/RLS yetkilerini gevşetme.
- Bu aşama depolama veya yedek formatını değiştirmez; geri dönüş için
  veritabanını düşürmek ya da kayıtları temizlemek gerekmez.
- Eski SW yeni dağıtıma takılırsa [PWA onarım yönergesini](PWA-YAYIN-DUZELTMESI.md)
  izle; kullanıcı kayıtlarının tutulduğu IndexedDB'yi topluca silme.
- Yeni Windows paketinde sorun olursa önceki kurulum paketine dönülebilir;
  bu, eski mini geçişi sorununun da geri geleceği anlamına gelir.
- Android yerel içerikli APK kullanıyorsa frontend geri dönüşü yeni APK
  veya önceki paket gerektirir; uzak URL kullanıyorsa Vercel dağıtımı geçerlidir.

8. aşama gerçek kabul sonuçları geldikten sonra tamamen kapatılabilir.
