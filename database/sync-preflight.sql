-- Salt okunur: migration öncesinde ve sonrasında hedef projede çalıştırılır.
-- Kimlik bilgisi, e-posta, seans notu veya kullanıcı veri içeriği döndürmez.
select current_database() as database_name, current_setting('server_version') as postgres_version;
select current_setting('pgrst.db_schemas',true) as configured_api_schemas;

select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls_enabled,
       pg_total_relation_size(c.oid) as total_bytes,
       has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') as anon_table_write,
       has_any_column_privilege('anon',c.oid,'INSERT,UPDATE') as anon_column_write,
       has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as auth_table_write,
       has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE') as auth_column_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('sessions','user_settings','sync_data','sync_mutations','sync_legacy_imports')
order by c.relname;

select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name in ('sessions','user_settings')
order by table_name,ordinal_position;

select c.relname as table_name,k.conname as constraint_name,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('sessions','user_settings','sync_data')
order by c.relname,k.conname;

select n.nspname as schema_name,p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,p.proconfig as function_settings,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('zaman_sync_protocol','zaman_apply_session','zaman_apply_settings'))
   or (n.nspname='zaman_private' and p.proname in ('apply_session','apply_settings','validate_session_record','validate_preferences'))
order by schema_name,function_name;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('sessions','user_settings','sync_data','sync_mutations','sync_legacy_imports')
order by tablename,policyname;
