-- ============================================================================
-- 15 — Matriz de permisos por rol: qué módulos ve, qué acciones hace y qué
--      países ve.
--
-- Pedido del usuario (2026-09-24). Tres piezas:
--   app_modules       catálogo de módulos = un ítem por entrada del menú.
--   role_permissions  rol × módulo × acción (view/create/edit/delete/export).
--   role_countries    países que ve el rol cuando roles.all_countries = false.
-- Los roles administradores (SuperAdministrador, SuperUsuario, Admin,
-- Administrador) tienen todo por código y no necesitan filas.
-- Solo agrega objetos nuevos (no toca nada que usen otras ramas).
-- Idempotente.
-- ============================================================================

begin;

create table if not exists app_modules (
  key        text primary key,
  group_key  text,
  path       text not null,
  sort_order int  not null
);

insert into app_modules (key, group_key, path, sort_order) values
  ('dashboard',      null,        '/dashboard',          10),
  ('pedidos',        null,        '/pedidos',            20),
  ('devoluciones',   null,        '/devoluciones',       30),
  ('guias',          null,        '/guias',              40),
  ('planificacion',  null,        '/planificacion',      50),
  ('tracking',       null,        '/tracking',           60),
  ('tarifas',        null,        '/liquidaciones',      70),
  ('oms.panel',      'oms',       '/oms/panel',          80),
  ('oms.cola',       'oms',       '/oms/cola',           81),
  ('oms.reglas',     'oms',       '/oms/reglas',         82),
  ('oms.simulador',  'oms',       '/oms/simulador',      83),
  ('oms.rutas',      'oms',       '/oms/rutas-despacho', 84),
  ('oms.auditoria',  'oms',       '/oms/auditoria',      85),
  ('paises',         'catalogos', '/paises',             90),
  ('zonas',          'catalogos', '/zonas',              91),
  ('transportistas', 'catalogos', '/transportistas',     92),
  ('vehiculos',      'catalogos', '/vehiculos',          93),
  ('conductores',    'catalogos', '/conductores',        94),
  ('licencias',      'catalogos', '/licencias',          95),
  ('clientes',       'catalogos', '/clientes',           96),
  ('puntos_entrega', 'catalogos', '/tiendas',            97),
  ('contratos',      null,        '/contratos',         100),
  ('reportes',       null,        '/reportes',          110),
  ('configuracion',  null,        '/configuracion',     120)
on conflict (key) do update
  set group_key = excluded.group_key, path = excluded.path, sort_order = excluded.sort_order;

create table if not exists role_permissions (
  role_id    uuid not null references roles(id) on delete cascade,
  module_key text not null references app_modules(key) on delete cascade,
  action     text not null check (action in ('view', 'create', 'edit', 'delete', 'export')),
  primary key (role_id, module_key, action)
);

alter table roles add column if not exists all_countries boolean not null default true;

create table if not exists role_countries (
  role_id    uuid not null references roles(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  primary key (role_id, country_id)
);

-- Punto de partida de los roles no administradores, según su descripción.
-- Se siembra solo si el rol todavía no tiene ninguna fila (no pisa lo editado).
with seed(role_name, module_key, action) as (
  select 'Operaciones', m.key, a.action
  from app_modules m
  cross join (values ('view'), ('create'), ('edit'), ('delete'), ('export')) a(action)
  where m.key not in ('configuracion', 'contratos', 'reportes')
  union all select 'Chofer',  'tracking', 'view'
  union all select 'Cliente', 'pedidos',  'view'
  union all select 'Cliente', 'tracking', 'view'
)
insert into role_permissions (role_id, module_key, action)
select r.id, s.module_key, s.action
from seed s
join roles r on r.name = s.role_name
where not exists (select 1 from role_permissions rp where rp.role_id = r.id)
on conflict do nothing;

commit;
