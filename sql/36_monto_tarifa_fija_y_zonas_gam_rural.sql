-- ============================================================================
-- 36 — Monto de la tarifa fija por transportista (pedido del usuario, 2026-10-12).
--
--   carriers.flat_rate_amount  monto por viaje cuando la forma de pago es FIXED.
--                              Liquidaciones lo usa como base del viaje; si es null,
--                              FIXED sale de las reglas FIXED del catálogo, como antes.
--
-- Además, el usuario pidió quitar las zonas GAM y RURAL (CR). Se DESACTIVAN, no se
-- borran: las referencian rutas y pedidos demo (routes/orders.route_type_id, FK), 19
-- filas de tarifarios, una regla de recargo y una liquidación ya emitida. Borrarlas
-- rompería esas FK y el histórico; inactivas dejan de ofrecerse en el catálogo.
-- ============================================================================

begin;

alter table carriers add column if not exists flat_rate_amount numeric;
alter table carriers drop constraint if exists carriers_flat_rate_amount_check;
alter table carriers add constraint carriers_flat_rate_amount_check
  check (flat_rate_amount is null or flat_rate_amount >= 0);

update zones set status = 'inactive', updated_at = now()
where code in ('GAM', 'RURAL')
  and country_id = '22222222-2222-2222-2222-222222222221'
  and status <> 'inactive';

commit;
