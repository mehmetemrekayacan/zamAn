-- v3 RPC üzerine ek özellik. Eski seanslar ve istemciler korunur.
begin;
set local lock_timeout = '10s';
alter table public.sessions add column if not exists work_intervals jsonb;
comment on column public.sessions.work_intervals is 'Net çalışma aralıkları: epoch ms [start,end). NULL eski/bilinmeyen çizgi, [] sıfır çalışma.';

create or replace function zaman_private.validate_work_intervals(p_intervals jsonb, p_seconds integer, p_ended_at timestamptz)
returns void language plpgsql immutable set search_path = '' as $$
declare v_part jsonb; v_start numeric; v_end numeric; v_previous numeric := 0; v_total numeric := 0;
begin
  if p_intervals is null then return; end if;
  if jsonb_typeof(p_intervals) <> 'array' then raise exception 'Invalid work intervals' using errcode='22023'; end if;
  for v_part in select value from jsonb_array_elements(p_intervals) loop
    if jsonb_typeof(v_part) <> 'object' then raise exception 'Invalid work interval entry' using errcode='22023'; end if;
    if (select count(*) from jsonb_object_keys(v_part)) <> 2
       or jsonb_typeof(v_part->'start') is distinct from 'number'
       or jsonb_typeof(v_part->'end') is distinct from 'number' then
      raise exception 'Invalid work interval fields' using errcode='22023';
    end if;
    v_start := (v_part->>'start')::numeric; v_end := (v_part->>'end')::numeric;
    if v_start < v_previous or v_end <= v_start or v_start <> trunc(v_start) or v_end <> trunc(v_end)
       or v_end > 9007199254740991 or v_end > extract(epoch from p_ended_at)*1000 then
      raise exception 'Invalid work interval range' using errcode='22023';
    end if;
    v_total := v_total + v_end - v_start;
    v_previous := v_end;
  end loop;
  if round(v_total / 1000) <> p_seconds then raise exception 'Work interval duration mismatch' using errcode='22023'; end if;
end;
$$;
revoke all on function zaman_private.validate_work_intervals(jsonb,integer,timestamptz) from public,anon,authenticated;

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
  perform zaman_private.validate_work_intervals(v.work_intervals,v.sure_gercek,v.tarih_iso);
end;
$$;

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
      -- Eski istemci zaman çizgisi göndermeden süre/tarihi değiştirirse eski
      -- aralıkları yeni içeriğin kesin ölçümü gibi tutma. Not/analiz düzenlemesi korur.
      if not (p_payload ? 'work_intervals') and v_exists
         and (v_new.sure_gercek is distinct from v_old.sure_gercek
           or v_new.tarih_iso is distinct from v_old.tarih_iso
           or v_new.mod is distinct from v_old.mod) then
        v_new.work_intervals := null;
      end if;
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
        work_intervals=v_new.work_intervals,deleted_at=v_new.deleted_at
      where user_id=v_user and id=p_id returning * into v_new;
    end if;
    v_result := jsonb_build_object('status','applied','row',to_jsonb(v_new));
  end if;
  insert into public.sync_mutations(user_id,mutation_id,entity_key,request_hash,result)
    values(v_user,p_mutation_id,'session:' || p_id,v_hash,v_result);
  return v_result;
end;
$$;

create or replace function public.zaman_sync_protocol()
returns jsonb language sql stable set search_path = '' as $$ select '{"version":3,"features":["work_intervals"]}'::jsonb $$;
commit;
