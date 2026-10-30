-- ============================================================================
-- 54 — Escala de prioridad POR COMPAÑÍA en oms_rule_configs (escala_prioridad).
--
-- La prioridad numérica del OMS es invertida (menor = más urgente). Hasta ahora el
-- motor la emitía en una escala amplia (1..100 = PRIORIDAD_BASE − score), lo que
-- producía números grandes (10, 20) que las compañías no manejan. Ahora la escala es
-- un PARÁMETRO por scope: `backend/oms/src/score.py` mapea el score a [1, escala].
--
--   Cofersa → escala 5  (prioridades 1..5).
--   EPA     → no se prioriza (priorizar=false): trae su prioridad de EFLOW; la escala
--             no le aplica (el motor conserva orders.priority).
--   Resto   → GLOBAL, que se deja en 100 (sin cambio) hasta que cada compañía defina
--             la suya con su propia fila de scope.
--
-- Nomenclatura OLTP Intelix: snake_case, prefijos ck_/uidx_, entidad singular.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/54_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/54_...sql --execute
-- ============================================================================

begin;

-- 1) Columna de escala (default 100 = comportamiento previo para quien no la fije).
alter table oms_rule_configs
  add column if not exists escala_prioridad integer not null default 100;

alter table oms_rule_configs
  drop constraint if exists ck_oms_rule_config_escala;
alter table oms_rule_configs
  add constraint ck_oms_rule_config_escala check (escala_prioridad between 1 and 100);

-- 2) Cofersa: fila de scope CUSTOMER con escala 5. Hereda las MISMAS reglas que la
--    GLOBAL (fecha_t1 + observaciones + cliente_retira) para no cambiar su scoring,
--    solo la escala. Se resuelve por código (independiente del UUID del entorno) y es
--    idempotente (no inserta si Cofersa ya tiene su fila customer).
insert into oms_rule_configs (scope_type, customer_id, priorizar, reglas, dias_prep_picking, escala_prioridad)
select 'customer', c.id, true,
  '{"fecha_t1": {"aplica": true, "peso": 1.0},
    "observaciones": {"aplica": true, "peso": 1.0},
    "cliente_retira": {"aplica": true, "peso": 0.0, "prioridad": 1}}'::jsonb,
  1, 5
from customers c
where c.code = 'COFERSA'
  and not exists (
    select 1 from oms_rule_configs r
    where r.scope_type = 'customer' and r.customer_id = c.id
  );

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'oms_rule_configs' and column_name = 'escala_prioridad'
  ) then
    raise exception 'Validación sql/54: FALTA la columna escala_prioridad';
  end if;
  -- Si Cofersa existe en este entorno, debe quedar con escala 5.
  if exists (select 1 from customers where code = 'COFERSA')
     and not exists (
       select 1 from oms_rule_configs r
       join customers c on c.id = r.customer_id
       where c.code = 'COFERSA' and r.scope_type = 'customer' and r.escala_prioridad = 5
     ) then
    raise exception 'Validación sql/54: Cofersa no quedó con escala_prioridad = 5';
  end if;
  raise notice 'Validación sql/54: OK';
end $$;

-- ROLLBACK:
--   delete from oms_rule_configs r using customers c
--     where r.customer_id = c.id and c.code = 'COFERSA' and r.scope_type = 'customer';
--   alter table oms_rule_configs drop constraint if exists ck_oms_rule_config_escala;
--   alter table oms_rule_configs drop column if exists escala_prioridad;

commit;
