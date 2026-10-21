-- ============================================================================
-- 41 — Maestros EFLOW, paso 2 (estructura): final_customers = EFLOW CLIENTES.
--
-- Plan: docs/work/2026-10/2026-10-16-plan-modelo-pedidos-clientes-eflow.md
-- (paso 2). Decisiones en aidlc/spaces/default/memory/project.md (2026-10-16).
--
--   * UNA sola tabla de clientes destino con `type` = 'TIENDA' | 'MAYOREO'.
--     TIENDA = tiendas de EPA; todo lo demás = MAYOREO.
--   * Columnas para los datos de EFLOW CLIENTES (contacto, teléfonos, email,
--     referencia ERP, tipo y clase de cliente en EFLOW).
--   * Las tiendas EPA pasan al código de EFLOW: 'T002' -> '002' (IDCLIENTE de
--     EFLOW_OLO.dbo.CLIENTES, compañía 0029). Mismo cambio en sus puntos de
--     entrega. stores.code NO se toca (stores sigue como origen de rutas).
--
-- La CARGA de los 24.147 clientes de EFLOW la hace scripts/cargar-clientes-eflow.py
-- (datos, no estructura). Este script solo prepara la tabla.
--
-- Nomenclatura: estándar OLTP INTELIX en la tabla tocada. Excepción: el
-- trigger de auditoría sigue como audit_row_change (sql/16 lo recrea así).
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/41_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/41_...sql --execute
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table final_customers add column if not exists type             text;
alter table final_customers add column if not exists short_name       text;
alter table final_customers add column if not exists contact          text;
alter table final_customers add column if not exists phone            text;
alter table final_customers add column if not exists mobile           text;
alter table final_customers add column if not exists email            text;
alter table final_customers add column if not exists erp_reference    text;
alter table final_customers add column if not exists wms_client_type  text;
alter table final_customers add column if not exists wms_client_class text;

comment on column final_customers.external_code    is 'EFLOW CLIENTES.IDCLIENTE (texto, ceros a la izquierda). Único por compañía (customer_id).';
comment on column final_customers.type             is 'TIENDA (tiendas de EPA) o MAYOREO (resto de clientes).';
comment on column final_customers.name             is 'EFLOW NOMBRELARGO.';
comment on column final_customers.short_name       is 'EFLOW NOMBRECORTO.';
comment on column final_customers.contact          is 'EFLOW CONTACTO.';
comment on column final_customers.phone            is 'EFLOW TELEFONO.';
comment on column final_customers.mobile           is 'EFLOW CELULAR.';
comment on column final_customers.email            is 'EFLOW EMAIL.';
comment on column final_customers.erp_reference    is 'EFLOW REFERENCIA_ERP.';
comment on column final_customers.wms_client_type  is 'EFLOW TPCLIE (ej. NACION, INTERN).';
comment on column final_customers.wms_client_class is 'EFLOW TPCLSE (ej. A, B, C, Z).';
comment on column final_customers.status           is 'active / inactive. Derivado de EFLOW TPCLSI (DISP -> active, BLOQ -> inactive).';

-- ---------------------------------------------------------------------------
-- 2. Tiendas EPA al código de EFLOW ('T002' -> '002') y tipo
-- ---------------------------------------------------------------------------
update delivery_points dp
set external_code = substr(dp.external_code, 2), updated_at = now()
from final_customers fc
join customers c on c.id = fc.customer_id and c.code = 'EPA'
where dp.final_customer_id = fc.id
  and dp.external_code ~ '^T[0-9]{3}$';

update final_customers fc
set external_code = substr(fc.external_code, 2), updated_at = now()
from customers c
where c.id = fc.customer_id and c.code = 'EPA'
  and fc.external_code ~ '^T[0-9]{3}$';

update final_customers fc
set type = case when c.code = 'EPA' and fc.external_code ~ '^[0-9]{3}$' then 'TIENDA' else 'MAYOREO' end
from customers c
where c.id = fc.customer_id and fc.type is null;

alter table final_customers alter column type set not null;

-- ---------------------------------------------------------------------------
-- 3. Restricciones (estándar) y checks
-- ---------------------------------------------------------------------------
alter table final_customers rename constraint final_customers_pkey to pk_final_customer;
alter table final_customers rename constraint final_customers_customer_id_fkey to fk_final_customer_customer;
alter table final_customers rename constraint final_customers_customer_id_external_code_key to uq_final_customer_customer_external_code;

alter table final_customers add constraint ck_final_customer_type check (type in ('TIENDA', 'MAYOREO'));
alter table final_customers add constraint ck_final_customer_status check (status in ('active', 'inactive'));

create index if not exists idx_final_customer_type on final_customers (customer_id, type);

-- ROLLBACK (ejecutar en orden descendente):
-- drop index if exists idx_final_customer_type;
-- alter table final_customers drop constraint if exists ck_final_customer_status;
-- alter table final_customers drop constraint if exists ck_final_customer_type;
-- alter table final_customers rename constraint uq_final_customer_customer_external_code to final_customers_customer_id_external_code_key;
-- alter table final_customers rename constraint fk_final_customer_customer to final_customers_customer_id_fkey;
-- alter table final_customers rename constraint pk_final_customer to final_customers_pkey;
-- update final_customers fc set external_code = 'T' || fc.external_code from customers c
--   where c.id = fc.customer_id and c.code = 'EPA' and fc.external_code ~ '^[0-9]{3}$';
-- update delivery_points dp set external_code = 'T' || dp.external_code from final_customers fc
--   join customers c on c.id = fc.customer_id and c.code = 'EPA'
--   where dp.final_customer_id = fc.id and dp.external_code ~ '^[0-9]{3}$';
-- alter table final_customers drop column if exists wms_client_class, drop column if exists wms_client_type,
--   drop column if exists erp_reference, drop column if exists email, drop column if exists mobile,
--   drop column if exists phone, drop column if exists contact, drop column if exists short_name,
--   drop column if exists type;
-- (El rollback de los códigos 'T' también revierte tiendas cargadas después por
--  scripts/cargar-clientes-eflow.py, p. ej. 001 y 007.)

-- ---------------------------------------------------------------------------
-- 4. Validación: aborta la transacción si falta algo.
-- ---------------------------------------------------------------------------
do $$
declare
  faltantes text[];
begin
  select array_agg(objeto) into faltantes
  from (values
      ('columna final_customers.type',  exists (select 1 from information_schema.columns where table_name = 'final_customers' and column_name = 'type' and is_nullable = 'NO')),
      ('columna wms_client_class',      exists (select 1 from information_schema.columns where table_name = 'final_customers' and column_name = 'wms_client_class')),
      ('pk_final_customer',             exists (select 1 from pg_constraint where conname = 'pk_final_customer')),
      ('fk_final_customer_customer',    exists (select 1 from pg_constraint where conname = 'fk_final_customer_customer')),
      ('uq_final_customer_customer_external_code', exists (select 1 from pg_constraint where conname = 'uq_final_customer_customer_external_code')),
      ('ck_final_customer_type',        exists (select 1 from pg_constraint where conname = 'ck_final_customer_type')),
      ('sin códigos T00x en EPA',       not exists (select 1 from final_customers fc join customers c on c.id = fc.customer_id
                                                    where c.code = 'EPA' and fc.external_code ~ '^T[0-9]{3}$')),
      ('sin puntos T00x en EPA',        not exists (select 1 from delivery_points dp join final_customers fc on fc.id = dp.final_customer_id
                                                    join customers c on c.id = fc.customer_id
                                                    where c.code = 'EPA' and dp.external_code ~ '^T[0-9]{3}$')),
      ('tiendas EPA tipo TIENDA',       (select count(*) from final_customers fc join customers c on c.id = fc.customer_id
                                          where c.code = 'EPA' and fc.type = 'TIENDA') >= 6)
    ) as v(objeto, ok)
  where not ok;

  if faltantes is not null then
    raise exception 'Validación sql/41: FALTA %', array_to_string(faltantes, ', ');
  end if;
  raise notice 'Validación sql/41: OK';
end $$;

commit;
