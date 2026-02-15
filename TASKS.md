# zamAn — Optimize / Düzenleme / Tamir Planı

## KRİTİK HATALAR

### 1. ~~`pomodoro` hayalet referansları → Build kırık~~ ✅ TAMAMLANDI
- **Sorun:** `types.ts`'de `Mode = 'serbest' | 'gerisayim' | 'ders60mola15' | 'deneme'` — pomodoro yok. Ama `App.tsx`'te 10+ yerde `'pomodoro'` referansı var.
- **Çözüm:** `modes` dizisinde `pomodoro` → `ders60mola15` yap, `pomodoroPhase`/`pomodoroCycle` referanslarını kaldır, tüm `'pomodoro'` karşılaştırmalarını düzelt.
- **Dosyalar:** `src/App.tsx`

### 2. ~~`sureGercek` birim tutarsızlığı → Rozetler çalışmıyor~~ ✅ TAMAMLANDI
- **Sorun:** `App.tsx saveSession()` süreyi **dakika** olarak kaydediyor (`ms / 1000 / 60`). Ama `rozetler.ts` ve istatistik hesaplamaları süreyi **saniye** olarak bekliyor (`>= 5 * 3600`).
- **Çözüm:** `saveSession()`'da süreyi **saniye** olarak kaydet (`ms / 1000`). İstatistik gösterimlerinde saniyeyi dakikaya çevir.
- **Dosyalar:** `src/App.tsx`, istatistik gösterimleri

## YÜKSEK ÖNCELİK

### 3. ~~Inline FinishScreen → Component kullan (~90 satır duplicate)~~ ✅ TAMAMLANDI
- **Sorun:** `App.tsx` satır 303-395'te inline bitiş ekranı var. `FinishScreen.tsx` component'i ayrı ve daha gelişmiş (ruh hali, deneme analizi).
- **Çözüm:** Inline kodu sil, `FinishScreen.tsx` import et ve kullan.
- **Dosyalar:** `src/App.tsx`, `src/components/FinishScreen.tsx`

### 4. ~~Inline SettingsModal → Component kullan (~180 satır duplicate)~~ ✅ TAMAMLANDI
- **Sorun:** `App.tsx` satır 861-1047'de inline ayar modal var. `SettingsModal.tsx` daha kapsamlı (sessiz mod, vurgu rengi, dışa/içe aktar, bulut sync).
- **Çözüm:** Inline kodu sil, `SettingsModal.tsx` import et ve kullan.
- **Dosyalar:** `src/App.tsx`, `src/components/SettingsModal.tsx`

### 5. ~~Inline StatCard → Component import et~~ ✅ TAMAMLANDI
- **Sorun:** `App.tsx` altında (satır 1051-1062) `StatCard` fonksiyonu tanımlı. `StatCard.tsx` memo ile sarılmış ayrı component mevcut.
- **Çözüm:** App.tsx'teki inline tanımı sil, component'i import et.
- **Dosyalar:** `src/App.tsx`

### 6. ~~`primaryAction` useCallback eksik → useEffect uyarısı~~ ✅ TAMAMLANDI
- **Sorun:** `primaryAction` her renderda yeni fonksiyon, useEffect dependency'si her renderda değişiyor.
- **Çözüm:** `useCallback` ile sar.
- **Dosyalar:** `src/App.tsx`

## ORTA ÖNCELİK

### 7. ~~`let checkDate` → `const checkDate` (2 yerde)~~ ✅ TAMAMLANDI
- Lint uyarısı. `.setDate()` mutation olduğu için `const` uygun.

### 8. ~~Seri hesaplama — 3 yerde tekrar~~ ✅ TAMAMLANDI
- `calculateStreak()` fonksiyonu `scoring.ts`'e eklendi, App.tsx'teki 2 yerde ve `calculateTodayStreakBonus`'ta kullanıldı.

### 9. ~~App.css duplicate tema stilleri~~ ✅ TAMAMLANDI
- App.css'teki duplicate light/high-contrast tema tanımları silindi.

### 10. ~~`sessizMod` kontrolünü bildirime ekle~~ ✅ TAMAMLANDI
- `sessizMod` aktifken ses ve titreşim devre dışı bırakılıyor.

### 11. ~~`vurguRengi` CSS'e uygula~~ ✅ TAMAMLANDI
- `data-vurgu` attribute HTML root'a uygulanıyor, index.css'teki selectors çalışıyor.

## DÜŞÜK ÖNCELİK

### 12. ~~Selam, sınav geri sayım, tahmin, rozetler, ünvan → UI'a bağla~~ ✅ TAMAMLANDI
- Header: `getSelam()` + ünvan emoji/ad + sınav geri sayım
- Sidebar: Kariyer kartı (ünvan, ilerleme barı, tahmin) + Rozetler grid
- `data-tier` attribute ile ünvan bazlı arka plan teması

### 13. ~~Kullanılmayan export fonksiyonları~~ ✅ TAMAMLANDI
- `getModeStatistics`, `getBestSession`, `getWorstSession`, `getAverageScore`, `calculateTodayStreakBonus`, `calculateSessionScoreDetail`, `getTotalTodaySeconds`, `getTotalTodayScore`, `SessionScoreDetail` silindi.
