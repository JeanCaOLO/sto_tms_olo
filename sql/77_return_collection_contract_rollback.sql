-- Solo antes de usar el contrato v2. Nunca elimina historia aceptada.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
 if to_regclass('public.tbl_return_collection_events') is not null then
  if exists(select 1 from public.tbl_return_collection_events) then
   raise exception 'Rollback rechazado: existe historial de recolectas';end if;
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public'
 and table_name='tbl_return_requests' and column_name='collection_contract_version') then
  if exists(select 1 from public.tbl_return_requests where collection_contract_version=2) then
   raise exception 'Rollback rechazado: existen solicitudes del contrato directo';end if;
 end if;
end $$;
drop view if exists public.vw_return_collection_candidates;
drop view if exists public.vw_return_collection_item_balances;
drop view if exists public.vw_return_collection_assignments;
drop table if exists public.tbl_return_collection_results;
drop table if exists public.tbl_return_collection_assignments;
drop table if exists public.tbl_return_collection_allocations;
drop table if exists public.tbl_return_collection_events;
drop function if exists public.assign_return_collection_v2(uuid,uuid,uuid,uuid,uuid,uuid);
drop function if exists public.record_return_collection_evaluation_v2(uuid,uuid,uuid,uuid,text,text);
drop function if exists public.bind_return_collection_v2(uuid,uuid,uuid,uuid,uuid,uuid);
drop function if exists public.cancel_return_collection_v2(uuid,uuid,uuid,uuid,text);
drop function if exists public.lock_return_collection_request_v2(uuid,uuid,uuid);
drop function if exists public.check_return_collection_capacity_v2(uuid);
drop function if exists public.guard_return_collection_event_77();
drop function if exists public.guard_return_collection_assignment_77();
drop function if exists public.check_return_collection_complete_77();
drop function if exists public.guard_return_collection_allocation_77();
drop function if exists public.guard_return_collection_result_77();
drop function if exists public.close_return_collection_pickup_77();
alter table public.tbl_return_requests drop column if exists collection_contract_version;
commit;
