-- salt kullanıcı testi değil; gerçek DB rolleriyle protokol testi. Tüm değişiklikler geri alınır.
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_settings order by user_id limit 1),true);
set local role authenticated;
do $probe$
declare
  v_id text := '__stage6_probe__' || gen_random_uuid()::text;
  v_end bigint := floor(extract(epoch from now())*1000)::bigint;
  v_intervals jsonb; v_payload jsonb; v_result jsonb; v_rejected boolean;
begin
  if not (public.zaman_sync_protocol()->'features' ? 'work_intervals') then raise exception 'Feature missing'; end if;
  v_intervals := jsonb_build_array(jsonb_build_object('start',v_end-60000,'end',v_end-40000),jsonb_build_object('start',v_end-20000,'end',v_end));
  v_payload := jsonb_build_object('mod','serbest','sure_gercek',40,'puan',1,'duraklatma',1,'tarih_iso',to_timestamp(v_end::numeric/1000),'work_intervals',v_intervals);
  v_result := public.zaman_apply_session(v_id,v_id||':create',0,'upsert_session',v_payload);
  if v_result->>'status'<>'applied' or v_result->'row'->'work_intervals'<>v_intervals then raise exception 'Interval create failed'; end if;
  if not exists(select 1 from public.sessions where id=v_id and work_intervals=v_intervals) then raise exception 'Interval read failed'; end if;
  if public.zaman_apply_session(v_id,v_id||':create',0,'upsert_session',v_payload) <> v_result then raise exception 'Idempotency failed'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':legacy-note',1,'upsert_session',(v_payload-'work_intervals')||'{"not_text":"Old client"}');
  if v_result->'row'->'work_intervals'<>v_intervals then raise exception 'Legacy note lost intervals'; end if;
  v_result := public.zaman_apply_session(v_id,v_id||':legacy-time',2,'upsert_session',(v_payload-'work_intervals')||'{"sure_gercek":50}');
  if v_result->'row'->'work_intervals' <> 'null'::jsonb then raise exception 'Legacy duration retained invalid intervals'; end if;
  v_rejected := false;
  begin
    perform public.zaman_apply_session(v_id||':bad',v_id||':bad',0,'upsert_session',v_payload||'{"sure_gercek":99}');
  exception when invalid_parameter_value then v_rejected := true; end;
  if not v_rejected then raise exception 'Invalid timeline accepted'; end if;
  v_rejected := false;
  begin
    update public.sessions set work_intervals=null where id=v_id;
  exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Direct interval write exposed'; end if;
  v_rejected := false;
  begin perform zaman_private.validate_work_intervals(v_intervals,40,to_timestamp(v_end::numeric/1000));
  exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Validation helper exposed'; end if;
end
$probe$;
rollback;
select 'passed; all probe writes rolled back' as work_interval_smoke;
