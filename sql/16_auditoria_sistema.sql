-- ============================================================================
-- 16 — Bitácora de auditoría del sistema: cada acción de un usuario y cada
--      cambio automático, con fecha y hora.
--
-- Pedido del usuario (2026-09-24): registrar para control y auditoría cada
-- acción que un usuario hace en el sistema y también lo que el sistema hace
-- solo (ingestas, sincronizaciones, procesos automáticos).
--
-- Arquitectura (ver docs/decisions/0003-bitacora-auditoria.md):
--   audit.events          bitácora de SOLO INSERCIÓN (un trigger rechaza
--                         UPDATE/DELETE/TRUNCATE).
--   audit.tracked_tables  tablas auditadas + su módulo de la matriz de
--                         permisos + columna id + columnas ocultas.
--   audit.capture_row_change()  trigger AFTER INSERT/UPDATE/DELETE por fila:
--                         guarda el antes/después (o solo lo que cambió).
--                         Captura TODA escritura, venga de la API, de un
--                         script o de otra rama: no se puede saltar.
--   Quién: el backend fija por request `tms.audit_actor` (JSON con usuario,
--   request, IP) en la conexión; sin eso el cambio queda como `system` con
--   el application_name / usuario de BD como origen.
--   Eventos que no son filas (login, logout, exportar, abrir un módulo) los
--   inserta el backend directo en audit.events.
-- Solo agrega objetos nuevos. Idempotente.
-- ============================================================================

begin;

create schema if not exists audit;

create table if not exists audit.events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default clock_timestamp(),
  actor_type   text not null check (actor_type in ('user', 'system', 'anonymous')),
  auth_user_id uuid,
  app_user_id  uuid,
  actor_email  text,
  role_name    text,
  source       text not null,
  action       text not null,
  module_key   text,
  entity_table text,
  entity_id    text,
  changes      jsonb,
  before       jsonb,
  after        jsonb,
  request_id   text,
  ip           text,
  user_agent   text,
  metadata     jsonb
);

create index if not exists events_occurred_at_idx on audit.events (occurred_at desc);
create index if not exists events_entity_idx on audit.events (entity_table, entity_id);
create index if not exists events_app_user_idx on audit.events (app_user_id, occurred_at desc);
create index if not exists events_module_idx on audit.events (module_key, occurred_at desc);
create index if not exists events_action_idx on audit.events (action, occurred_at desc);

create or replace function audit.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'audit.events es de solo inserción: no se modifica ni se borra';
end $$;

drop trigger if exists events_append_only on audit.events;
create trigger events_append_only before update or delete on audit.events
  for each row execute function audit.forbid_change();
drop trigger if exists events_no_truncate on audit.events;
create trigger events_no_truncate before truncate on audit.events
  for each statement execute function audit.forbid_change();

create table if not exists audit.tracked_tables (
  table_name     text primary key,
  module_key     text,
  id_column      text   not null default 'id',
  masked_columns text[] not null default '{}'
);

insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns) values
  ('orders', 'pedidos', 'id', '{}'), ('order_items', 'pedidos', 'id', '{}'),
  ('returns', 'devoluciones', 'id', '{}'),
  ('dispatch_guides', 'guias', 'id', '{}'),
  ('routes', 'planificacion', 'id', '{}'), ('wms_expediciones', 'planificacion', 'id', '{}'),
  ('tracking_events', 'tracking', 'id', '{}'),
  ('rates', 'tarifas', 'id', '{}'), ('settlements', 'tarifas', 'id', '{}'),
  ('tariff_types', 'tarifas', 'id', '{}'), ('costos_fijos', 'tarifas', 'id', '{}'),
  ('costos_variables', 'tarifas', 'id', '{}'), ('depreciacion', 'tarifas', 'codigo_camion', '{}'),
  ('parametros_globales', 'tarifas', 'clave', '{}'), ('rutas_costeo', 'tarifas', 'id', '{}'),
  ('sku_cotizaciones', 'tarifas', 'id', '{}'), ('tipos_camion', 'tarifas', 'codigo', '{}'),
  ('countries', 'paises', 'id', '{}'),
  ('zones', 'zonas', 'id', '{}'),
  ('carriers', 'transportistas', 'id', '{}'),
  ('vehicles', 'vehiculos', 'id', '{}'), ('vehicle_types', 'vehiculos', 'id', '{}'),
  ('drivers', 'conductores', 'id', '{}'), ('driver_licenses', 'conductores', 'id', '{}'),
  ('driver_license_types', 'licencias', 'id', '{}'),
  ('customers', 'clientes', 'id', '{}'), ('final_customers', 'clientes', 'id', '{}'),
  ('delivery_points', 'puntos_entrega', 'id', '{}'), ('addresses', 'puntos_entrega', 'id', '{}'),
  ('contacts', 'puntos_entrega', 'id', '{}'), ('stores', 'puntos_entrega', 'id', '{}'),
  ('contracts', 'contratos', 'id', '{}'), ('contract_documents', 'contratos', 'id', '{}'),
  ('organizations', 'configuracion', 'id', '{}'), ('warehouses', 'configuracion', 'id', '{}'),
  ('app_users', 'configuracion', 'id', '{}'), ('roles', 'configuracion', 'id', '{}'),
  ('user_scopes', 'configuracion', 'id', '{}'),
  ('role_permissions', 'configuracion', 'role_id', '{}'),
  ('role_countries', 'configuracion', 'role_id', '{}'),
  ('app_modules', 'configuracion', 'key', '{}'),
  ('auth_credentials', 'configuracion', 'auth_user_id', '{password_hash}')
on conflict (table_name) do update
  set module_key = excluded.module_key, id_column = excluded.id_column, masked_columns = excluded.masked_columns;

create or replace function audit.capture_row_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  cfg      audit.tracked_tables;
  actor    jsonb := nullif(current_setting('tms.audit_actor', true), '')::jsonb;
  old_row  jsonb;
  new_row  jsonb;
  diff     jsonb;
  masked   text[];
  v_app_user uuid;
  v_role     text;
begin
  select * into cfg from audit.tracked_tables where table_name = tg_table_name;
  masked := coalesce(cfg.masked_columns, '{}');
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    -- Solo lo que cambió; un cambio en una columna oculta se registra sin su valor.
    select jsonb_object_agg(k, case when k = any(masked) then '["[oculto]", "[oculto]"]'::jsonb
                                    else jsonb_build_array(old_row -> k, new_row -> k) end)
      into diff
      from jsonb_object_keys(new_row) as k
     where (old_row -> k) is distinct from (new_row -> k) and k <> 'updated_at';
    if diff is null then
      return null;  -- nada relevante cambió (p. ej. solo updated_at)
    end if;
  end if;

  if actor ->> 'auth_user_id' is not null then
    select au.id, r.name into v_app_user, v_role
      from public.app_users au left join public.roles r on r.id = au.role_id
     where au.auth_user_id = (actor ->> 'auth_user_id')::uuid;
  end if;

  insert into audit.events (actor_type, auth_user_id, app_user_id, actor_email, role_name, source, action,
                            module_key, entity_table, entity_id, changes, before, after,
                            request_id, ip, user_agent)
  values (coalesce(actor ->> 'type', 'system'),
          (actor ->> 'auth_user_id')::uuid, v_app_user, actor ->> 'email', v_role,
          coalesce(actor ->> 'source', 'db:' || coalesce(nullif(current_setting('application_name', true), ''),
                                                         session_user::text)),
          case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
          cfg.module_key, tg_table_name, coalesce(new_row, old_row) ->> coalesce(cfg.id_column, 'id'),
          diff,
          case when tg_op = 'DELETE' then old_row - masked end,
          case when tg_op = 'INSERT' then new_row - masked end,
          actor ->> 'request_id', actor ->> 'ip', actor ->> 'user_agent');
  return null;
end $$;

-- Un trigger por tabla registrada (las que todavía no existan se saltan; al
-- crear una tabla nueva: registrarla en audit.tracked_tables y re-correr esto).
do $$
declare
  t record;
begin
  for t in select table_name from audit.tracked_tables loop
    if to_regclass('public.' || quote_ident(t.table_name)) is not null then
      execute format('drop trigger if exists audit_row_change on public.%I', t.table_name);
      execute format('create trigger audit_row_change after insert or update or delete on public.%I '
                     'for each row execute function audit.capture_row_change()', t.table_name);
    end if;
  end loop;
end $$;

-- Módulo de la matriz de permisos para la pantalla de auditoría.
insert into app_modules (key, group_key, path, sort_order) values ('auditoria', null, '/auditoria', 115)
on conflict (key) do update set group_key = excluded.group_key, path = excluded.path, sort_order = excluded.sort_order;

commit;
