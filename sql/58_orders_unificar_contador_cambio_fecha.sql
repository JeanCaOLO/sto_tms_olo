-- ============================================================================
-- 58_orders_unificar_contador_cambio_fecha.sql — un solo contador de cambios de
-- fecha de entrega.
--
-- sql/56 (OMS, delivery_date_change_count) y sql/57 (Planificación,
-- delivery_date_changes) crearon el mismo contador por separado. Queda el del OMS,
-- que ya lee el Panel; el cambio de fecha de la Bandeja pasa a incrementarlo.
-- Se suma lo que hubiera en el viejo antes de borrarlo.
--
-- Estándar OLTP INTELIX: bloque ROLLBACK + validación. Aurora PostgreSQL. Idempotente.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'orders' and column_name = 'delivery_date_changes') then
    update orders set delivery_date_change_count = delivery_date_change_count + delivery_date_changes
     where delivery_date_changes > 0;
    alter table orders drop constraint if exists ck_order_delivery_date_changes;
    alter table orders drop column delivery_date_changes;
  end if;
end $$;

-- ============================================================================
-- ROLLBACK (descomentar para deshacer; el valor queda en delivery_date_change_count)
-- ----------------------------------------------------------------------------
-- alter table orders add column if not exists delivery_date_changes integer not null default 0;
-- alter table orders add constraint ck_order_delivery_date_changes check (delivery_date_changes >= 0);
-- ============================================================================

-- Validación
select not exists (select 1 from information_schema.columns
                   where table_name = 'orders' and column_name = 'delivery_date_changes') as viejo_borrado,
       exists (select 1 from information_schema.columns
               where table_name = 'orders' and column_name = 'delivery_date_change_count') as contador_ok;
