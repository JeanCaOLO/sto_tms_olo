-- ============================================================================
-- 22 — Permiso `tarifas.config`: separar "liquidar" de "configurar" el tarifador.
--
--   tarifas          liquidar viajes y ver el historial (y leer lo que el cálculo necesita).
--   tarifas.config   reglas, tarifarios, costos, variables, margen, flota (configuración).
--
-- El backend (backend/tarifas/src/app.py) exige `tarifas.config` para escribir cualquier tabla que
-- no sea una liquidación. Los roles administradores lo tienen por código; ningún otro rol lo recibe
-- hasta que se lo den en Configuración → Roles (la configuración es de superusuarios).
-- Idempotente. Solo agrega una fila al catálogo de módulos.
-- ============================================================================

begin;

insert into app_modules (key, group_key, path, sort_order) values
  ('tarifas.config', null, '/reglas-tarifa', 71)
on conflict (key) do update
  set group_key = excluded.group_key, path = excluded.path, sort_order = excluded.sort_order;

commit;
