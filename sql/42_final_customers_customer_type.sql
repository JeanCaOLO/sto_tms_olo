-- ============================================================================
-- 42 — final_customers.type -> customer_type (estándar OLTP INTELIX).
--
-- `type` es demasiado genérico (el estándar pide nombres claros y descriptivos;
-- además es palabra reservada en varios motores) e inconsistente con
-- `branches.branch_type`. Se renombra la columna creada en sql/41, junto con su
-- check y su índice. Postgres actualiza solo la definición del check y del índice.
--
-- Solo la usan sql/41 y scripts/cargar-clientes-eflow.py (ajustado en el mismo cambio).
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/42_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/42_...sql --execute
-- ============================================================================

begin;

alter table final_customers rename column type to customer_type;
alter table final_customers rename constraint ck_final_customer_type to ck_final_customer_customer_type;
alter index idx_final_customer_type rename to idx_final_customer_customer_type;

comment on column final_customers.customer_type is 'TIENDA (tiendas de EPA) o MAYOREO (resto de clientes).';

-- ROLLBACK (ejecutar en orden descendente):
-- alter index idx_final_customer_customer_type rename to idx_final_customer_type;
-- alter table final_customers rename constraint ck_final_customer_customer_type to ck_final_customer_type;
-- alter table final_customers rename column customer_type to type;

-- Validación: aborta la transacción si falta algo.
do $$
declare
  faltantes text[];
begin
  select array_agg(objeto) into faltantes
  from (values
      ('columna customer_type',            exists (select 1 from information_schema.columns where table_name = 'final_customers' and column_name = 'customer_type' and is_nullable = 'NO')),
      ('sin columna type',                 not exists (select 1 from information_schema.columns where table_name = 'final_customers' and column_name = 'type')),
      ('ck_final_customer_customer_type',  exists (select 1 from pg_constraint where conname = 'ck_final_customer_customer_type')),
      ('idx_final_customer_customer_type', to_regclass('public.idx_final_customer_customer_type') is not null)
    ) as v(objeto, ok)
  where not ok;

  if faltantes is not null then
    raise exception 'Validación sql/42: FALTA %', array_to_string(faltantes, ', ');
  end if;
  raise notice 'Validación sql/42: OK';
end $$;

commit;
