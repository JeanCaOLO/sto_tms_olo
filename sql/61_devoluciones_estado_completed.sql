-- ============================================================================
-- 61 — ck_return_status admite 'completed'.
--
-- La pantalla anterior de Devoluciones (ahora en /devoluciones/legacy) cerraba una devolución aprobada con
-- status = 'completed'; el CHECK de sql/60 no lo contemplaba y esa acción habría fallado. 'completed' es un
-- estado terminal (como 'received'): no bloquea la liquidación del viaje.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/61_devoluciones_estado_completed.sql [--execute]
-- Deshacer con: sql/61_devoluciones_estado_completed_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

alter table tbl_returns drop constraint if exists ck_return_status;
alter table tbl_returns
  add constraint ck_return_status
  check (status in ('pending', 'approved', 'received', 'completed', 'rejected', 'cancelled'));

commit;
