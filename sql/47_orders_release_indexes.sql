-- ============================================================================
-- 47 — Índices de la pasada de LIBERACIÓN del OMS (ADR-013).
--
-- ADR-013 desacopla priorización y liberación en dos pasadas de un único barrido
-- sobre public.orders (grano pedido). La pasada de LIBERACIÓN recorre los pedidos
-- priorizados-no-liberados cuya ventana ya abrió (`now() >= dispatch_date −
-- dias_prep_picking`), y la acción manual "Procesar a Eflow" filtra por
-- numero_viaje. Estos dos índices PARCIALES aceleran esas lecturas:
--
--   idx_order_release       → cola de liberación por fecha de salida del viaje,
--                             acotada a los pedidos aún no liberados y con plan.
--   idx_order_numero_viaje  → filtro por viaje de la acción manual (y la
--                             liberación "por viaje gratis"), acotado a no-liberados.
--
-- La columna orders.dispatch_date la CREA y PUEBLA Planificación (reparto sql/37):
-- date = delivery_date − lead_time_days, igual para todos los pedidos de un viaje.
-- El OMS solo la LEE; aquí únicamente se indexa (no se crea la columna).
--
-- Estándar OLTP Intelix: prefijo idx_, entidad en singular ('order'). Idempotente
-- (create index if not exists): correrla dos veces no falla.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/47_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/47_...sql --execute
-- ============================================================================

begin;

create index if not exists idx_order_release on orders (dispatch_date)
  where oms_processed_at is null and planning_run_id is not null;

create index if not exists idx_order_numero_viaje on orders (numero_viaje)
  where oms_processed_at is null;

-- ROLLBACK (solo si hiciera falta volver atrás):
-- drop index if exists idx_order_release;
-- drop index if exists idx_order_numero_viaje;

-- Validación: aborta si falta alguno de los dos índices.
do $$
begin
  if not exists (select 1 from pg_class where relkind = 'i' and relname = 'idx_order_release') then
    raise exception 'Validación sql/47: falta el índice idx_order_release';
  end if;
  if not exists (select 1 from pg_class where relkind = 'i' and relname = 'idx_order_numero_viaje') then
    raise exception 'Validación sql/47: falta el índice idx_order_numero_viaje';
  end if;
  raise notice 'Validación sql/47: OK (idx_order_release, idx_order_numero_viaje creados)';
end $$;

commit;
