# zamAn — Deploy ve Güncelleme Adımları

## Adım 1: Vercel'e Deploy (İlk Kez veya Güncelleme)

### Seçenek A: GitHub ile (Önerilen)

1. Projeyi GitHub'a push edin:
   ```bash
   git add .
   git commit -m "Deploy için hazır"
   git push origin main
   ```

2. [vercel.com](https://vercel.com) → Giriş yapın (GitHub ile)

3. **Add New Project** → GitHub repo'nuzu seçin (`zaman_olcer`)

4. Vercel otomatik algılar:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - (vercel.json zaten ayarlı)

5. **Deploy** tıklayın

6. Deploy bitince URL'i kopyalayın (örn: `https://zaman-olcer-xxx.vercel.app` veya `https://zaman-olcer.vercel.app`)

### Seçenek B: Vercel CLI ile

1. Vercel CLI kurun:
   ```bash
   npm i -g vercel
   ```

2. Proje klasöründe:
   ```bash
   vercel
   ```

3. İlk seferde giriş yapın, sorulara cevap verin

4. Deploy bitince terminalde URL gösterilir

---

## Adım 2: app-config.cjs'de URL'i Güncelle

Vercel'den aldığınız URL'i `app-config.cjs` dosyasına yazın:

```js
const APP_URL = 'https://zaman-olcer.vercel.app'  // ← Kendi URL'inizi yazın
```

Örnek URL'ler:
- `https://zaman-olcer.vercel.app`
- `https://zaman-olcer-yourname.vercel.app`

---

## Adım 3: Windows ve Android Build

### Windows (.exe)

```bash
npm run win
```

Çıktı: `release/` klasöründe `.exe` dosyası

### Android (APK)

```bash
npm run apk:release
```

Çıktı: `android/app/build/outputs/apk/release/app-release.apk`

---

## Adım 4: Kullanıcılara Dağıt

- **Windows:** `app-1.0.0.exe` (veya benzeri) dosyasını gönderin
- **Android:** `app-release.apk` dosyasını gönderin

Bu kurulum **bir kez** yapılır. Sonrasında kullanıcılar uygulamayı açtığında hep güncel sürümü alır.

---

## Sonraki Güncellemeler (Her Düzeltme/Özellik Sonrası)

1. **Kodu değiştir**
2. **Git push:**
   ```bash
   git add .
   git commit -m "60/15 süre düzeltmesi"
   git push
   ```
3. **Vercel otomatik deploy eder** (GitHub bağlıysa)
4. **Bitti.** Kullanıcılar uygulamayı bir sonraki açışlarında güncel sürümü alır.

⚠️ **Yeni EXE veya APK göndermenize gerek yok.** Uygulama Vercel'den yükleniyor.

---

## Özet Tablo

| Ne yapıyorsun?      | Komut / Adım                                      |
|---------------------|---------------------------------------------------|
| İlk Vercel deploy   | GitHub'a push → vercel.com'da proje bağla        |
| URL güncelle        | `app-config.cjs` → APP_URL                        |
| Windows build       | `npm run win`                                     |
| Android build       | `npm run apk:release`                             |
| Kod güncellemesi    | `git push` → Vercel otomatik deploy              |
