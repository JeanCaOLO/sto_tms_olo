-- Rollback del 71 solo antes de uso. No borra resoluciones ya registradas.
begin;
set local lock_timeout='5s';
do $$
begin
 if to_regclass('public.tbl_return_incident_resolutions') is not null then
  if exists (select 1 from public.tbl_return_incident_resolutions) then
   raise exception 'No se puede eliminar historial de resoluciones existente';
  end if;
 end if;
end;
$$;
drop trigger if exists tr_return_leaves_review_75 on public.tbl_returns;
drop table if exists public.tbl_return_incident_resolutions;
drop function if exists public.guard_return_leaves_review_75();
drop function if exists public.guard_return_incident_resolution_75();
drop function if exists public.check_return_incident_resolution_75();
commit;
