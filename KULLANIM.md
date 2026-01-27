# Zaman Ölçer – Windows & Android Kullanım Kılavuzu

Sevgiline hem bilgisayardan hem telefondan kullandırabilmen için iki yol var:

---

## 1. Windows’ta kullanım

### A) Tarayıcı + PWA (en pratik)

1. **Uygulamayı internete koy (bir kere yapılır)**  
   Projeyi Vercel / Netlify / GitHub Pages gibi bir yere deploy et. Örnek:
   - **Vercel:** https://vercel.com → GitHub repo’yu bağla → Deploy.
   - **Netlify:** https://netlify.com → “Import from Git” → repo’yu seç → Deploy.

2. **Bilgisayarında kullanım**
   - Deploy sonrası verilen linki (örn. `https://zaman-olcer.vercel.app`) aç.
   - Chrome/Edge’de adres çubuğundaki “Uygulama olarak yükle” / “Install” ikonuna tıkla.
   - Böylece masaüstünden veya Başlat menüsünden “Zaman Ölçer” gibi kısayolla açılır, tam ekran uygulama gibi davranır.

### B) Sadece tarayıcı

Aynı linki Chrome/Edge’de açıp normal sekme gibi kullanabilir. PWA yüklemeden de çalışır.

---

## 2. Android telefonda kullanım (APK)

Play Store yok; tek kullanıcı için APK üretip telefonuna yükleyeceksin.

### Gereksinimler (sadece APK üretirken)

- **Node.js** (zaten var)
- **Android Studio** (APK üretmek için): https://developer.android.com/studio  
  İlk açılışta “Standard” kurulumu seç; SDK’yı otomatik indirir.

### APK üretme adımları

1. **Proje dizininde:**

   ```bash
   npm run build:android
   npx cap sync
   ```

2. **Android Studio’da:**
   - `npx cap open android` ile Android projesini aç **veya**
   - Android Studio → “Open” → proje klasöründeki `android` klasörünü seç.

3. **APK oluştur:**

   **Yol 1 – Android Studio:**  
   Menü: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

   **Yol 2 – Komut satırı (Android Studio kurulu ve SDK ayarlıysa):**
   ```bash
   cd android
   .\gradlew.bat assembleDebug
   ```
   APK şurada oluşur: `android\app\build\outputs\apk\debug\app-debug.apk`

4. **APK’yı telefona verme:**
   - `app-debug.apk` dosyasını WhatsApp / Telegram / Google Drive ile gönder veya
   - Telefonu USB ile bağlayıp bilgisayara kopyala.

5. **Telefonda yükleme:**
   - Dosyayı aç (Dosya yöneticisi / “İndirilenler” vb.).
   - “Bilinmeyen kaynaklardan yükleme” izni istenirse aç (Ayarlar → Güvenlik).
   - Kurulumu tamamla; uygulama “Zaman Ölçer” adıyla çıkar.

Bu APK sadece senin (veya sevgilinin) kullanacağı tek cihaz için; Play Store’a çıkmana gerek yok.

---

## Komut özeti

| Ne yapıyorsun?          | Komut                     |
|-------------------------|---------------------------|
| Web için build          | `npm run build`           |
| Android için build      | `npm run build:android`   |
| Android’e build kopyala | `npx cap sync`            |
| Android Studio’yu aç    | `npx cap open android`    |
| Hepsini sırayla         | `npm run android`         |

---

## Kısa özet

- **Windows:** Uygulamayı Vercel/Netlify’a deploy et → linki gönder → tarayıcıda aç, istenirse “Uygulama olarak yükle” ile masaüstü uygulaması gibi kullan.
- **Android:** `npm run build:android` → `npx cap sync` → Android Studio’da “Build APK” → `app-debug.apk`’yı telefona atıp yükle.

Bu ayarlarla hem Windows hem Android’de kullanılabilir.
