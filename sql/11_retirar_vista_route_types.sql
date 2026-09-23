-- ============================================================================
-- 11 — Retirar la vista de compatibilidad `route_types` (creada en sql/09).
--
-- NO APLICAR hasta que el renombre route_types → zones esté integrado en
-- `main` y las ramas activas lo hayan traído. Al 2026-09-23, origin/main,
-- dev, dylan-tarifas, jesus-planificacion y oms todavía consultan
-- `route_types`, y todos usan la MISMA base Aurora: borrar la vista antes
-- rompe Tracking, Liquidaciones y la pantalla vieja de Rutas en esas ramas.
--
-- Chequeo previo:
--   git grep -n "route_types" origin/main -- src server scripts
-- (solo deberían quedar comentarios). Al aplicar, quitar también las entradas
-- de compatibilidad de backend/data/src/relations.py y
-- server/tms-relations.mjs, y 'route_types' de la whitelist de
-- src/__tests__/db-connectivity.test.ts (frontend).
-- ============================================================================

begin;

drop view if exists route_types;

commit;
