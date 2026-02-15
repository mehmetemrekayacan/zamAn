# zamAn

İlköğretim matematik öğretmenliği sınavına hazırlık için **deneme ve çalışma süre takip** uygulaması. Kronometre, zamanlayıcı, Pomodoro (60 dk ders / 15 dk mola) ve deneme sınavı modları. PWA + offline-first.

**Web, Windows masaüstü (.exe) ve Android (APK)** olarak kullanılabilir; indirilebilir uygulama üretilebilir.

---

## Özellikler

- **Modlar:** Deneme sınavı (AGS 110 dk / ÖABT 90 dk), 60 dk ders / 15 dk mola, geri sayım, serbest kronometre
- **Seans takibi:** Süre, puan, ruh hali, not; IndexedDB ile kalıcı kayıt
- **Ünvanlar ve motivasyon:** Puana göre ünvan, ileride açılacak hedefler
- **İstatistikler:** Bugün / hafta / ay, seri gün, 5+ saatlik gün, günlük çalışma grafiği, rozetler
- **Ayarlar:** Tema, ses, titreşim, isim, sınav tarihi, vurgu rengi, klavye kısayolları
- **Senkron:** Dosyadan dışa/içe aktar; isteğe bağlı **online senkron** (Supabase ile isim/e-posta + şifreyle kayıt, buluta kaydet / buluttan çek)
- **Responsive:** Masaüstü ve mobil uyumlu, dokunmatik dostu (min 44px hedefler)

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

> **Not (Windows):** “invalid icon file” hatası NSIS’in PNG kabul etmemesinden kaynaklanıyordu; kurulum/kaldırma ikonu kapatıldı, build tamamlanır. “Cannot create symbolic link” / winCodeSign hatası çıkarsa cache temizle: `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue` sonra `npm run win` tekrar dene.

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
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

Dağıtım için imzalı APK almak istersen:

1. `android/app/build.gradle` içinde `signingConfigs` tanımla (keystore ile).
2. `buildTypes.release.signingConfig` ile bu config’i kullan.
3. Tekrar `npm run apk:build` çalıştır.

Ayrıntı için [Android: Uygulamanızı imzalama](https://developer.android.com/studio/publish/app-signing) dokümantasyonuna bak.

### 3. Web (PWA)

Canlı site ve PWA:

```bash
npm run build
```

Çıktı `dist/` içinde. Bu klasörü Vercel, Netlify veya herhangi bir statik host’a atabilirsin. Tarayıcıda “Uygulamayı yükle” ile masaüstü/mobil PWA olarak kullanılır.

### 4. Online senkron (Hesap — isim / e-posta + şifre)

Windows ve telefonda aynı verileri tutmak için **Supabase** ile kayıt/giriş kullanılır. Ayarlar'da "Hesap (online senkron)" bölümü **sadece** `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` tanımlıysa görünür.

1. [Supabase](https://supabase.com/dashboard) üzerinde yeni proje oluştur.
2. **Settings → API**'den **Project URL** ve **anon (public) key**'i kopyala.
3. Proje kökünde `.env.local` dosyası oluştur (`VITE_SUPABASE_URL=...`, `VITE_SUPABASE_ANON_KEY=...`).
4. Supabase **SQL Editor**'da `supabase-sync.sql` dosyasının içeriğini çalıştır (tablo + RLS).
5. `npm run dev` veya `npm run build` ile uygulamayı çalıştır; Ayarlar'da "Hesap" bölümü çıkar.
6. **Kayıt ol:** İsim, e-posta, şifre → **Giriş yap:** e-posta, şifre. Girişten sonra **Buluta kaydet** / **Buluttan çek** ile verileri senkron edebilirsin.

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
| `npm run apk:build` | Android release APK (`android/.../release/`) |
| `npm run android`   | Android’de uygulamayı çalıştır / aç       |
| `npm run preview`   | `dist/` için önizleme sunucusu            |

---

## Otomatik güncelleme (remote mod)

Uygulama **remote URL** modunda çalışır. `git push` ile Vercel'e deploy yapınca tüm kullanıcılar (Windows, Android, PWA) **anında** güncelleme alır — yeni EXE/APK göndermene gerek yok.

- `app-config.cjs` → `APP_URL` değişkenine Vercel URL'ini yaz
- İlk dağıtım: `npm run win` (Windows) / `npm run apk:release` (Android)
- Sonraki güncellemeler: `git push` → Vercel otomatik deploy → kullanıcılar bir sonraki açışta güncel sürümü alır

---

## Test

```bash
npm run test          # Tüm birim testleri (scoring, time, rozetler, tahmin)
npm run test:unit     # Vitest unit testleri
npm run test:rozetler # Sadece rozet hesaplaması
npm run lint          # ESLint
```

---

## Supabase kurulum (online senkron)

1. [supabase.com](https://supabase.com) → New Project oluştur
2. Settings → API → **Project URL** ve **anon key** kopyala
3. `.env.local` dosyası oluştur:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. SQL Editor'da `supabase-sync.sql` içeriğini çalıştır
5. Ayarlar'da "Hesap (online senkron)" bölümü görünür

---

## Lisans

Proje private; kullanım ve dağıtım sahibine aittir.
