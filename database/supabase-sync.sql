-- zamAn online senkron için Supabase tablosu
-- Supabase Dashboard → SQL Editor → bu dosyayı yapıştırıp çalıştır.

-- Tablo: Kullanıcı başına bir satır, veri JSON olarak saklanır
create table if not exists public.sync_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- RLS: Sadece kendi satırına erişebilir
alter table public.sync_data enable row level security;

create policy "Users can read own sync_data"
  on public.sync_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own sync_data"
  on public.sync_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sync_data"
  on public.sync_data for update
  using (auth.uid() = user_id);

create policy "Users can delete own sync_data"
  on public.sync_data for delete
  using (auth.uid() = user_id);
