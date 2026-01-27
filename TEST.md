# Projeyi Çalıştırma ve Test Etme

## 1. Geliştirme sunucusunu başlat

Proje klasöründe terminal açıp:

```bash
npm run dev
```

Çıktıda genelde şöyle bir adres görünür: **http://localhost:5173** (veya farklı bir port). Bu adresi tarayıcıda aç.

---

## 2. Hızlı test listesi

### Modlar
- **Kronometre (serbest):** Başlat → süre artsın → Duraklat / Devam / Reset dene.
- **Zamanlayıcı (geri sayım):** Süre gir (ör. 1 dk) → Başlat → süre insin, bitince bitiş ekranı gelsin.
- **60 dk ders / 15 dk mola:** Başlat → 60 dk ders (isteğe bağlı kısa test için süreleri timer store’da geçici değiştirebilirsin) → sonra 15 dk mola → tekrar ders; sayaçta “Ders / Mola • Tur N” kontrol et.
- **Deneme sınavı:** Bölüm ekle/düzenle → Başlat → bir bölüm bitsin → **“Bölüm arası mola”** ekranı gelmeli, süre sayılsın → **Devam**’a bas → sonraki bölüm başlamalı.

### Mola ve istatistik
- **60+15:** Bir ders + bir mola tamamla, seansı bitir, kaydederken kayıtta “mola” bilgisi tutuluyor mu kontrol et (ileride detay ekranında gösterebilirsin).
- **Deneme molası:** Bölüm bitince mola ekranında 1–2 dk bekle → Devam → seansı bitirip kaydet; kayıtta bölümler arası mola süreleri tutuluyor mu bak.
- **5+ saat gün:** Üstteki “5+ saat gün” kartında bu ay **günde en az 5 saat** çalışılan gün sayısı doğru mu kontrol et (test için eski tarihli deneme seansları ekleyip 300+ dk yapabilirsin).

### Sessiz mod
- Ayarlar → **Sessiz mod** aç → bir seans bitir; bitişte **ses çalmamalı** (bildirim/titreşim kendi ayarlarına göre çalışır).

### Klavye
- **Space:** Başlat / Duraklat  
- **R:** Reset  
- **M:** Mod değiştir  

Input/textarea içindeyken bu tuşlar çalışmaz.

### Build
- `npm run build` → `dist` oluşmalı, hata olmamalı.
- `npm run preview` → `dist` ile önizleme sunucusu açar (production’a yakın test).

---

## 3. Komut özeti

| Amaç              | Komut                |
|-------------------|----------------------|
| Geliştirme        | `npm run dev`        |
| Production build  | `npm run build`      |
| Build önizleme    | `npm run preview`    |
| Lint              | `npm run lint`       |

Tarayıcıda **http://localhost:5173** (veya terminalde yazan adres) açıp yukarıdaki senaryoları geçersen proje test edilmiş olur.
