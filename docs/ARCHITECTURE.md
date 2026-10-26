# zamAn — Güncel mimari

26 Ekim 2026. Bu belge eski Şubat mimari analizinin yerini alır.
Uygulama React 19 / TypeScript / Zustand / idb / Recharts kullanır. Vite,
rolldown-vite üzerinden derler. Web/PWA, Electron ve Capacitor ortak arayüzdür.

## Uygulama ve hesap sınırı

`main.tsx` → `App.tsx` → hesap alanına göre anahtarlanan `AccountApp`.
`dataScope.ts`, sahip kimliği, generation ve AbortSignal taşıyan değişmez kapsamı
üretir. `accountLifecycle.ts` depoları hazırlar; eski kapsamın geciken yanıtları
yeni hesaba uygulanmaz. Hesap geçişi ve hydration tamamlanana kadar sayaç
kontrolleri engellenir.

`accountStorage.ts`, localStorage anahtarlarını; `db.ts`, IndexedDB adını hesaba
göre ayırır. Çıkış depoları silmez. Misafir/eski veri otomatik olarak hesaba
taşınmaz. Taşıma, misafir alanında dışa aktarıp hedef hesapta içe aktararak yapılır.
Sahipsiz eski kuyruk otomatik gönderilmez. Ayrıntı: [3. aşama](ASAMA-3-HESAPLAR.md).

## Sayaç ve kurtarma

`store/timer.ts` beş modu yönetir: `serbest`, `gerisayim`, `ders60mola15`,
`deneme`, `EXAM_SIMULATOR`. Worker mesajı, mutlak zaman ankrajları üzerinden
yenileme tetikler; doğruluk yalnızca tick sayısına bağlı değildir.

Seans kimliği başlangıçta sabittir. Bitişte değişmez seans/puan taslağı oluşur;
not ve analiz dahil yeniden açılışta korunur. `saveFinishedSession.ts` aynı
kimlikle kaydeder; başarısız kaydetme tekrar denenebilir.

`timerPersistence.ts`, yalnızca saat alanları değişiyorsa yazmayı en çok beş
saniyede bir yapar. Durum ve form değişiklikleri hemen yazılır. `syncTimer()`
açık checkpoint'tir; visibility/pagehide ve güncelleme öncesinde çağrılır.
Ani kapanışta son checkpoint sonrası süre kaybolabilir. Kapalı kalınan bilinmeyen
süre normal çalışmaya eklenmez. Sınav simülasyonunda sabit bitiş saati, molada
duvar saati kuralı vardır. Ayrıntı: [5. aşama](ASAMA-5-SEANS-YASAM-DONGUSU.md).

## Yerel veri ve bulut

Yerel `sessions`, `sync-state`, `settings-sync`, `sync-cursors` ve çakışma
depoları hesaplara ayrılmış IndexedDB içindedir. `sync-queue` ayrı ortak
veritabanında sahip anahtarı/indeksleriyle ayrılır. Seans değişikliği ve bekleyen mutation aynı
transaction'da yazılır. Kuyruk yeniden kurulabilir; bağlantı geri geldiğinde
tekrar denenir. Testler gerçek kullanıcı depolarına bağlanmaz.

`cloudSync.ts` hesap API'sini sunar; `sessionSync.ts` veri eşitlemesini yönetir.
`offlineSync.ts` kuyruk, `localSync.ts` yerel sürüm/çakışma uygulaması,
`preferenceSync.ts` tercih protokolüdür. Bulut v3 protokolü ve `work_intervals`
özelliği çalışma öncesi kontrol edilir.

Sunucuda normalize `sessions` ve `user_settings` bulunur. Eski `sync_data`
yazıcısı devre dışıdır; geçiş verisi korunur. İstemci mutation kimliği ve
beklenen sürümü gönderir; sunucu sürüm, değişiklik sırası ve tekrar işleme
kontrolünü yürütür. Silme işareti diğer cihazlara taşınır. Çakışan yerel kopya
ayrı arşivlenir. Değişiklikler 200 kayıtlık sayfalarla alınır; Realtime aboneliği
kullanılmaz. Kullanıcının kendi satırını okuması RLS ile sınırlanır; yazılar
kontrollü RPC üzerinden geçer. Ayrıntı: [4. aşama](ASAMA-4-SENKRONIZASYON.md).

JSON yedek formatı v2'dir. `backupValidation.ts` ve `sync.ts`, yazma öncesi
doğrulama ve atomik seans değişimini yönetir. İçe aktarma hesaptaki bulut
değişikliklerinden bağımsız bir birleştirme işlemi değildir; mevcut yerel
seansları ve ayarları yedekle değiştirir. Ayrıntı: [2. aşama](ASAMA-2-YEDEKLEME.md).

## Tarih, istatistik ve performans

`workIntervals` yeni kayıtlardaki net çalışma aralıklarıdır. `studyStatistics.ts`
yerel gün/saat sınırlarına süre dağıtır; mola ve duraklamayı dışarıda bırakır.
Eski kayıtlarda aralık uydurulmaz, bitiş zamanı kullanılır. Seans sayısı/puan
bitiş gününe aittir. `localCalendarClock.ts` gece yarısı ve saat dilimi
değişimini bildirir. `useStudyStatistics.ts` aynı seans dizisi ve takvim için
hesabı paylaşır. [6. aşama](ASAMA-6-TARIH-ISTATISTIK.md).

Ana ekran Zustand'ın gerekli alanlarına dar abone olur. İstatistikler, Ayarlar
ve Denemelerim dinamik yüklenir; `LazyContent` hata/geri dönüş durumunu sunar.
Deneme listesi sayfa başına 20 karttır. [7. aşama](ASAMA-7-PERFORMANS.md).

## Pencereler ve platformlar

`ModalDialog.tsx` portal üzerinden belge gövdesine açılır. `dialogStack.ts`
yalnızca üstteki pencereyi etkin tutar, arka planı inert yapar ve önceki
kaydırma durumunu geri yükler. Odak pencere içinde tutulur; Escape kapanışı,
işlem sürerken engelleme ve açan kontrole dönüş ortak yönetilir. Kurtarma
kararı açık seçim gerektirir. Sayfa içi mod panelleri modal değildir.
`timerControls.ts` hem web hem Electron kısayollarını sınırlar.

Web: Workbox sürümlü precache + kullanıcının kabul ettiği güncelleme.
Eksik varlıklar HTML'ye yönlendirilmez. `public/app-recovery.js`, ana modül
yüklenemezse bağımsız onarım sunar; kayıt depolarını temizlemez.
[PWA düzeltmesi](PWA-YAYIN-DUZELTMESI.md).

Windows: `electron/main.cjs` paketliyken uzak URL'yi, geliştirmede yerel dist'i
açar. Preload contextBridge IPC sunar. Mini görünüm aynı pencereyi küçültür;
native başlık çubuğu ve renderer korunur. Native değişiklik yeni paket gerektirir.

Android: `CAPACITOR_REMOTE=1` ile uzak URL, diğer durumda paketlenmiş `dist/`
kullanılır. İşletim sistemi arka plan/izin davranışı gerçek cihaz kabulü gerektirir.

Kontroller, yayın ve geri dönüş: [8. aşama](ASAMA-8-KULLANIM-VE-SURUM.md).
