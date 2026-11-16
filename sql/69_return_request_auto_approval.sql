-- 69: distingue autoaprobacion de decisiones historicas; no convierte filas existentes.
-- Preparacion local. Aplicar con el responsable antes de publicar el nuevo backend.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.tbl_return_requests add column if not exists approval_mode text not null default 'legacy';
alter table public.tbl_return_requests drop constraint if exists ck_return_request_approval_mode;
alter table public.tbl_return_requests add constraint ck_return_request_approval_mode check (
  approval_mode = 'legacy' or (
    approval_mode = 'automatic' and status = 'aprobada'
    and decided_by is not null and decided_by = requested_by and decided_at is not null
    and rejection_reason is null
  )
);
create or replace function public.guard_return_request_approval_mode_69()
returns trigger language plpgsql as $$
begin
  if NEW.approval_mode is distinct from OLD.approval_mode then
    raise exception 'El origen de aprobacion de la solicitud es inmutable' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
drop trigger if exists tr_return_request_approval_mode_69 on public.tbl_return_requests;
create trigger tr_return_request_approval_mode_69 before update of approval_mode on public.tbl_return_requests
for each row execute function public.guard_return_request_approval_mode_69();
commit;
