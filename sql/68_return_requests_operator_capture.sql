-- 68: captura por Cliente para su empresa, o por gerente/superusuario autorizado.
-- Preparada para entrega; no se aplica automaticamente ni modifica datos existentes.
-- Backend conserva permiso create, organizacion, pais y scopes; el autor sigue siendo el usuario real.
-- Requiere SQL67. Conserva identidad historica, decisiones y trigger existentes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.guard_return_request_decision_67()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' then
    if row(NEW.id, NEW.organization_id, NEW.customer_id, NEW.requested_by, NEW.request_number)
       is distinct from row(OLD.id, OLD.organization_id, OLD.customer_id, OLD.requested_by, OLD.request_number) then
      raise exception 'La identidad y el destino historico de la solicitud son inmutables' using errcode = '23514';
    end if;
    if OLD.status in ('aprobada', 'rechazada') and
       row(NEW.status, NEW.decided_by, NEW.decided_at, NEW.rejection_reason)
       is distinct from row(OLD.status, OLD.decided_by, OLD.decided_at, OLD.rejection_reason) then
      raise exception 'La decision comercial ya fue registrada' using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.tbl_customers c join public.tbl_app_users u
        on u.id = NEW.requested_by and u.organization_id = c.organization_id
      where c.id = NEW.customer_id and c.organization_id = NEW.organization_id
        and (u.customer_id = c.id or exists (
          select 1 from public.tbl_roles creator_role
          where creator_role.id = u.role_id
            and lower(btrim(creator_role.name)) in ('gerente','superadministrador','superusuario','administrador','admin')
        ))
    ) then
      raise exception 'Empresa o solicitante incompatibles con la organizacion/asignacion' using errcode = '23514';
    end if;
  end if;
  if NEW.decided_by is not null and not exists (
    select 1 from public.tbl_app_users u
    where u.id = NEW.decided_by and u.organization_id = NEW.organization_id
  ) then
    raise exception 'El decisor debe pertenecer a la organizacion de la solicitud' using errcode = '23514';
  end if;
  return NEW;
end;
$$;

commit;
