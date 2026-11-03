-- ============================================================================
-- 56 — Usuarios transportista: un usuario con rol Transportista pertenece a UNA empresa transportista
--      y solo ve/decide las proformas de esa empresa (el servidor lo hace cumplir, ver tarifas/app.py).
--
--   app_users.carrier_id    empresa transportista del usuario (NULL para el resto de roles)
--   roles                   'Transportista' y 'Gerente' (si no existen)
--   role_permissions        ambos roles: módulo tarifas.proformas (ver + editar, para decidir)
--
-- Aplicar ANTES de desplegar el backend: tms_common.permissions ya lee app_users.carrier_id.
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/56_proformas_usuarios_transportista.sql [--execute]
-- Idempotente.
-- ============================================================================

begin;

alter table app_users add column if not exists carrier_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_app_user_carrier') then
    alter table app_users
      add constraint fk_app_user_carrier foreign key (carrier_id) references carriers (id) on delete restrict;
  end if;
end $$;
create index if not exists idx_app_user_carrier on app_users (carrier_id) where carrier_id is not null;

insert into roles (name, description)
select v.name, v.description
  from (values
    ('Transportista', 'Empresa transportista: aprueba o rechaza las proformas de su empresa'),
    ('Gerente', 'Gerencia: aprueba o rechaza proformas ya aprobadas por el transportista')
  ) as v(name, description)
 where not exists (select 1 from roles r where lower(r.name) = lower(v.name));

insert into role_permissions (role_id, module_key, action)
select r.id, 'tarifas.proformas', a.action
  from roles r
 cross join (values ('view'), ('edit')) as a(action)
 where r.name in ('Transportista', 'Gerente')
   and not exists (
     select 1 from role_permissions p
      where p.role_id = r.id and p.module_key = 'tarifas.proformas' and p.action = a.action);

commit;
