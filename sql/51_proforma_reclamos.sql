-- ============================================================================
-- 51 — Reclamos de proformas: una fase rechaza la proforma y el liquidador decide
--      (reiniciar la liquidación o apelar).
--
--   tarifas_proforma_claims      reclamo (motivo, quién, estado, apelación)
--   tarifas_settlements          + void_kind / void_reason / claim_id (anulada por reclamo)
--                                + from_claim_id (liquidación que re-liquida un viaje devuelto por reclamo)
--
-- Las tablas salen del registro de esquema (npm run tarifas:ddl). Idempotente.
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/51_proforma_reclamos.sql [--execute]
--
-- ROLLBACK (manual, en este orden):
--   alter table tarifas_settlements drop column if exists from_claim_id, drop column if exists claim_id,
--     drop column if exists void_reason, drop column if exists void_kind;
--   drop table if exists tarifas_proforma_claims;
--   delete from audit.tracked_tables where table_name = 'tarifas_proforma_claims';
-- ============================================================================

begin;

alter table tarifas_settlements add column if not exists void_kind text;
alter table tarifas_settlements add column if not exists void_reason text;
alter table tarifas_settlements add column if not exists claim_id text;
alter table tarifas_settlements add column if not exists from_claim_id text;

-- Reclamo de proforma
CREATE TABLE IF NOT EXISTS tarifas_proforma_claims (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  proforma_id text NOT NULL,
  phase_id text NOT NULL,
  phase_name text NOT NULL,
  raised_by text NOT NULL,
  raised_role text,
  reason text NOT NULL,
  status text NOT NULL,
  appeal_reason text,
  appealed_by text,
  appealed_at timestamptz,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT tarifas_proforma_claims_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_proforma_claims_proforma_id_fkey FOREIGN KEY (proforma_id) REFERENCES tarifas_proformas (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_country_id_idx ON tarifas_proforma_claims (country_id);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_proforma_id_idx ON tarifas_proforma_claims (proforma_id);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_status_idx ON tarifas_proforma_claims (status);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_created_at_idx ON tarifas_proforma_claims (created_at);

-- Permisos de la aplicación y bitácora del sistema (mismo patrón que sql/46).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    execute 'grant select, insert, update, delete on public.tarifas_proforma_claims to tms_app';
  else
    raise notice 'tms_app no existe: se omiten los GRANT (correr sql/18 primero)';
  end if;
end $$;

insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns)
values ('tarifas_proforma_claims', 'tarifas', 'id', '{}')
on conflict (table_name) do update set module_key = excluded.module_key, id_column = excluded.id_column;

drop trigger if exists audit_row_change on public.tarifas_proforma_claims;
create trigger audit_row_change after insert or update or delete on public.tarifas_proforma_claims
  for each row execute function audit.capture_row_change();

-- Validación: la tabla y las columnas existen.
do $$
begin
  if to_regclass('public.tarifas_proforma_claims') is null then
    raise exception 'falta tarifas_proforma_claims';
  end if;
  if (select count(*) from information_schema.columns
       where table_name = 'tarifas_settlements'
         and column_name in ('void_kind', 'void_reason', 'claim_id', 'from_claim_id')) <> 4 then
    raise exception 'faltan columnas de reclamo en tarifas_settlements';
  end if;
end $$;

commit;
