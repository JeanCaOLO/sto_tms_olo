-- ============================================================================
-- 42 — Tracking: revisión del viaje completado (semáforo + "Revisado").
--
--   tracking_reviews   1 fila por viaje que el administrador de Tracking marcó como revisado
--                      (quién, cuándo y nota opcional). El color del semáforo NO se guarda: se
--                      calcula al leer desde novedades, devoluciones, evidencias y retraso.
--                      Auditada (quién revisó queda también en `audit`).
--
-- Idempotente. Se aplica con scripts/run-migration.mjs (dry-run por defecto).
-- ============================================================================

begin;

create table if not exists tracking_reviews (
  route_id         uuid primary key references routes(id) on delete cascade,
  organization_id  uuid not null references organizations(id),
  reviewed_by      uuid not null references app_users(id),
  reviewed_at      timestamptz not null default now(),
  note             text
);
create index if not exists ix_tracking_reviews_org on tracking_reviews (organization_id);

insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns) values
  ('tracking_reviews', 'tracking', 'route_id', '{}')
on conflict (table_name) do update
  set module_key = excluded.module_key, id_column = excluded.id_column, masked_columns = excluded.masked_columns;

drop trigger if exists audit_row_change on public.tracking_reviews;
create trigger audit_row_change after insert or update or delete on public.tracking_reviews
  for each row execute function audit.capture_row_change();

commit;
