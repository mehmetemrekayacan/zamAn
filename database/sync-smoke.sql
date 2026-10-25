-- Canlı v3 protokol kontrolü. Bütün kayıt/ayar değişiklikleri ROLLBACK edilir.
-- En az iki mevcut hesap gerektirir; hesapları veya giriş bilgilerini değiştirmez.
begin;
set local statement_timeout = '30s';
select set_config('zaman.test_owner_a',(select user_id::text from public.user_settings order by user_id limit 1),true);
select set_config('zaman.test_owner_b',(select user_id::text from public.user_settings order by user_id desc limit 1),true);
select set_config('zaman.test_id','__stage4_probe__' || gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('zaman.test_owner_a'),true);
set local role authenticated;
do $probe$
declare
  v_id text := current_setting('zaman.test_id');
  v_payload jsonb := '{"mod":"serbest","sure_gercek":60,"puan":1,"duraklatma":0,"tarih_iso":"2026-10-26T00:00:00Z","not_text":"Geçici protokol kontrolü"}';
  v_first jsonb; v_result jsonb; v_version bigint; v_rejected boolean;
begin
  if current_setting('zaman.test_owner_a') = current_setting('zaman.test_owner_b') then raise exception 'Two accounts required'; end if;
  if public.zaman_sync_protocol()->>'version' <> '3' then raise exception 'Wrong protocol'; end if;
  v_first := public.zaman_apply_session(v_id,v_id||':create',0,'upsert_session',v_payload);
  if v_first->>'status' <> 'applied' or (v_first->'row'->>'version')::bigint <> 1 then raise exception 'Create failed'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':create',0,'upsert_session',v_payload);
  if v_result <> v_first then raise exception 'Idempotent retry failed'; end if;
  v_rejected := false;
  begin
    perform public.zaman_apply_session(v_id,v_id||':create',0,'upsert_session',v_payload||'{"puan":2}');
  exception when invalid_parameter_value then v_rejected := true; end;
  if not v_rejected then raise exception 'Mutation reuse was accepted'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':edit-a',1,'upsert_session',v_payload||'{"puan":2}');
  if v_result->>'status'<>'applied' or (v_result->'row'->>'version')::bigint<>2 then raise exception 'Edit failed'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':edit-b',1,'upsert_session',v_payload||'{"puan":3}');
  if v_result->>'status'<>'conflict' or (v_result->'row'->>'puan')::integer<>2 then raise exception 'Stale overwrite accepted'; end if;
  if not exists(select 1 from public.sessions where id=v_id and sync_seq>(v_first->'row'->>'sync_seq')::bigint) then raise exception 'Delta failed'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':delete',2,'delete_session',null);
  if v_result->'row'->>'deleted_at' is null then raise exception 'Tombstone missing'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':resurrect',3,'upsert_session',v_payload);
  if v_result->>'status'<>'conflict' then raise exception 'Deleted session revived'; end if;
  v_version := (select version from public.user_settings where user_id=auth.uid());
  v_result := public.zaman_apply_settings(v_id||':prefs',v_version,'{"state":{"tema":"dark"},"version":0}',null);
  if v_result->>'status'<>'applied' then raise exception 'Settings write failed'; end if;
  v_result := public.zaman_apply_settings(v_id||':prefs-stale',v_version,'{"state":{"tema":"light"},"version":0}',null);
  if v_result->>'status'<>'conflict' then raise exception 'Stale settings accepted'; end if;
  v_rejected := false;
  begin update public.sessions set puan=999 where id=v_id;
  exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Direct writer accepted'; end if;
  v_rejected := false;
  begin perform 1 from public.sync_mutations limit 1;
  exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Mutation log exposed'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('zaman.test_owner_b'),true);
  if exists(select 1 from public.sessions where id=v_id) then raise exception 'Other account can read A'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':other-account',0,'upsert_session',v_payload||jsonb_build_object('user_id',current_setting('zaman.test_owner_a')));
  if v_result->'row'->>'user_id' <> current_setting('zaman.test_owner_b') then raise exception 'Payload owner spoofing accepted'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  v_rejected := false;
  begin perform public.zaman_apply_session(v_id,v_id||':no-uid',0,'delete_session',null);
  exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Missing auth accepted'; end if;
end
$probe$;
reset role;
set local role anon;
do $probe$
declare v_rejected boolean := false;
begin
  begin perform public.zaman_sync_protocol();
  exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Anon RPC exposed'; end if;
end
$probe$;
rollback;
select 'passed; test data and settings rolled back' as protocol_smoke_test;

