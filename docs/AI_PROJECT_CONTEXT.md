# AI Project Context — zamAn

> Last updated: 2026-02-27  
> Purpose: Bu dosya, projeyi bir yapay zekânın hızlıca anlayıp katkı verebilmesi için yapılandırılmış teknik özet sunar.

## 1) Project Identity

- **Name:** `zaman_olcer` / ürün adı `zamAn`
- **Type:** Cross-platform zaman takip uygulaması (study/exam timer)
- **Primary Use Case:** Çalışma seanslarını yönetmek, puanlamak, kaydetmek, raporlamak ve cihazlar arası senkronize etmek
- **Platforms:**
  - Web/PWA (Vite)
  - Windows Desktop (Electron)
  - Android (Capacitor)

## 2) Tech Stack

### Frontend
- **React 19**
- **TypeScript 5.9**
- **Zustand** (global state + persist)
- **Tailwind CSS**
- **Vite** (`rolldown-vite` override)

### Storage & Data
- **IndexedDB** via `idb` (local session storage)
- **localStorage** (timer/settings/config persist)
- **Supabase** (`@supabase/supabase-js`) for auth + cloud sync

### Platform
- **Electron** (Windows app, tray, global hotkeys, mini player)
- **Capacitor Android** (`@capacitor/android`, `@capacitor/haptics`)
- **PWA** (`vite-plugin-pwa`)

### Quality Tooling
- **Vitest** (unit tests)
- **ESLint**

## 3) Current Runtime Architecture

## 3.1 Core App
- Entry: `src/main.tsx` → `src/App.tsx`
- Main app composition:
  - Timer state: `src/store/timer.ts`
  - Session state: `src/store/sessions.ts`
  - Settings state: `src/store/settings.ts`
  - UI components under `src/components/*`

## 3.2 Timer Modes (active)
- `serbest` (stopwatch)
- `gerisayim` (countdown)
- `ders60mola15` (work/break cycle)
- `deneme` (multi-section exam mode)

## 3.3 Data Model (session)
- Main type: `SessionRecord` in `src/types.ts`
- Key fields:
  - identity/time: `id`, `tarihISO`, `createdAt`, `updatedAt`
  - mode/time: `mod`, `surePlan`, `sureGercek`
  - scoring: `puan`, `odakSkoru`
  - behavior: `duraklatmaSayisi`, `toplamDuraklamaSureSaniye`, `erkenBitirmeSuresi`
  - optional mode extras: deneme analizleri, mola süreleri, bölüm bilgileri

## 4) Storage and Sync Systems (current)

## 4.1 Local persistence (active)
- **IndexedDB DB:** `zaman-olcer-v1`
- **Store:** `sessions`
- Access layer: `src/lib/db.ts`
- Session save/delete events also enqueue cloud sync actions when cloud is enabled

## 4.2 Offline sync queue (active)
- File: `src/lib/offlineSync.ts`
- Queue DB: `zaman-sync-queue`
- Queue store: `sync-queue`
- Action types:
  - `upsert_session`
  - `delete_session` (soft-delete in cloud)
- Behavior:
  - Offline mutations queue up
  - On `online` event, queue is flushed to Supabase
  - Retry strategy (max retry count) exists

## 4.3 Cloud sync (active, user-authenticated)
- Files:
  - `src/lib/supabase.ts` (client init + feature gate)
  - `src/lib/cloudSync.ts` (auth + push/pull + merge logic)
- Auth:
  - Email/password sign-up/sign-in/sign-out
- Sync strategy (v2):
  - Session-level upsert to `sessions` table (`id,user_id` conflict key)
  - Pull merges by comparing timestamps (`updatedAt`/`createdAt`)
  - Settings sync via separate table (`user_settings`)
  - Legacy migration path from old `sync_data` exists

## 4.4 Manual file sync / backup (active)
- File: `src/lib/sync.ts`
- Capabilities:
  - Export full payload as JSON
  - Import payload from JSON (overwrite local)
- Includes sessions + selected localStorage keys

## 5) Platform-specific Systems (current)

## 5.1 Web / PWA
- Config: `vite.config.ts`
- `vite-plugin-pwa` enabled (`registerType: prompt`)
- Manifest includes app icons and standalone mode
- Runtime caching strategy: `NetworkFirst` for app shell resources
- Install prompt manager: `src/lib/pwaInstall.ts`

## 5.2 Electron (Windows)
- Main process: `electron/main.cjs`
- Features active:
  - Tray icon + context menu
  - Global shortcuts (`Ctrl/Cmd+Shift+Space`, `Ctrl/Cmd+Shift+R`, `Ctrl/Cmd+Shift+M`)
  - Mini-player mode
  - Always-on-top toggle
  - IPC bridge for timer updates/hotkeys
- Renderer bridge: `src/lib/electronBridge.ts`
- Packaged app loads remote URL (`app-config.cjs`) for instant post-deploy updates

## 5.3 Android (Capacitor)
- Config: `capacitor.config.ts`
- Supports remote URL mode via env (`CAPACITOR_REMOTE=1`)
- Haptics integration in notifications path (`@capacitor/haptics`)

## 6) Notification System (current)

- File: `src/lib/notifications.ts`
- Capabilities:
  - Browser notifications (`Notification API`)
  - Sound via Web Audio API
  - Vibration via Capacitor Haptics (native) or Web Vibration API fallback
  - Background title flashing + visibility handling

## 7) Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ZAMAN_APP_URL`
- `CAPACITOR_REMOTE` (`1` to force remote URL mode)
- `APK_MODE` (build script usage)

## 8) Build/Run Commands (key)

- `npm run dev` → local web development
- `npm run build` → production web build
- `npm run win` / `npm run win:dir` → Windows package
- `npm run apk:build` / `npm run apk:release` → Android APK flow
- `npm run test` / `npm run test:unit` / `npm run lint`

## 9) Source Map for AI Agents

### Critical files
- `src/App.tsx` → main orchestration + UI wiring
- `src/store/timer.ts` → timer state machine and mode logic
- `src/store/sessions.ts` → session list/actions
- `src/store/settings.ts` → user preferences
- `src/lib/db.ts` → IndexedDB CRUD
- `src/lib/cloudSync.ts` → Supabase auth + merge sync
- `src/lib/offlineSync.ts` → queued offline-to-cloud writes
- `src/lib/sync.ts` → JSON import/export
- `src/lib/notifications.ts` → sound/vibration/browser notify
- `src/lib/electronBridge.ts` + `electron/main.cjs` → desktop integration
- `vite.config.ts` + `capacitor.config.ts` + `app-config.cjs` → platform build/runtime behavior

## 10) Current System Status Snapshot

- **Offline-first local data:** ✅ Active
- **Offline mutation queue:** ✅ Active
- **Cloud account + sync (Supabase):** ✅ Active (when env configured)
- **Session-level merge strategy:** ✅ Active
- **PWA install and caching:** ✅ Active
- **Electron tray/hotkeys/mini-player:** ✅ Active
- **Android native shell + haptics path:** ✅ Active
- **Push notification backend (FCM etc.):** ❌ Not present in current code
- **Multi-user collaboration / shared workspaces:** ❌ Not present

## 11) Constraints & Notes

- Project is private; no public license workflow in this repo context.
- Existing docs (`README.md`, `ARCHITECTURE.md`) contain richer narrative; this file is intentionally structured for machine parsing and quick onboarding.
- If this file is used by autonomous coding agents, preferred first-read order is:
  1. This file
  2. `README.md`
  3. `ARCHITECTURE.md`
  4. Core files in section 9
