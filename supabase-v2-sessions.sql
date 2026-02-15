-- zamAn v2: Normalize edilmiş seans tablosu + kullanıcı ayarları
-- Eski sync_data tablosu korunur (geriye uyumluluk).
-- Supabase Dashboard → SQL Editor → bu dosyayı çalıştır.

-- ═══════════════════════════════════════════════════
-- 1. SESSIONS TABLOSU — her seans kendi satırı
-- ═══════════════════════════════════════════════════
create table if not exists public.sessions (
  id            text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  mod           text not null check (mod in ('serbest','gerisayim','ders60mola15','deneme')),
  sure_plan     integer,                       -- saniye
  sure_gercek   integer not null,              -- saniye
  puan          integer not null default 0,
  tarih_iso     timestamptz not null,
  not_text      text,
  duraklatma    integer not null default 0,
  erken_bitirme integer,                       -- saniye
  odak_skoru    integer,
  mola_saniye   integer,
  deneme_molalar jsonb,                        -- number[]
  dogru_sayisi  integer,
  yanlis_sayisi integer,
  bos_sayisi    integer,
  bolumler      jsonb,                         -- {ad, surePlan?, sureGercek}[]
  platform      jsonb,                         -- {cihaz?, userAgentHash?}
  ruh_hali      text check (ruh_hali is null or ruh_hali in ('iyi','normal','yorucu')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,                   -- soft delete for sync

  primary key (id, user_id)
);

-- İndeksler
create index if not exists idx_sessions_user    on public.sessions (user_id);
create index if not exists idx_sessions_date    on public.sessions (user_id, tarih_iso desc);
create index if not exists idx_sessions_updated on public.sessions (user_id, updated_at desc);

-- ═══════════════════════════════════════════════════
-- 2. USER_SETTINGS TABLOSU — cihazlar arası ayar sync
-- ═══════════════════════════════════════════════════
create table if not exists public.user_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  settings      jsonb not null default '{}',   -- zaman-olcer-settings blob
  timer_storage jsonb,                          -- timer-storage blob
  deneme_config jsonb,                          -- deneme-config blob
  updated_at    timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════
-- 3. RLS — Row Level Security
-- ═══════════════════════════════════════════════════

-- sessions
alter table public.sessions enable row level security;

create policy "Users read own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);

create policy "Users delete own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- user_settings
alter table public.user_settings enable row level security;

create policy "Users read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

create policy "Users delete own settings"
  on public.user_settings for delete
  using (auth.uid() = user_id);
