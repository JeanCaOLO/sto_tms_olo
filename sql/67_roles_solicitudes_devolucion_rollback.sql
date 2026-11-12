begin;
-- Solo Jean. Rechaza rollback con uso nuevo; nunca borra decisiones, solicitudes ni devoluciones.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.tbl_return_requests, public.tbl_returns in access exclusive mode;
do $$
declare used boolean;
begin
  if exists (select 1 from public.tbl_return_requests where status <> 'pendiente_asignacion') then
    raise exception 'Rollback 67 bloqueado: existen decisiones comerciales';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='tbl_return_requests' and column_name='decided_by') then
    execute 'select exists(select 1 from public.tbl_return_requests where decided_by is not null or decided_at is not null or rejection_reason is not null)' into used;
    if used then raise exception 'Rollback 67 bloqueado: existen metadatos de decision'; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='tbl_returns' and column_name='request_item_id') then
    execute 'select exists(select 1 from public.tbl_returns where request_item_id is not null)' into used;
    if used then raise exception 'Rollback 67 bloqueado: existen vinculos de recolecta'; end if;
  end if;
end;
$$;
drop trigger if exists tr_return_request_link_67 on public.tbl_returns;
drop trigger if exists tr_return_request_decision_67 on public.tbl_return_requests;
drop function if exists public.guard_return_request_link_67();
drop function if exists public.guard_return_request_decision_67();
drop index if exists public.uq_returns_request_item_guide_67;
alter table public.tbl_returns drop column if exists request_item_id;
alter table public.tbl_return_requests drop constraint if exists ck_return_request_decision;
alter table public.tbl_return_requests drop constraint if exists ck_return_request_status;
alter table public.tbl_return_requests add constraint ck_return_request_status check (status = 'pendiente_asignacion');
alter table public.tbl_return_requests
  drop column if exists decided_by,
  drop column if exists decided_at,
  drop column if exists rejection_reason;
commit;
