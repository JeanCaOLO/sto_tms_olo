-- ============================================================================
-- 57 — orders: cambio manual de la fecha de entrega (Bandeja, solo admin).
--
-- Reunión 2026-11-03: desde la Bandeja se puede cambiar la fecha de entrega de un
-- pedido (p. ej. el cliente lo pide para hoy) y queda registrado quién lo aprobó.
-- La ingesta de eFlow (backend/planning/src/ingest_orders.py) pisa delivery_date
-- con FECHAEXPEDICIONPLANIFICADA en cada corrida: con delivery_date_changed_at
-- sellado deja de pisarla y guarda lo de eFlow en delivery_date_eflow.
-- El historial completo de cambios ya queda en audit.events (trigger audit_row_change).
--
-- Nomenclatura: estándar OLTP INTELIX (solo lo que se crea aquí).
--
-- Uso:  node --env-file=.env.local scripts/run-migration.mjs sql/57_...sql            (dry-run)
--       node --env-file=.env.local scripts/run-migration.mjs sql/57_...sql --execute
-- ============================================================================

begin;

alter table orders
  add column if not exists delivery_date_eflow      date,
  add column if not exists delivery_date_changed_at timestamptz,
  add column if not exists delivery_date_changed_by uuid,
  add column if not exists delivery_date_changes    integer not null default 0;

alter table orders drop constraint if exists fk_order_delivery_date_changed_by;
alter table orders add constraint fk_order_delivery_date_changed_by
  foreign key (delivery_date_changed_by) references app_users(id) on delete set null;
alter table orders drop constraint if exists ck_order_delivery_date_changes;
alter table orders add constraint ck_order_delivery_date_changes check (delivery_date_changes >= 0);

comment on column orders.delivery_date_eflow      is 'Fecha de entrega que manda eFlow (FECHAEXPEDICIONPLANIFICADA), aunque delivery_date se haya cambiado a mano.';
comment on column orders.delivery_date_changed_at is 'Último cambio manual de delivery_date. Si no es NULL, la ingesta de eFlow ya no pisa delivery_date.';
comment on column orders.delivery_date_changed_by is 'app_users.id del admin que aprobó el último cambio manual de delivery_date.';
comment on column orders.delivery_date_changes    is 'Cantidad de cambios manuales de delivery_date (indicador del Panel OMS).';

-- Backfill: lo que hay hoy en delivery_date vino de eFlow.
update orders set delivery_date_eflow = delivery_date
where delivery_date_eflow is null and eflow_id_expedicion is not null;

-- ROLLBACK (ejecutar en orden):
-- alter table orders drop constraint if exists ck_order_delivery_date_changes;
-- alter table orders drop constraint if exists fk_order_delivery_date_changed_by;
-- alter table orders drop column if exists delivery_date_changes, drop column if exists delivery_date_changed_by,
--   drop column if exists delivery_date_changed_at, drop column if exists delivery_date_eflow;

do $$
declare
  faltantes text[];
begin
  select array_agg(objeto) into faltantes
  from (values
      ('delivery_date_eflow',      exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'delivery_date_eflow')),
      ('delivery_date_changed_at', exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'delivery_date_changed_at')),
      ('delivery_date_changed_by', exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'delivery_date_changed_by')),
      ('delivery_date_changes',    exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'delivery_date_changes')),
      ('fk_order_delivery_date_changed_by', exists (select 1 from pg_constraint where conname = 'fk_order_delivery_date_changed_by')),
      ('ck_order_delivery_date_changes',    exists (select 1 from pg_constraint where conname = 'ck_order_delivery_date_changes'))
    ) as v(objeto, ok)
  where not ok;

  if faltantes is not null then
    raise exception 'Validación sql/57: FALTA %', array_to_string(faltantes, ', ');
  end if;
  raise notice 'Validación sql/57: OK';
end $$;

commit;
