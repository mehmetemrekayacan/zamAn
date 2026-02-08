# Projeyi Çalıştırma ve Test Etme

## 1. Geliştirme sunucusunu başlat

```bash
npm run dev
```

Çıktıda **http://localhost:5173** (veya farklı port) görünür. Tarayıcıda aç.

---

## 2. Otomatik testler (kod)

```bash
npm run test          # Tüm birim testleri (scoring, time, rozetler, tahmin)
npm run test:rozetler # Sadece rozet hesaplaması
```

Testler: puanlama, tarih formatı, rozet mantığı, tahmin, saat dağılımı, ünvan eşikleri, mock veri tutarlılığı.

---

## 3. Manuel test listesi

### 3.1 Modlar

| Test | Adım | Beklenen |
|------|------|----------|
| **Kronometre** | Başlat → Duraklat → Devam → Reset | Süre doğru artar, reset sıfırlar |
| **Zamanlayıcı** | 1 dk gir → Başlat | Süre insin, bitince bitiş ekranı |
| **60/15** | Başlat (test: 10 sn ders / 5 sn mola) | Ders bitince mola, mola bitince "Tur 2" değil "Tur 1" (ilk tur tamamlandı) |
| **60/15 tur** | İlk ders bitip molaya geçince | "Tur 1" yazmalı (2 değil) |
| **Deneme** | Bölüm bitir | "Bölüm arası mola" ekranı → Devam → sonraki bölüm |

### 3.2 60/15 modu – özel senaryolar

| Test | Adım | Beklenen |
|------|------|----------|
| **Duraklat + mod değişim** | 60/15 başlat → Duraklat → Başka mod → Geri 60/15 | Süre ve tur korunmalı |
| **Kayıt sonrası** | Tur bitir → Kaydet | Son seanslara düşmeli, istatistiklere yansımalı |
| **Kayıt süresi** | 10 sn ders / 5 sn mola ile 1 tur bitir, kaydet | Kayıtta "15 sn" (tek tur) görünmeli, "1 dk 15 sn" değil |
| **Tur sıfırlama** | Kayıt sonrası veya mod değişim sonrası | Tur 1’den başlamalı (aynı gün içinde devam ediyorsa korunabilir) |

### 3.3 Seans kaydı ve listeleme

| Test | Adım | Beklenen |
|------|------|----------|
| **Kaydet** | Herhangi modda seans bitir → Kaydet | Son seanslar listesinde en üstte görünmeli |
| **Sıralama** | Birden fazla seans kaydet | En son yapılan en üstte (createdAt’e göre) |
| **İstatistik** | Seans kaydet | Bugün/Bu hafta/Bu ay kartları güncellenmeli |

### 3.4 Rozetler ve istatistik

| Test | Adım | Beklenen |
|------|------|----------|
| **Mock ile rozetler** | Mock açık, sayfayı yenile | İlk seans, 5 saatlik gün, 7 gün seri vb. doğru kazanılmış olmalı |
| **5+ saat gün** | Bu ay günde 5+ saat çalışılan gün sayısı | Doğru hesaplanmalı |
| **Seri** | Ardışık günlerde çalışma | Seri rozetleri (3, 7, 14 gün) doğru |

### 3.5 Ayarlar ve veri

| Test | Adım | Beklenen |
|------|------|----------|
| **Tüm verileri temizle** | Ayarlar → Tüm verileri temizle | Seanslar, deneme ayarları, 60/15 pause state silinmeli |
| **Dışa/içe aktar** | Dışa aktar → Dosyayı kaydet → İçe aktar | Veriler taşınmalı |
| **Sessiz mod** | Sessiz mod aç → Seans bitir | Ses çalmamalı |

### 3.6 Klavye

| Tuş | Aksiyon |
|-----|---------|
| Space | Başlat / Duraklat |
| R | Reset |
| M | Mod değiştir |

Input/textarea içindeyken çalışmaz.

### 3.7 Build

| Komut | Beklenen |
|-------|----------|
| `npm run build` | `dist` oluşur, hata yok |
| `npm run preview` | Production önizleme çalışır |

---

## 4. Komut özeti

| Amaç | Komut |
|------|-------|
| Otomatik testler | `npm run test` |
| Rozet testi | `npm run test:rozetler` |
| Geliştirme | `npm run dev` |
| Production build | `npm run build` |
| Build önizleme | `npm run preview` |
| Lint | `npm run lint` |
