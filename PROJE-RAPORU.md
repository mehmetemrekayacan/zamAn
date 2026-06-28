# zamAn — Proje İnceleme Raporu

**Tarih:** 10 Şubat 2025  
**Proje:** Deneme / çalışma süre takip uygulaması (zaman_olcer / zdw)

---

## 1. Proje Özeti

**zamAn**, ilköğretim matematik öğretmenliği (KPSS / ÖABT) sınavına hazırlanan kullanıcılar için **deneme ve çalışma süre takip** uygulamasıdır. Kronometre, zamanlayıcı, Pomodoro tarzı (60 dk ders / 15 dk mola) ve deneme sınavı modları sunar. **PWA + offline-first** mimarisiyle web, Windows masaüstü (.exe) ve Android (APK) olarak kullanılabilir.

---

## 2. Proje Yapısı

| Klasör / Dosya | Açıklama |
|----------------|----------|
| **src/** | React (TypeScript) uygulama kodu |
| **src/store/** | Zustand state: timer, sessions, settings |
| **src/lib/** | DB, puanlama, rozetler, senkron, bildirimler, selam, tahmin, mola fikirleri |
| **src/components/** | Confetti, FinishScreen, SettingsModal, StatCard, Toast |
| **electron/** | Windows masaüstü (Electron) ana süreç |
| **android/** | Capacitor Android projesi (APK üretimi) |
| **public/** | manifest.json, PWA ikonları |
| **scripts/** | build-apk, generate-win-icon, prepare-assets, supabase-upload-sync, test scriptleri |
| **vercel.json** | Vercel deploy ayarları |
| **capacitor.config.ts** | Capacitor (Android) yapılandırması |
| **app-config.cjs** | Uygulama URL’i (deploy sonrası güncellenir) |

---

## 3. Teknoloji Stack

- **Frontend:** React 19, TypeScript, Vite (rolldown-vite)
- **Stil:** Tailwind CSS, PostCSS
- **State:** Zustand (persist ile ayarlar, timer state)
- **Veri:** IndexedDB (idb) — seanslar kalıcı; localStorage (ayarlar, deneme config, timer pause state)
- **Backend (isteğe bağlı):** Supabase — auth (kayıt/giriş) + `sync_data` tablosu ile online senkron
- **Masaüstü:** Electron + electron-builder (NSIS)
- **Mobil:** Capacitor 7, Android
- **PWA:** vite-plugin-pwa, manifest, offline-first

---

## 4. Uygulama Özellikleri (Detaylı)

### 4.1 Zamanlama Modları

| Mod | Açıklama | Varsayılan / Özellik |
|-----|----------|------------------------|
| **Deneme Sınavı** | Bölümlü sınav süreleri (AGS 110 dk, ÖABT 90 dk vb.) | Bölüm ekleme/düzenleme/silme; bölüm arası mola (süre kaydedilir); bölüme atlama |
| **60 dk ders / 15 dk mola** | Pomodoro tarzı | 60 dk ders → 15 dk mola döngüsü; tur sayacı; ders bitişinde ses/titreşim/bildirim |
| **Zamanlayıcı** | Geri sayım | Saat/dakika/saniye girişi; bitişte tamamlanma |
| **Kronometre** | Serbest süre | Süre sınırsız; bitirince kayıt |

Tüm modlarda: **Başlat / Duraklat / Devam / Bitir (erken) / Reset**. Deneme modunda bölüm arası molada “Devam” ile sonraki bölüme geçilir.

### 4.2 Seans Takibi ve Kayıt

- Her tamamlanan seans için: **süre (planlanan/gerçekleşen)**, **puan**, **ruh hali** (iyi / normal / yorucu), **not**.
- **IndexedDB** ile kalıcı saklama; sayfa kapatılsa da veri durur.
- Son seanslar listesi ana sayfada; mod, tarih, süre, puan, ruh hali ve not gösterilir.

### 4.3 Puanlama Sistemi (scoring.ts)

- **Temel puan:** Geçen dakika × mod katsayısı (serbest 0.8, gerisayim 1.2, ders60mola15 1.15, deneme 1.3).
- **Duraklatma cezası:** 1 pause −5, 2 pause −10, 3+ −20.
- **Erken bitirme bonusu:** Planlanandan erken bitirmede +max 20.
- **Odak bonusu:** 0 pause +15, 1 pause +5.
- **Seri bonusu:** Ardışık gün × 5, max 50.
- Bitiş ekranında (FinishScreen) puan dağılımı gösterilir; kayıt sonrası konfeti ve “5 saatlik gün” / level-up toast’ları tetiklenebilir.

### 4.4 Ünvan ve Motivasyon

- **Kariyer puanı:** Tüm seansların puan toplamı.
- Puana göre **ünvan** ve **profil emoji**; bir sonraki ünvana ilerleme yüzdesi (progress bar).
- “Motivasyon” paneli: mevcut ünvan + ileride açılacak ünvanlar listesi.
- Yeni ünvan kazanıldığında **level-up modal** gösterilir.

### 4.5 İstatistikler ve Rozetler

- **Bugün:** Toplam süre, seans sayısı, toplam puan.
- **Bu hafta / Bu ay:** Süre, seans sayısı, ortalama puan.
- **Seri (streak):** Ardışık gün sayısı (en az 1 seans); 3/7/14 gün için alev ikonu.
- **5+ saatlik gün:** Ayda günde ≥5 saat çalışılan gün sayısı.
- **Günlük hedef çubuğu:** Bugün X / 5 saat; tamamlanınca vurgu.
- **Günlük çalışma grafiği:** Son 30 gün, günlük süre çubukları; 5 saat hedef çizgisi; hedefi aşan günler farklı renk.
- **En verimli saatler:** 0–23 saat dilimine göre çalışma dağılımı (bar grafik).
- **Rozetler:** İlk seans, ilk 5 saatlik gün, ilk 1000 puan, seri 3/7/14, deneme 5/10, hedef gün 5/15, 150 saat vb. Kazanılan / kazanılmayan rozetler listelenir.

### 4.6 Tahmin ve Sınav Tarihi

- **150 saat tahmini:** Bu ayki tempoya göre “X günde 150 saate ulaşırsın” metni.
- **Sınav tarihi:** Ayarlarda hedef tarih (YYYY-MM-DD); ana sayfada “X gün kaldı” gösterilir.

### 4.7 Ayarlar (SettingsModal)

- **Tema:** Açık / Koyu / Yüksek kontrast.
- **Ses / Titreşim / Sessiz mod:** Bildirim ve ders bitişi davranışı.
- **Bildirim izni:** Tarayıcı bildirimi (isteğe bağlı).
- **Klavye kısayolları:** Başlat/Duraklat (Space), Reset (R), Mod geçiş (M) — özelleştirilebilir.
- **Kullanıcı adı:** Selamlama için (örn. “Günaydın, Luna!”).
- **Sınav tarihi:** “X gün kaldı” için.
- **Vurgu rengi:** Mavi / Mor / Yeşil / Pembe (butonlar, çubuklar).
- **Dışa aktar / İçe aktar:** Tüm seanslar + timer + deneme config + ayarlar tek JSON dosyası; dosya ile cihazlar arası taşıma.
- **Hesap (online senkron):** Sadece `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` tanımlıysa görünür:
  - Kayıt ol (isim, e-posta, şifre)
  - Giriş yap
  - Buluta kaydet / Buluttan çek (Supabase `sync_data` tablosu)
  - Çıkış yap
- **Tüm verileri temizle:** Seanslar, timer durumu, deneme ayarları silinir; tema/ses ayarları korunur.

### 4.8 Senkron

- **Dosya tabanlı:** Dışa aktar → JSON indir → başka cihazda içe aktar (üzerine yazar, sayfa yenilenir).
- **Online (Supabase):** Kayıt/giriş sonrası “Buluta kaydet” / “Buluttan çek”; veri JSON olarak `sync_data.data` içinde saklanır; RLS ile kullanıcı kendi verisine erişir.

### 4.9 Kullanıcı Deneyimi

- **Selamlama:** Saate göre (Günaydın / İyi günler / İyi akşamlar / İyi geceler); isim varsa “Günaydın, Luna!” gibi.
- **Mola fikirleri:** Deneme bölüm arası veya 60/15 molada rastgele kısa öneri (göz dinlendir, su al, esneme vb.).
- **Konfeti:** Seans tamamlandığında (isteğe bağlı).
- **Toast:** 5 saatlik gün tamamlandığında kutlama mesajı.
- **Responsive:** Masaüstü ve mobil; dokunmatik hedefler min 44px; safe-area desteği.

### 4.10 Erişilebilirlik ve PWA

- PWA: manifest, ikonlar, standalone display; offline-first.
- Klavye: Space / R / M ile kontrol; input/textarea’da kısayollar devre dışı.
- Escape ile ayarlar modalı kapanır.

---

## 5. Karşılanan İstekler / İhtiyaçlar

| İstek / İhtiyaç | Nasıl Karşılanıyor |
|------------------|---------------------|
| Sınav hazırlığı için süre takibi | Deneme modu (bölümlü), 60/15 Pomodoro, zamanlayıcı, kronometre |
| Deneme sınavı süreleri (AGS, ÖABT) | Deneme modunda özelleştirilebilir bölümler; varsayılan AGS 110 dk, ÖABT 90 dk |
| Düzenli çalışma alışkanlığı | 60 dk ders / 15 dk mola, mola fikirleri, bildirimler |
| Motivasyon ve sürdürülebilirlik | Ünvanlar, rozetler, seri gün, 5 saatlik gün, level-up, tahmin metni, sınav tarihi geri sayımı |
| İlerleme takibi | Bugün/hafta/ay istatistikleri, günlük grafik, en verimli saatler, puan özeti |
| Verilerin kalıcı olması | IndexedDB ile seanslar; localStorage ile ayarlar ve deneme config |
| Çok cihaz (PC + telefon) | PWA + Windows .exe + Android APK; dosya ile dışa/içe aktar; isteğe bağlı Supabase senkron |
| Offline kullanım | Offline-first; veri yerelde; Supabase sadece “Buluta kaydet / Buluttan çek” için |
| Kişiselleştirme | İsim, sınav tarihi, tema, ses, titreşim, vurgu rengi, kısayollar |
| Hızlı kontrol | Klavye kısayolları (Space, R, M) |
| Seans sonrası değerlendirme | Ruh hali (iyi/normal/yorucu), not alanı, puan dağılımı ekranı |

---

## 6. Dokümantasyon ve Scriptler

- **README.md:** Özellikler, kurulum, geliştirme, Windows/Android/PWA build, Supabase kurulumu, komut özeti.
- **KULLANIM.md:** Windows (PWA/tarayıcı) ve Android (APK) kullanım adımları.
- **DEPLOY-ADIMLAR.md:** Vercel deploy, app-config URL güncelleme, Windows/Android build.
- **SUPABASE-KURULUM.md:** Supabase projesi ve sync tablosu kurulumu.
- **GUNCELLEME.md, TEST.md:** Güncelleme ve test notları.
- **scripts/build-apk.cjs:** APK üretimi.
- **scripts/generate-win-icon.cjs:** Windows ikonu.
- **scripts/prepare-assets.cjs:** PWA/Android ikon hazırlığı.
- **scripts/supabase-upload-sync.cjs:** Supabase sync yükleme (yardımcı).
- **scripts/test-all.ts, test-rozetler.ts:** Test scriptleri.

---

## 7. Özet Tablo

| Kategori | İçerik |
|----------|--------|
| **Amaç** | KPSS/ÖABT hazırlık için deneme ve çalışma süre takibi |
| **Platformlar** | Web (PWA), Windows (.exe), Android (APK) |
| **Modlar** | Deneme (bölümlü), 60/15, zamanlayıcı, kronometre |
| **Veri** | IndexedDB (seanslar), localStorage (ayarlar, timer, deneme config) |
| **Senkron** | Dosya (dışa/içe aktar) + isteğe bağlı Supabase |
| **Motivasyon** | Ünvan, rozetler, seri, 5 saat gün, tahmin, sınav geri sayımı |
| **Teknoloji** | React 19, TypeScript, Vite, Zustand, Tailwind, idb, Supabase, Electron, Capacitor |

Bu rapor, projenin mevcut yapısı ve özelliklerine göre hazırlanmıştır.
