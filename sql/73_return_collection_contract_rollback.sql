begin;
set local lock_timeout='5s';
do $$ declare t text; used boolean; begin
 foreach t in array array['tbl_return_collection_results','tbl_return_collection_assignments',
   'tbl_return_collection_events','tbl_return_request_outbox'] loop
  if to_regclass('public.'||t) is not null then
   execute format('select exists(select 1 from public.%I)',t) into used;
   if used then raise exception 'SQL73 utilizado: % contiene historial; rollback rechazado',t; end if;
  end if;
 end loop;
end $$;
drop table if exists public.tbl_return_collection_results;
drop function if exists public.guard_return_collection_result_73();
drop table if exists public.tbl_return_collection_assignments;
drop table if exists public.tbl_return_collection_events;
drop table if exists public.tbl_return_request_outbox;
drop function if exists public.guard_return_outbox_identity_73();
drop function if exists public.guard_return_contract_history_73();
commit;
