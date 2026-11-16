-- Conserva la atribucion automatica cuando ya fue utilizada; no degrada su historial.
begin;
set local lock_timeout = '5s';
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public'
      and table_name='tbl_return_requests' and column_name='approval_mode') then
    if exists (select 1 from public.tbl_return_requests where approval_mode='automatic') then
      raise exception 'No se puede retirar el origen automatico de solicitudes existentes';
    end if;
  end if;
end;
$$;
drop trigger if exists tr_return_request_approval_mode_69 on public.tbl_return_requests;
drop function if exists public.guard_return_request_approval_mode_69();
alter table public.tbl_return_requests drop constraint if exists ck_return_request_approval_mode;
alter table public.tbl_return_requests drop column if exists approval_mode;
commit;
