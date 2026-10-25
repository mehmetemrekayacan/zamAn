-- Önce supabase-v2-sessions.sql uygulanmış olmalıdır.
-- Tek transaction: sürümlü RPC, idempotency, silme işaretleri, eski yazıcıları kapatma.
begin;
create schema if not exists zaman_private;
revoke all on schema zaman_private from public, anon;
grant usage on schema zaman_private to authenticated;
create sequence if not exists public.zaman_sync_sequence;

-- Eski yardımcılar kalabilir; değişken search_path bırakma.
do $$ begin
  if to_regprocedure('public.bump_session_version_and_server_time()') is not null then
    alter function public.bump_session_version_and_server_time() set search_path = '';
  end if;
  if to_regprocedure('public.set_updated_at()') is not null then
    alter function public.set_updated_at() set search_path = '';
  end if;
end $$;

alter table public.sessions
  add column if not exists template_id text,
  add column if not exists template_name text,
  add column if not exists ekstra_sure_ms integer,
  add column if not exists toplam_duraklama_saniye integer,
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at_server timestamptz not null default now(),
  add column if not exists sync_seq bigint not null default nextval('public.zaman_sync_sequence');
alter table public.user_settings
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at_server timestamptz not null default now(),
  add column if not exists sync_seq bigint not null default nextval('public.zaman_sync_sequence');
create index if not exists idx_sessions_changes on public.sessions(user_id,sync_seq);
alter table public.sessions drop constraint if exists sessions_mod_check;
alter table public.sessions add constraint sessions_mod_check
  check (mod in ('serbest','gerisayim','EXAM_SIMULATOR','ders60mola15','deneme')) not valid;

create table if not exists public.sync_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id text not null,
  entity_key text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);
alter table public.sync_mutations enable row level security;
revoke all on public.sync_mutations from public, anon, authenticated;

-- Eski JSON kaynağı korunur; her aktarım sonucu yönetici incelemesi için saklanır.
create table if not exists public.sync_legacy_imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_hash text not null,
  source_key text not null,
  outcome text not null check (outcome in ('imported','kept_existing','invalid')),
  reason text,
  raw_value jsonb,
  created_at timestamptz not null default now(),
  primary key(user_id, source_hash, source_key)
);
alter table public.sync_legacy_imports enable row level security;
revoke all on public.sync_legacy_imports from public, anon, authenticated;

create or replace function zaman_private.validate_session_record(v public.sessions)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if v.id is null or length(btrim(v.id)) = 0
     or v.mod is null or v.mod not in ('serbest','gerisayim','EXAM_SIMULATOR','ders60mola15','deneme')
     or v.sure_gercek is null or v.sure_gercek < 0 or v.puan is null or v.puan < 0
     or v.tarih_iso is null or not isfinite(v.tarih_iso) or v.created_at is null or not isfinite(v.created_at)
     or v.duraklatma is null or v.duraklatma < 0
     or least(v.sure_plan,v.mola_saniye,v.ekstra_sure_ms,v.toplam_duraklama_saniye,v.dogru_sayisi,v.yanlis_sayisi,v.bos_sayisi) < 0 then
    raise exception 'Invalid session values' using errcode='22023';
  end if;
end;
$$;
revoke all on function zaman_private.validate_session_record(public.sessions) from public, anon, authenticated;

create or replace function zaman_private.validate_preferences(p_settings jsonb, p_deneme_config jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare v_state jsonb; v_key text; v_section jsonb; v_date date;
begin
  if jsonb_typeof(p_settings) is distinct from 'object' or jsonb_typeof(p_settings->'state') is distinct from 'object' then
    raise exception 'Invalid preference snapshot' using errcode='22023';
  end if;
  v_state := p_settings->'state';
  foreach v_key in array array['sesAçık','titreşimAçık','sessizMod'] loop
    if v_state ? v_key and jsonb_typeof(v_state->v_key) is distinct from 'boolean' then raise exception 'Invalid boolean preference: %',v_key using errcode='22023'; end if;
  end loop;
  foreach v_key in array array['kullaniciAdi','vurguRengi'] loop
    if v_state ? v_key and jsonb_typeof(v_state->v_key) is distinct from 'string' then raise exception 'Invalid text preference: %',v_key using errcode='22023'; end if;
  end loop;
  if v_state ? 'tema' and coalesce(v_state->>'tema','') not in ('light','dark','high-contrast') then raise exception 'Invalid theme' using errcode='22023'; end if;
  if v_state ? 'kısayollar' then
    if jsonb_typeof(v_state->'kısayollar') is distinct from 'object' then raise exception 'Invalid shortcuts' using errcode='22023'; end if;
    foreach v_key in array array['startStop','reset','modGeçiş'] loop
      if jsonb_typeof(v_state->'kısayollar'->v_key) is distinct from 'string' or length(v_state->'kısayollar'->>v_key)=0 then raise exception 'Invalid shortcut: %',v_key using errcode='22023'; end if;
    end loop;
  end if;
  if v_state->'sinavTarihi' is not null and v_state->'sinavTarihi' <> 'null'::jsonb then
    if coalesce(v_state->>'sinavTarihi','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid target date' using errcode='22023'; end if;
    v_date := (v_state->>'sinavTarihi')::date;
    if not isfinite(v_date) then raise exception 'Invalid target date' using errcode='22023'; end if;
  end if;
  if p_deneme_config is not null then
    if jsonb_typeof(p_deneme_config) is distinct from 'object' or p_deneme_config->>'mode' is distinct from 'deneme'
       or jsonb_typeof(p_deneme_config->'bolumler') is distinct from 'array' then raise exception 'Invalid exam configuration' using errcode='22023'; end if;
    if jsonb_array_length(p_deneme_config->'bolumler')=0 then raise exception 'Empty exam configuration' using errcode='22023'; end if;
    for v_section in select value from jsonb_array_elements(p_deneme_config->'bolumler') loop
      if jsonb_typeof(v_section->'ad') is distinct from 'string' or length(btrim(v_section->>'ad'))=0
         or jsonb_typeof(v_section->'surePlanMs') is distinct from 'number' then raise exception 'Invalid exam section' using errcode='22023'; end if;
      if (v_section->>'surePlanMs')::numeric <= 0 or (v_section->>'surePlanMs')::numeric > 9007199254740991 then raise exception 'Invalid exam duration' using errcode='22023'; end if;
    end loop;
    if p_deneme_config ? 'currentSectionIndex' then
      if jsonb_typeof(p_deneme_config->'currentSectionIndex') is distinct from 'number'
         or (p_deneme_config->>'currentSectionIndex')::numeric <> trunc((p_deneme_config->>'currentSectionIndex')::numeric)
         or (p_deneme_config->>'currentSectionIndex')::numeric < 0
         or (p_deneme_config->>'currentSectionIndex')::numeric >= jsonb_array_length(p_deneme_config->'bolumler') then raise exception 'Invalid exam section index' using errcode='22023'; end if;
    end if;
  end if;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Invalid target date' using errcode='22023';
end;
$$;
revoke all on function zaman_private.validate_preferences(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.zaman_bump_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := case when tg_op = 'INSERT' then 1 else old.version + 1 end;
  new.updated_at_server := clock_timestamp();
  new.updated_at := new.updated_at_server;
  new.sync_seq := nextval('public.zaman_sync_sequence');
  return new;
end;
$$;
drop trigger if exists trg_sessions_version_server_time on public.sessions;
drop trigger if exists zaman_sessions_revision on public.sessions;
create trigger zaman_sessions_revision before insert or update on public.sessions
  for each row execute function public.zaman_bump_revision();
drop trigger if exists zaman_settings_revision on public.user_settings;
create trigger zaman_settings_revision before insert or update on public.user_settings
  for each row execute function public.zaman_bump_revision();

create or replace function public.zaman_sync_protocol()
returns jsonb language sql stable set search_path = '' as $$ select '{"version":3}'::jsonb $$;

create or replace function zaman_private.apply_session(
  p_id text, p_mutation_id text, p_expected_version bigint, p_action text, p_payload jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_old public.sessions;
  v_new public.sessions;
  v_log public.sync_mutations;
  v_result jsonb;
  v_exists boolean;
  v_hash text := md5(jsonb_build_array(p_id, p_expected_version, p_action, p_payload)::text);
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or length(p_id) = 0 or p_mutation_id is null or length(p_mutation_id) not between 1 and 200
     or p_expected_version is null or p_expected_version < 0 or p_action is null or p_action not in ('upsert_session','delete_session') then
    raise exception 'Invalid mutation' using errcode = '22023';
  end if;
  -- Kullanıcının transaction'ları sırayla commit eder: delta imleci geç commit'i kaçırmaz.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':sync', 0));
  select * into v_log from public.sync_mutations where user_id = v_user and mutation_id = p_mutation_id;
  if found then
    if v_log.entity_key <> 'session:' || p_id or v_log.request_hash <> v_hash then
      raise exception 'Mutation id reused with different content' using errcode = '22023';
    end if;
    return v_log.result;
  end if;
  select * into v_old from public.sessions where user_id = v_user and id = p_id for update;
  v_exists := found;
  if (v_exists and (v_old.version <> p_expected_version or v_old.deleted_at is not null))
     or (not v_exists and p_expected_version <> 0) then
    -- Tekrarlanan silme de zararsızdır; eski bir upsert silme işaretini kaldıramaz.
    if v_exists and v_old.deleted_at is not null and p_action = 'delete_session' then
      v_result := jsonb_build_object('status','applied','row',to_jsonb(v_old));
    else
      v_result := jsonb_build_object('status','conflict','row',case when v_exists then to_jsonb(v_old) else null end);
    end if;
  else
    if p_action = 'upsert_session' then
      if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid payload' using errcode='22023'; end if;
      v_new := jsonb_populate_record(v_old, p_payload || jsonb_build_object(
        'id',p_id,'user_id',v_user,'deleted_at',null,'created_at',coalesce(v_old.created_at,(p_payload->>'created_at')::timestamptz,now())
      ));
      perform zaman_private.validate_session_record(v_new);
    else
      v_new := v_old;
      if not v_exists then
        v_new.id := p_id; v_new.user_id := v_user; v_new.mod := 'serbest';
        v_new.sure_gercek := 0; v_new.puan := 0; v_new.duraklatma := 0;
        v_new.tarih_iso := now(); v_new.created_at := now();
      end if;
      v_new.deleted_at := clock_timestamp();
    end if;
    if not v_exists then
      insert into public.sessions select v_new.* returning * into v_new;
    else
      update public.sessions set
        mod=v_new.mod,sure_plan=v_new.sure_plan,sure_gercek=v_new.sure_gercek,puan=v_new.puan,
        tarih_iso=v_new.tarih_iso,not_text=v_new.not_text,duraklatma=v_new.duraklatma,
        mola_saniye=v_new.mola_saniye,deneme_molalar=v_new.deneme_molalar,
        dogru_sayisi=v_new.dogru_sayisi,yanlis_sayisi=v_new.yanlis_sayisi,bos_sayisi=v_new.bos_sayisi,
        bolumler=v_new.bolumler,template_id=v_new.template_id,template_name=v_new.template_name,
        ekstra_sure_ms=v_new.ekstra_sure_ms,toplam_duraklama_saniye=v_new.toplam_duraklama_saniye,
        deleted_at=v_new.deleted_at
      where user_id=v_user and id=p_id returning * into v_new;
    end if;
    v_result := jsonb_build_object('status','applied','row',to_jsonb(v_new));
  end if;
  insert into public.sync_mutations(user_id,mutation_id,entity_key,request_hash,result)
    values(v_user,p_mutation_id,'session:' || p_id,v_hash,v_result);
  return v_result;
end;
$$;

create or replace function zaman_private.apply_settings(
  p_mutation_id text, p_expected_version bigint, p_settings jsonb, p_deneme_config jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_old public.user_settings; v_new public.user_settings;
  v_log public.sync_mutations; v_exists boolean; v_result jsonb;
  v_hash text := md5(jsonb_build_array(p_expected_version,p_settings,p_deneme_config)::text);
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_mutation_id is null or length(p_mutation_id) not between 1 and 200 or p_expected_version is null or p_expected_version < 0
     or jsonb_typeof(p_settings) is distinct from 'object'
     or (p_deneme_config is not null and jsonb_typeof(p_deneme_config) <> 'object') then
    raise exception 'Invalid settings mutation' using errcode='22023';
  end if;
  perform zaman_private.validate_preferences(p_settings,p_deneme_config);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':sync', 0));
  select * into v_log from public.sync_mutations where user_id=v_user and mutation_id=p_mutation_id;
  if found then
    if v_log.entity_key <> 'settings' or v_log.request_hash <> v_hash then raise exception 'Mutation id reused' using errcode='22023'; end if;
    return v_log.result;
  end if;
  select * into v_old from public.user_settings where user_id=v_user for update;
  v_exists := found;
  if (v_exists and v_old.version <> p_expected_version) or (not v_exists and p_expected_version <> 0) then
    v_result := jsonb_build_object('status','conflict','row',case when v_exists then to_jsonb(v_old) else null end);
  else
    insert into public.user_settings(user_id,settings,deneme_config,timer_storage)
      values(v_user,p_settings,p_deneme_config,null)
    on conflict(user_id) do update set settings=excluded.settings,deneme_config=excluded.deneme_config
    returning * into v_new;
    v_result := jsonb_build_object('status','applied','row',to_jsonb(v_new));
  end if;
  insert into public.sync_mutations(user_id,mutation_id,entity_key,request_hash,result)
    values(v_user,p_mutation_id,'settings',v_hash,v_result);
  return v_result;
end;
$$;

-- Data API yüzeyi invoker'dır; yetkili yazma gövdesi açığa çıkarılmayan şemadadır.
create or replace function public.zaman_apply_session(
  p_id text, p_mutation_id text, p_expected_version bigint, p_action text, p_payload jsonb default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select zaman_private.apply_session(p_id,p_mutation_id,p_expected_version,p_action,p_payload);
$$;
create or replace function public.zaman_apply_settings(
  p_mutation_id text, p_expected_version bigint, p_settings jsonb, p_deneme_config jsonb default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select zaman_private.apply_settings(p_mutation_id,p_expected_version,p_settings,p_deneme_config);
$$;
revoke all on function zaman_private.apply_session(text,text,bigint,text,jsonb) from public, anon;
revoke all on function zaman_private.apply_settings(text,bigint,jsonb,jsonb) from public, anon;
grant execute on function zaman_private.apply_session(text,text,bigint,text,jsonb) to authenticated;
grant execute on function zaman_private.apply_settings(text,bigint,jsonb,jsonb) to authenticated;

-- sync_data yalnızca bilinen sunucu user_id'siyle aktarılır. Mevcut v2 kayıtları
-- asla eski blobla ezilmez. Hatalı tek girdi bütün geçişi veya kaynağı kaybettirmez.
do $$
declare
  v_source record; v_entry record; v_row public.sessions;
  v_hash text; v_key text; v_outcome text; v_reason text; v_written text;
  v_settings jsonb; v_deneme jsonb; v_user uuid;
begin
  if to_regclass('public.sync_data') is null then return; end if;
  for v_source in select user_id,data from public.sync_data loop
    v_hash := md5(v_source.data::text);
    if jsonb_typeof(v_source.data) is distinct from 'object' then
      insert into public.sync_legacy_imports(user_id,source_hash,source_key,outcome,reason,raw_value)
        values(v_source.user_id,v_hash,'payload','invalid','Legacy payload must be an object',v_source.data) on conflict do nothing;
      continue;
    end if;
    if jsonb_typeof(v_source.data->'sessions') = 'array' then
      for v_entry in select value,ordinality from jsonb_array_elements(v_source.data->'sessions') with ordinality loop
        v_key := 'session:' || v_entry.ordinality::text;
        if exists(select 1 from public.sync_legacy_imports where user_id=v_source.user_id and source_hash=v_hash and source_key=v_key) then continue; end if;
        v_outcome := 'imported'; v_reason := null; v_written := null;
        begin
          if jsonb_typeof(v_entry.value) is distinct from 'object' then raise exception 'Session must be an object'; end if;
          v_row := jsonb_populate_record(null::public.sessions, jsonb_build_object(
            'id',v_entry.value->>'id','user_id',v_source.user_id,'mod',v_entry.value->>'mod',
            'sure_plan',v_entry.value->'surePlan','sure_gercek',v_entry.value->'sureGercek',
            'puan',v_entry.value->'puan','tarih_iso',v_entry.value->>'tarihISO','not_text',v_entry.value->>'not',
            'duraklatma',v_entry.value->'duraklatmaSayisi','mola_saniye',v_entry.value->'molaSaniye',
            'deneme_molalar',v_entry.value->'denemeMolalarSaniye','dogru_sayisi',v_entry.value->'dogruSayisi',
            'yanlis_sayisi',v_entry.value->'yanlisSayisi','bos_sayisi',v_entry.value->'bosSayisi',
            'bolumler',v_entry.value->'bolumler','template_id',v_entry.value->>'templateId',
            'template_name',v_entry.value->>'templateName','ekstra_sure_ms',v_entry.value->'ekstraSureMs',
            'toplam_duraklama_saniye',v_entry.value->'toplamDuraklamaSureSaniye',
            'created_at',coalesce(v_entry.value->>'createdAt',v_entry.value->>'tarihISO')
          ));
          perform zaman_private.validate_session_record(v_row);
          insert into public.sessions select v_row.* on conflict(id,user_id) do nothing returning id into v_written;
          if v_written is null then v_outcome := 'kept_existing'; end if;
        exception when others then v_outcome := 'invalid'; v_reason := sqlerrm;
        end;
        insert into public.sync_legacy_imports(user_id,source_hash,source_key,outcome,reason,raw_value)
          values(v_source.user_id,v_hash,v_key,v_outcome,v_reason,v_entry.value);
      end loop;
    elsif v_source.data ? 'sessions' then
      insert into public.sync_legacy_imports(user_id,source_hash,source_key,outcome,reason,raw_value)
        values(v_source.user_id,v_hash,'sessions','invalid','sessions must be an array',v_source.data->'sessions')
        on conflict do nothing;
    end if;
    if (v_source.data->>'settingsStorage' is not null or v_source.data->>'denemeConfig' is not null)
       and not exists(select 1 from public.sync_legacy_imports where user_id=v_source.user_id and source_hash=v_hash and source_key='settings') then
      v_outcome := 'imported'; v_reason := null; v_user := null;
      begin
        v_settings := coalesce((v_source.data->>'settingsStorage')::jsonb,'{"state":{},"version":0}'::jsonb);
        v_deneme := (v_source.data->>'denemeConfig')::jsonb;
        perform zaman_private.validate_preferences(v_settings,v_deneme);
        insert into public.user_settings(user_id,settings,deneme_config,timer_storage)
          values(v_source.user_id,v_settings,v_deneme,null) on conflict(user_id) do nothing returning user_id into v_user;
        if v_user is null then v_outcome := 'kept_existing'; end if;
      exception when others then v_outcome := 'invalid'; v_reason := sqlerrm;
      end;
      insert into public.sync_legacy_imports(user_id,source_hash,source_key,outcome,reason,raw_value)
        values(v_source.user_id,v_hash,'settings',v_outcome,v_reason,
          jsonb_build_object('settingsStorage',v_source.data->'settingsStorage','denemeConfig',v_source.data->'denemeConfig'));
    end if;
  end loop;
end;
$$;

-- Eski sürümlerin koşulsuz upsert/update/delete ile sürüm kontrolünü atlamasını engeller.
revoke insert,update,delete,truncate,references,trigger on public.sessions,public.user_settings from public,anon,authenticated;
grant select on public.sessions,public.user_settings to authenticated;
do $$ begin
  if to_regclass('public.sync_data') is not null then
    revoke insert,update,delete,truncate,references,trigger on public.sync_data from public,anon,authenticated;
  end if;
end $$;
-- Tablo ACL'sini kaldırmak, önceden verilmiş sütun ACL'sini kaldırmaz.
do $$
declare v_table text; v_columns text; v_role text;
begin
  foreach v_table in array array['sessions','user_settings','sync_data'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    select string_agg(format('%I',attname),',') into v_columns
      from pg_attribute where attrelid=to_regclass('public.' || v_table) and attnum>0 and not attisdropped;
    execute format('revoke insert (%s), update (%s) on table public.%I from public,anon,authenticated',v_columns,v_columns,v_table);
    foreach v_role in array array['anon','authenticated'] loop
      if has_table_privilege(v_role,'public.' || v_table,'INSERT,UPDATE,DELETE,TRUNCATE')
         or has_any_column_privilege(v_role,'public.' || v_table,'INSERT,UPDATE') then
        raise exception 'Inherited write privileges remain for % on %. Review role grants before migration.',v_role,v_table using errcode='42501';
      end if;
    end loop;
  end loop;
end;
$$;
-- Yazma artık yalnızca RPC üzerinden yapılır. Okuma sahibi sorgu başına bir kez hesaplanır.
do $$
declare v_table text; v_policy record;
begin
  foreach v_table in array array['sessions','user_settings','sync_data'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security',v_table);
    for v_policy in select policyname from pg_policies where schemaname='public' and tablename=v_table loop
      execute format('drop policy %I on public.%I',v_policy.policyname,v_table);
    end loop;
    execute format('create policy zaman_read_own on public.%I for select to authenticated using ((select auth.uid()) = user_id)',v_table);
  end loop;
end;
$$;
revoke all on function public.zaman_sync_protocol() from public,anon;
revoke all on function public.zaman_apply_session(text,text,bigint,text,jsonb) from public,anon;
revoke all on function public.zaman_apply_settings(text,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.zaman_sync_protocol() to authenticated;
grant execute on function public.zaman_apply_session(text,text,bigint,text,jsonb) to authenticated;
grant execute on function public.zaman_apply_settings(text,bigint,jsonb,jsonb) to authenticated;
commit;
