# zamAn

Sınava hazırlık için **deneme ve çalışma süre takip** uygulaması. Kronometre, zamanlayıcı, 60/15 ders/mola, bölümlü deneme ve sabit bitiş saatli sınav simülasyonu olmak üzere beş mod. Web/PWA, Windows (Electron) ve Android (Capacitor) arayüzü ortak React kodunu kullanır.

**Web, Windows masaüstü (.exe) ve Android (APK)** olarak kullanılabilir; indirilebilir uygulama üretilebilir.

---

## Özellikler

- **Modlar:** Bölümlü deneme, Sınav Saati simülasyonu, 60 dk ders / 15 dk mola, geri sayım, serbest kronometre
- **Seans takibi:** Süre, puan, ruh hali, not; IndexedDB ile kalıcı kayıt
- **Ünvanlar ve motivasyon:** Puana göre ünvan, ileride açılacak hedefler
- **İstatistikler:** Bugün / hafta / ay, seri gün, 5+ saatlik gün, günlük çalışma grafiği, rozetler
- **Ayarlar:** Tema, ses, titreşim, isim, sınav tarihi, vurgu rengi, klavye kısayolları
- **Senkron:** Hesaplara ayrılmış yerel depolar; sürümlü değişiklik kuyruğu, silme bilgisi ve korunan çakışmalar. JSON yedek aktarımı ayrı bir işlemdir.
- **Kurtarma:** Kaydedilmemiş bitiş taslağı, not ve analiz yenilemede korunur; normal seanslarda kapalı kalınan bilinmeyen süre çalışmaya eklenmez.
- **İstatistik:** Yeni kayıtların net çalışma aralıkları yerel gün ve saatlere dağıtılır. Aralığı bilinmeyen eski kayıtlar bitiş zamanına yazılır.
- **Klavye:** Pencerelerde odak sınırı ve geri dönüş; sayfa kontrolleri üzerinde Space sayaç kısayolunu çalıştırmaz.

---

## Kurulum

```bash
git clone https://github.com/mehmetemrekayacan/zamAn.git
cd zamAn
npm install
```

---

## Geliştirme

```bash
npm run dev
```

Tarayıcıda `http://localhost:5173` açılır.

---

## İndirilebilir uygulamalar

### 1. Windows (.exe)

Kurulabilir Windows uygulaması üretmek için:

```bash
npm run win
```

Çıktılar `release/` klasöründe:

- `release/zamAn Setup x.x.x.exe` — kurulum sihirbazı (önerilen)
- Kurulumda masaüstü kısayolu oluşturulur, kurulum dizini seçilebilir.

Sadece paketlenmiş dosyaları (kurulum olmadan) üretmek için:

```bash
npm run win:dir
```

Mini oynatıcı aynı pencereyi küçültür; sayaç ve açık taslak yeniden yüklenmez. Windows başlık çubuğu korunur. `electron/` dosyaları değiştiğinde yeni Windows paketi gerekir.

### 2. Android (APK)

Telefonda kurulacak APK üretmek için:

**İkon (isteğe bağlı):** `public/icon-512x512.png` dosyasını Android launcher ikonu yapmak için önce:
```bash
npm run icons
```
çalıştır; ardından `npm run apk:build` yap. İkon üretimi `@capacitor/assets` ile yapılır (Android + PWA).

**Gereksinim:**

- **JDK** (Java) kurulu olmalı ve **JAVA_HOME** ortam değişkeni tanımlı olmalı.
- [Android Studio](https://developer.android.com/studio) kurarsan içindeki JDK’yı kullanabilirsin (örn. `C:\Program Files\Android\Android Studio\jbr`).
- Alternatif: [Eclipse Temurin (Adoptium)](https://adoptium.net/) indir, kur, ardından kurulum yolunu JAVA_HOME yap.

**Ortam değişkenleri (PowerShell, o oturum için):**

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run apk:build
```

- **JAVA_HOME:** JDK kurulum yolu (Android Studio ile gelir: `…\Android Studio\jbr`).
- **ANDROID_HOME:** Android SDK yolu (Android Studio ile genelde `%LOCALAPPDATA%\Android\Sdk`).  
  Tanımlı değilse script, `%LOCALAPPDATA%\Android\Sdk` varsa onu kullanır ve `android/local.properties` içine `sdk.dir` yazar.

Kalıcı yapmak için: Windows → Ayarlar → Sistem → Hakkında → Gelişmiş sistem ayarları → Ortam değişkenleri → JAVA_HOME ve ANDROID_HOME ekle.

```bash
npm run apk:build
```

APK dosyası şurada oluşur:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

`apk:build` ve `apk:debug` yerel içerikli debug APK üretir. Remote URL kullanan release için `npm run apk:release` kullanılır; dağıtım imzası ayrıca hazırlanmalıdır:

1. `android/app/build.gradle` içinde `signingConfigs` tanımla (keystore ile).
2. `buildTypes.release.signingConfig` ile bu config’i kullan.
3. `npm run apk:release` çalıştır; `android/app/build/outputs/apk/release/` çıktısını kontrol et.

Ayrıntı için [Android: Uygulamanızı imzalama](https://developer.android.com/studio/publish/app-signing) dokümantasyonuna bak.

### 3. Web (PWA)

Canlı site ve PWA:

```bash
npm run build
```

Çıktı `dist/` içinde. Bu klasörü Vercel, Netlify veya herhangi bir statik host’a atabilirsin. Tarayıcıda “Uygulamayı yükle” ile masaüstü/mobil PWA olarak kullanılır.

### 4. Online senkron (Hesap — isim / e-posta + şifre)

Windows ve telefonda aynı verileri tutmak için **Supabase** ile kayıt/giriş kullanılır. Ayarlar'da "Hesap ve eşitleme" bölümü **sadece** `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` tanımlıysa görünür.

1. [Supabase](https://supabase.com/dashboard) üzerinde yeni proje oluştur.
2. **Settings → API**'den **Project URL** ve **anon (public) key**'i kopyala.
3. Proje kökünde `.env.local` dosyası oluştur (`VITE_SUPABASE_URL=...`, `VITE_SUPABASE_ANON_KEY=...`).
4. Yeni kurulumda sırasıyla `database/supabase-v2-sessions.sql`, `database/supabase-v3-sync.sql` ve `supabase/migrations/20261026150258_session_work_intervals.sql` uygulanır. Mevcut canlı projede bu geçişler tamamlandı. Mevcut projelerde yedek ve şema kontrolü dahil [geçiş sırasını](docs/ASAMA-4-SENKRONIZASYON.md) izle.
5. `npm run dev` veya `npm run build` ile uygulamayı çalıştır; Ayarlar'da "Hesap" bölümü çıkar.
6. **Kayıt ol:** İsim, e-posta, şifre → **Giriş yap:** e-posta, şifre. Ayarlar → **Hesap ve eşitleme** bölümündeki **Şimdi eşitle** iki yönlü çalışır. **Gönder** ve **Çek** tek yönlü işlemlerdir; bekleyen değişiklikler bağlantı geldiğinde de işlenir.

Örnek env için `.env.example` dosyasına bak.

---

## Proje yapısı (kısa)

| Klasör / dosya       | Açıklama                          |
|---------------------|------------------------------------|
| `src/`              | React uygulama kodu                |
| `src/store/`         | Zustand (timer, seanslar, ayarlar) |
| `src/lib/`           | DB, puanlama, selam, rozetler vb.  |
| `electron/`         | Windows masaüstü (Electron)        |
| `android/`           | Capacitor Android projesi          |
| `public/`            | İkonlar, manifest                  |
| `vercel.json`       | Vercel deploy ayarları             |

---

## Komut özeti

| Komut            | Açıklama                                  |
|------------------|--------------------------------------------|
| `npm run dev`    | Geliştirme sunucusu                        |
| `npm run build`  | Web build (`dist/`)                        |
| `npm run win`    | Windows kurulum .exe’si (`release/`)       |
| `npm run apk:build` | Yerel içerikli debug APK (`android/.../debug/`) |
| `npm run apk:release` | Uzak URL kullanan release APK (`android/.../release/`) |
| `npm run android`   | Android’de uygulamayı çalıştır / aç       |
| `npm run preview`   | `dist/` için önizleme sunucusu            |

---

## Otomatik güncelleme (remote mod)

Paketlenmiş Electron uygulaması `app-config.cjs` içindeki URL'yi açar. Android yalnızca `CAPACITOR_REMOTE=1` ile eşitlenmiş/paketlenmişse uzak URL'yi kullanır; varsayılan debug APK yerel `dist/` içeriğini taşır.

- `app-config.cjs` → `APP_URL` değişkenine Vercel URL'ini yaz
- İlk dağıtım: `npm run win` (Windows) / `npm run apk:release` (Android)
- Uzak arayüz güncellemesi: Vercel'e başarılı yayın → tarayıcı/PWA'da güncelleme bildirimi kabulü veya sonraki yükleme. Açık ekran kendi başına hemen yeni kodu çalıştırmaz; eski service worker yeni sürümü bekletebilir.
- `electron/`, preload, Android native kodu veya native bağımlılık değişikliği yeni EXE/APK gerektirir. Vercel yayını native dosyaları değiştirmez.
- Yayın, kabul ve geri dönüş: [8. aşama kontrol listesi](docs/ASAMA-8-KULLANIM-VE-SURUM.md).

---

## Test

```bash
npm test              # Tüm Vitest testleri (birim + veri katmanı)
npm run test:unit     # npm test ile aynı; mevcut kullanım için korunur
npm run test:unit:watch # Geliştirme sırasında izleme modu
npm run test:data     # IndexedDB, yedek, kuyruk ve test izolasyonu
npm run test:sync     # Yerel PostgreSQL motorunda migration ve cihaz senaryoları
npm run test:rozetler # Sadece rozet hesaplaması
npm run test:ui      # Pencere, işlem geri bildirimi ve Electron pencere geçişi
npm run test:performance # Sayaç render/yazma ve liste ölçümleri
npm run typecheck    # Uygulama, test yardımcıları ve test ayarları
npm run lint         # ESLint (üretilmiş dosyalar hariç)
```

Testlerde `.env.local` yüklenmez; IndexedDB ve tarayıcı depoları bellekte çalışır.
Gerçek Supabase istemcisi ve `fetch` istekleri engellenir; bulut yanıtları test
içinde tanımlanır. Windows PowerShell script politikası `npm` çağrısını engellerse
aynı komutları `npm.cmd` ile çalıştırabilirsin.

Test yazımı, kapsam, kalan senaryolar ve başlangıç ölçümleri için
[test altyapısı belgesine](docs/TEST-ALTYAPISI.md) bak.

Yedek içe aktarımı dosya ve iç ayarları yüklemeden önce doğrular; desteklenmeyen
sürüm veya bozuk kayıtta mevcut veriye dokunmaz. Seanslar tek IndexedDB işlemiyle
değiştirilir. Bekleyen bulut işlemleri varsa önce senkronizasyon tamamlanmalıdır.
Ayrıntılar: [güvenli yedekleme](docs/ASAMA-2-YEDEKLEME.md).

Hesapların yerel kayıtları, ayarları ve bekleyen işlemleri ayrıdır; çıkış bunları
silmez. Eski ve misafir verileri otomatik olarak giriş yapılan hesaba taşınmaz.
Taşımak için misafir alanında dışa aktar, hedef hesaba giriş yaptıktan sonra
içe aktar. Sahibi belirlenemeyen eski kuyruk işlemleri misafir alanından ham
arşiv olarak indirilebilir. Ayrıntılar: [hesap ve kuyruk ayrımı](docs/ASAMA-3-HESAPLAR.md).

Kaydedilmemiş bitişler, not ve analizleriyle yenilemede korunur. Kayıt hatasında
aynı seans kimliğiyle yeniden denenir; deneme kayıtları aktif bölümün planını
kullanır. Yeniden açılışta çalışma, sınav ve mola için uygulanan süre kuralları:
[seans yaşam döngüsü ve kurtarma](docs/ASAMA-5-SEANS-YASAM-DONGUSU.md).

---

## Senkron protokolü ve güncel mimari

Kurulum yukarıdaki **Online senkron** bölümündedir. Güncel veri ve uygulama akışı:
[Mimari](docs/ARCHITECTURE.md). Tarih ve çalışma aralıkları:
[6. aşama](docs/ASAMA-6-TARIH-ISTATISTIK.md). Ölçümler:
[7. aşama](docs/ASAMA-7-PERFORMANS.md).

Yeni istemci sürümlü v3 RPC protokolünü gerektirir. Protokol eksikse bulut yazısı
başlatılmaz; yerel kayıtlar saklanır ve güncelleme gereksinimi bildirilir.
Çalışma aralığı desteği `work_intervals` özellik bayrağıyla doğrulanır.
Eski `scripts/supabase-upload-sync.cjs` yazıcısı devre dışıdır; yedekleri
uygulamadaki içe aktarma akışıyla yükle.

---

## Lisans

Proje private; kullanım ve dağıtım sahibine aittir.
