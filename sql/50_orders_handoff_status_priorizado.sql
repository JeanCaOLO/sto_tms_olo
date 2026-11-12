-- ============================================================================
-- 50 — Ampliar ck_order_handoff_status para incluir 'priorizado' (ADR-013).
--
-- ADR-013 desacopló priorizar de liberar y agregó el estado 'priorizado' (pedido
-- priorizado pero aún no liberado), ANTES de 'disparo_pendiente' → 'completado'.
-- sql/43 creó el constraint con solo 2 valores, así que `priorizar_pedido`
-- (handoff_status='priorizado') viola ck_order_handoff_status en live (SQLSTATE
-- 23514) y el barrido muere en el primer pedido. Esto lo corrige.
--
-- Detectado por el test cruzado Planificación↔OMS (verif_oms.py --barrido, 2026-10-21).
-- NULL sigue permitido (CHECK pasa con NULL): los pedidos sin procesar no se tocan.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/50_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/50_...sql --execute
-- ============================================================================

begin;

alter table orders drop constraint if exists ck_order_handoff_status;
alter table orders add constraint ck_order_handoff_status
  check (handoff_status in ('priorizado', 'disparo_pendiente', 'completado'));

comment on column orders.handoff_status is
  'Estado del handoff OMS (ADR-013): priorizado | disparo_pendiente | completado.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_order_handoff_status') then
    raise exception 'Validación sql/50: falta ck_order_handoff_status';
  end if;
  raise notice 'Validación sql/50: OK';
end $$;

-- ROLLBACK (vuelve al constraint viejo de 2 valores):
-- alter table orders drop constraint if exists ck_order_handoff_status;
-- alter table orders add constraint ck_order_handoff_status
--   check (handoff_status in ('disparo_pendiente', 'completado'));

commit;
