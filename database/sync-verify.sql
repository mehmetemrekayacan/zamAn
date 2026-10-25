-- Salt okunur: yalnızca v3 geçişi tamamlandıktan sonra çalıştırılır.
select public.zaman_sync_protocol() as protocol;

select count(*) as total_sessions,
       count(*) filter(where deleted_at is null) as active_sessions,
       count(*) filter(where deleted_at is not null) as deletion_markers,
       count(*) filter(where version<1 or sync_seq<1 or sure_gercek<0 or puan<0
         or not isfinite(tarih_iso) or not isfinite(created_at)
         or mod not in ('serbest','gerisayim','EXAM_SIMULATOR','ders60mola15','deneme')) as invalid_sessions
from public.sessions;

select outcome,count(*) as entries from public.sync_legacy_imports group by outcome order by outcome;
select reason,count(*) as entries from public.sync_legacy_imports where outcome='invalid' group by reason order by entries desc;

select count(*) as legacy_writer_access_remaining
from (values('sessions'),('user_settings'),('sync_data')) as t(table_name)
cross join (values('anon'),('authenticated')) as r(role_name)
where to_regclass('public.' || t.table_name) is not null
  and (has_table_privilege(r.role_name,to_regclass('public.' || t.table_name),'INSERT,UPDATE,DELETE')
    or has_any_column_privilege(r.role_name,to_regclass('public.' || t.table_name),'INSERT,UPDATE'));

select n.nspname as schema_name,p.proname as function_name,p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('zaman_sync_protocol','zaman_apply_session','zaman_apply_settings'))
   or (n.nspname='zaman_private' and p.proname in ('apply_session','apply_settings'))
order by schema_name,function_name;
