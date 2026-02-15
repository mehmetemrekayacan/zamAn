# zamAn — Mimari Analiz & Cross-Platform Geliştirme Planı

> Tarih: 2026-02-16

---

## BÖLÜM 1: Mevcut Veri ve Supabase Analizi (Reverse Engineering)

### 1.1 Veritabanı Şeması

Projede **ikili veri katmanı** var:

#### Yerel Katman — IndexedDB (`idb`)

`src/lib/db.ts` → `zaman-olcer-v1` veritabanı

| Object Store | Key | İndexler | Açıklama |
|---|---|---|---|
| `sessions` | `id` (string) | `by-date` (tarihISO), `by-mod` (mod) | Tüm çalışma seansları |

#### Yerel Katman — localStorage

| Anahtar | İçerik |
|---|---|
| `timer-storage` | Zustand persist — timer durumu (mod, geçen süre, duraklatma vs.) |
| `deneme-config` | Deneme sınavı bölüm konfigürasyonu |
| `zaman-olcer-settings` | Kullanıcı ayarları (tema, ses, titreşim, kısayollar, vurgu rengi, sınav tarihi) |
| `zaman-ders60-pause-state` | 60/15 pomodoro duraklatma durumu |

#### Bulut Katmanı — Supabase

`supabase-sync.sql` → Tek tablo:

```
sync_data
├── user_id    UUID PK → auth.users(id) ON DELETE CASCADE
├── data       JSONB (tüm ExportPayload tek blob olarak)
└── updated_at TIMESTAMPTZ
```

#### `SessionRecord` Veri Modeli (`src/types.ts`)

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `id` | string | ✅ | Unique ID (`Date.now()-random`) |
| `mod` | Mode | ✅ | serbest / gerisayim / ders60mola15 / deneme |
| `surePlan` | number | ❌ | Planlanan süre (saniye) |
| `sureGercek` | number | ✅ | Gerçekleşen süre (saniye) |
| `puan` | number | ✅ | Hesaplanan puan |
| `tarihISO` | string | ✅ | ISO 8601 tarih |
| `not` | string | ❌ | Kullanıcı notu |
| `duraklatmaSayisi` | number | ✅ | Kaç kez duraklatıldı |
| `erkenBitirmeSuresi` | number | ❌ | Erken bitirmede kalan (sn) |
| `odakSkoru` | number | ❌ | Odak puanı |
| `molaSaniye` | number | ❌ | 60/15: toplam mola |
| `denemeMolalarSaniye` | number[] | ❌ | Deneme: bölüm arası molalar |
| `dogruSayisi / yanlisSayisi / bosSayisi` | number | ❌ | Deneme analizi |
| `bolumler` | array | ❌ | Deneme bölüm detayları |
| `platform` | object | ❌ | Cihaz / UA hash |
| `ruhHali` | RuhHali | ❌ | iyi / normal / yorucu |
| `createdAt / updatedAt` | string | ❌ | Zaman damgaları |

### 1.2 Aktif Senkronizasyon Durumu

| İşlev | Durum | Dosya |
|---|---|---|
| **Yerel kayıt** (IndexedDB) | ✅ Aktif | `src/lib/db.ts` |
| **Dosya dışa/içe aktarma** (JSON) | ✅ Aktif | `src/lib/sync.ts` |
| **Bulut kayıt** (Supabase upsert) | ✅ Aktif (manuel) | `src/lib/cloudSync.ts` |
| **Otomatik senkronizasyon** | ❌ Yok | — |
| **Gerçek zamanlı senkronizasyon** | ❌ Yok | — |
| **Çakışma çözümleme (conflict resolution)** | ❌ Yok | — |

**Mevcut Akış:** Kullanıcı Ayarlar → "Buluta kaydet" veya "Buluttan çek" butonlarına **manuel** basıyor. `pushCloud()` → tüm yerel veriyi `ExportPayload` olarak toplayıp tek bir JSONB satırı olarak Supabase'e `upsert` ediyor. `pullCloud()` → tüm veriyi çekip yerel verilerin üzerine yazıyor.

### 1.3 Risk ve Eksiklik Analizi

#### 🔴 Kritik Riskler

| # | Risk | Açıklama |
|---|---|---|
| 1 | **Full-overwrite sync** | `pushCloud` / `pullCloud` tüm veriyi komple yazıyor. Birden fazla cihazda çalışırken veri kaybı riski var. A cihazında 5 seans, B'de 3 seans → B "push" yaparsa A'nın 5 seansı kaybolur. |
| 2 | **Çakışma çözümü yok** | `updated_at` alanı var ama karşılaştırılmıyor. Son yazan kazanır (last-write-wins). |
| 3 | **Seans bazlı senkronizasyon yok** | Seanslar normalize edilmemiş; tek JSONB blob olarak saklanıyor. Bu sorgu, analitik ve kısmi senkronizasyonu imkansız kılıyor. |

#### 🟡 Orta Riskler

| # | Risk | Açıklama |
|---|---|---|
| 4 | **RLS politikası yeterli** | ✅ CRUD operasyonlarının 4'ünde de `auth.uid() = user_id` kontrolü var. Ancak Supabase `anon key` client-side'da açık — bu standart ve kabul edilebilir. |
| 5 | **Tablo ilişkisi minimal** | Tek `sync_data` tablosu var. `auth.users` ile FK ilişkisi doğru kurulmuş (`ON DELETE CASCADE`). Ancak gelecekte etiketler, projeler, hedefler gibi ek tablolar gerekecek. |
| 6 | **Offline-first sorunları** | IndexedDB + localStorage hibrit yapısı tutarlı ama Service Worker cache stratejisi sadece `NetworkFirst` — gerçek offline veri mutasyonu planlanmamış. |

#### 🟢 İyi Durumda

- RLS aktif ve doğru ✅
- Auth akışı (email/password + display_name) ✅
- Veri export formatı versiyonlu (`version: 1`) ✅
- IndexedDB indeksleri uygun ✅

---

## BÖLÜM 2: Responsive & Adaptive UI Stratejisi (3-in-1 Design)

### 2.1 Mevcut Durum

Proje **Tailwind CSS** ile tek kod tabanı üzerinde çalışıyor. Capacitor (Android) + Electron (Windows) + PWA (Web) ile 3 platforma deploy ediliyor. Ancak **platform-adaptif layout** henüz yok.

### 2.2 Önerilen 3 Katmanlı Strateji

#### A. WEB — Dashboard Odaklı (≥1024px)

```
┌──────────────────────────────────────────────────┐
│  Header: Selam, [isim]   │  Sınav: X gün   ⚙️  │
├──────────────────────────────────────────────────┤
│  QuickStats: Bugün | Hafta | Seri | Puan        │
├─────────────────┬────────────────────────────────┤
│                 │                                │
│   TIMER HERO    │   Seans Geçmişi (scrollable)   │
│   (sol panel)   │   + Kariyer Paneli              │
│                 │   + Haftalık Grafik              │
│                 │                                │
├─────────────────┴────────────────────────────────┤
│  Mod Seçici (yatay tab bar)                      │
│  Mod Config (inline genişleyebilir)              │
└──────────────────────────────────────────────────┘
```

#### B. MOBİL — Touch-First (≤640px)

```
┌────────────────────────┐
│  Header (kompakt)      │
├────────────────────────┤
│  Quick Stats (swipe)   │
├────────────────────────┤
│                        │
│     TIMER HERO         │
│  (tam genişlik, büyük  │
│   butonlar: min 56px)  │
│                        │
├────────────────────────┤
│  Mod Seçici (4 ikon)   │
├────────────────────────┤
│  Son Seanslar (3 adet) │
├────────────────────────┤
│  [Bottom Sheet Trigger]│
│  ▲ Detaylı İstatistik  │
└────────────────────────┘
   ░░░ Safe Area ░░░
```

#### C. MASAÜSTÜ (Electron) — Kompakt & Always-on-Top

```
┌─────────────────────┐  ← Title bar (frameless)
│ ⏱ 01:23:45  ▶ ⏸ ⏹  │  ← Mini-player modu (280×80px)
└─────────────────────┘

Genişletilmiş mod (420×800 — mevcut):
Normal UI + "Always on Top" toggle + "Mini Player" toggle
```

### 2.3 CSS Breakpoint Stratejisi

| Breakpoint | Platform | Layout |
|---|---|---|
| `<640px` (default) | Mobil | Tek sütun, büyük touch target, bottom sheet |
| `640-1023px` (sm/md) | Tablet / küçük laptop | Sıkıştırılmış dashboard |
| `≥1024px` (lg) | Web / Masaüstü | İki sütun grid, sidebar istatistikler |
| `≥1280px` (xl) | Geniş monitör | Üç sütun, genişletilmiş kariyer paneli |

---

## BÖLÜM 3: Platforma Özel Özellikler (Platform Specifics)

### 3.1 MOBİL — Push Bildirimler & Çevrimdışı Mod

- `@capacitor/push-notifications` + FCM
- Supabase Edge Function ile push gönder
- Kullanım: günlük hatırlatma, seri koruma, motivasyon
- Offline sync kuyruğu (IndexedDB store + online event listener)

### 3.2 MASAÜSTÜ — Global Hotkeys & System Tray

- Electron `globalShortcut` → Ctrl+Shift+Space (başlat/duraklat), Ctrl+Shift+R (sıfırla)
- System Tray: context menu, tooltip'te zamanlayıcı, pencere kapatınca tray'e küçült
- Mini-player: 300×90 frameless always-on-top pencere
- IPC bridge: main → renderer arası mesajlaşma

### 3.3 WEB — PWA & Dinamik Tab Sayacı

- `beforeinstallprompt` ile custom install banner
- Workbox Background Sync
- `document.title` ile gerçek zamanlı sayaç: `01:23:45 — zamAn`

---

## Öncelik Sıralaması

| Öncelik | İş | Efor | Etki | Durum |
|---|---|---|---|---|
| 🔴 P0 | Seans bazlı Supabase tablosu + merge sync | 2-3 gün | Çoklu cihaz güvenliği | ✅ Tamamlandı |
| 🔴 P0 | Offline sync kuyruğu | 1 gün | Veri kaybı önleme | ✅ Tamamlandı |
| 🟡 P1 | Dinamik tab başlığı (sayaç) | 30 dk | UX iyileştirme | ✅ Tamamlandı |
| 🟡 P1 | Electron: System Tray + mini-player | 1 gün | Masaüstü UX | ✅ Tamamlandı |
| 🟡 P1 | Electron: Global hotkeys | 2 saat | Masaüstü verimlilik | ✅ Tamamlandı |
| 🟡 P1 | Mobil: Bottom sheet layout | 1 gün | Touch UX | ⬜ Bekliyor |
| 🟢 P2 | Web: PWA install prompt | 2 saat | Engagement | ✅ Tamamlandı |
| 🟢 P2 | Mobil: Push notifications (FCM) | 1-2 gün | Retention | ⬜ Bekliyor |
| 🟢 P2 | Responsive 3-sütun layout (xl) | 1 gün | Geniş ekran UX | ✅ Tamamlandı |
| 🟢 P2 | Always on Top toggle | 1 saat | Masaüstü UX | ✅ Tamamlandı |
