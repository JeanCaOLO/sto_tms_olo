-- ============================================================================
-- 18 — Rol de base de datos de la APLICACIÓN (tms_app), separado del dueño.
--
-- Pedido del usuario (2026-09-24), cierra el punto abierto de ADR 0003: la
-- API usaba el usuario dueño de las tablas (olo_db), que puede deshabilitar
-- los triggers de auditoría o alterar audit.*. La aplicación pasa a usar
-- tms_app, que:
--   * lee y escribe DATOS en public (SELECT/INSERT/UPDATE/DELETE), incluidas
--     las tablas que se creen después (default privileges del dueño);
--   * en la bitácora solo puede LEER e INSERTAR (audit.events): no la edita,
--     no la borra, no la vacía, no toca triggers ni estructura;
--   * no es dueño de nada: no puede hacer DDL ni deshabilitar triggers;
--   * ejecuta audit.ensure_partitions (SECURITY DEFINER) para el
--     mantenimiento mensual de particiones.
-- Migraciones y DDL siguen con el dueño (olo_db, TMS_DB_ADMIN_* en
-- .env.local). La CONTRASEÑA no va aquí: se fija aparte y vive en Secrets
-- Manager (/dev/tms/db-app) y en .env.local.
-- Idempotente.
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tms_app') then
    create role tms_app login nosuperuser nocreatedb nocreaterole;
  end if;
  execute format('grant connect, temporary on database %I to tms_app', current_database());
end $$;

grant usage on schema public to tms_app;
grant select, insert, update, delete on all tables in schema public to tms_app;
grant usage, select, update on all sequences in schema public to tms_app;
revoke all on schema_migrations from tms_app;

-- Tablas y secuencias que el dueño cree de acá en adelante.
do $$
begin
  execute format('alter default privileges for role %I in schema public '
                 'grant select, insert, update, delete on tables to tms_app', current_user);
  execute format('alter default privileges for role %I in schema public '
                 'grant usage, select, update on sequences to tms_app', current_user);
end $$;

-- Bitácora: solo leer e insertar (a través de la tabla madre particionada).
grant usage on schema audit to tms_app;
grant select, insert on audit.events to tms_app;
grant usage on sequence audit.event_ids to tms_app;

-- Mantenimiento de particiones con los permisos del dueño.
alter function audit.ensure_partitions(int, date) security definer set search_path = pg_catalog, audit;
revoke execute on function audit.ensure_partitions(int, date) from public;
grant execute on function audit.ensure_partitions(int, date) to tms_app;

commit;
