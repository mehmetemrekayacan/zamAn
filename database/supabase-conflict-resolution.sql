-- Conflict Resolution Helper (updated_at_server)
-- Amaç: cihaz saat farklarından bağımsız, sunucu-zamanı bazlı deterministik merge

alter table public.sessions
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at_server timestamptz not null default now(),
  add column if not exists updated_by_device text;

create or replace function public.bump_session_version_and_server_time()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
  else
    new.version := coalesce(old.version, 0) + 1;
  end if;

  new.updated_at_server := now();
  return new;
end;
$$;

drop trigger if exists trg_sessions_version_server_time on public.sessions;
create trigger trg_sessions_version_server_time
before insert or update on public.sessions
for each row
execute function public.bump_session_version_and_server_time();

comment on column public.sessions.version is
'Artan versiyon numarası; merge kararında cihaz saatinden önce kullanılır.';

comment on column public.sessions.updated_at_server is
'Sunucu zamanı. updated_at (istemci) yerine conflict çözümünde tercih edilir.';
