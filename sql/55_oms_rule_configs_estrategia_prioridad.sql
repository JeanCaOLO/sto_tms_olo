-- ============================================================================
-- 55 — Estrategia (esquema de numeración) de prioridad POR COMPAÑÍA en
--      oms_rule_configs (estrategia).
--
-- El NÚMERO de prioridad se calculaba en un único punto fijo. Ahora el ESQUEMA es
-- un parámetro por scope: `backend/oms/src/estrategias_prioridad.py` resuelve la
-- estrategia por nombre. Así, agregar una compañía de mayoreo que numere distinto
-- NO cambia lógica del barrido — se registra una estrategia y se apunta su fila.
--
--   escala_lineal     → default: mapea el score a [1, escala_prioridad] (lo previo).
--   dias_hasta_salida → Cofersa: el número = días que faltan para la salida/alistado;
--                       escala chica, 0 reservado para el pedido ya liberado.
--
-- Fuente: reunión de prioridad Cofersa (confirmada 2026-10-28/29). Ver
-- docs/work/2026-10/2026-10-29-prioridad-cofersa-dias-hasta-salida.md.
--
-- Nomenclatura OLTP Intelix: snake_case, prefijo ck_, entidad singular.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/55_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/55_...sql --execute
-- ============================================================================

begin;

-- 1) Columna de estrategia (default 'escala_lineal' = comportamiento previo).
alter table oms_rule_configs
  add column if not exists estrategia text not null default 'escala_lineal';

alter table oms_rule_configs
  drop constraint if exists ck_oms_rule_config_estrategia;
alter table oms_rule_configs
  add constraint ck_oms_rule_config_estrategia
  check (estrategia in ('escala_lineal', 'dias_hasta_salida'));

-- 1b) Parámetros de 'dias_hasta_salida' (defaults = comportamiento actual de Cofersa):
--     ancla_fecha = contra qué fecha se cuentan los días; prioridad_piso = mínimo de la
--     cola (0 se reserva para el liberado). Así, otra compañía que numere igual con
--     otros números es solo config, sin estrategia nueva.
alter table oms_rule_configs
  add column if not exists ancla_fecha text not null default 'alistado';
alter table oms_rule_configs
  drop constraint if exists ck_oms_rule_config_ancla;
alter table oms_rule_configs
  add constraint ck_oms_rule_config_ancla check (ancla_fecha in ('alistado', 'entrega'));

alter table oms_rule_configs
  add column if not exists prioridad_piso integer not null default 1;
alter table oms_rule_configs
  drop constraint if exists ck_oms_rule_config_piso;
alter table oms_rule_configs
  add constraint ck_oms_rule_config_piso check (prioridad_piso >= 0);

-- 2) Cofersa numera por días hasta la salida. Resuelve la compañía por código
--    (independiente del UUID del entorno) y es idempotente. Si Cofersa no existe
--    en este entorno, no actualiza nada.
update oms_rule_configs r
set estrategia = 'dias_hasta_salida', updated_at = now()
from customers c
where r.customer_id = c.id
  and c.code = 'COFERSA'
  and r.scope_type = 'customer';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'oms_rule_configs' and column_name = 'estrategia'
  ) then
    raise exception 'Validación sql/55: FALTA la columna estrategia';
  end if;
  -- Si Cofersa existe en este entorno, debe quedar con estrategia dias_hasta_salida.
  if exists (select 1 from customers where code = 'COFERSA')
     and not exists (
       select 1 from oms_rule_configs r
       join customers c on c.id = r.customer_id
       where c.code = 'COFERSA' and r.scope_type = 'customer'
         and r.estrategia = 'dias_hasta_salida'
     ) then
    raise exception 'Validación sql/55: Cofersa no quedó con estrategia = dias_hasta_salida';
  end if;
  raise notice 'Validación sql/55: OK';
end $$;

-- ROLLBACK:
--   update oms_rule_configs r set estrategia = 'escala_lineal'
--     from customers c where r.customer_id = c.id and c.code = 'COFERSA' and r.scope_type = 'customer';
--   alter table oms_rule_configs drop constraint if exists ck_oms_rule_config_piso;
--   alter table oms_rule_configs drop column if exists prioridad_piso;
--   alter table oms_rule_configs drop constraint if exists ck_oms_rule_config_ancla;
--   alter table oms_rule_configs drop column if exists ancla_fecha;
--   alter table oms_rule_configs drop constraint if exists ck_oms_rule_config_estrategia;
--   alter table oms_rule_configs drop column if exists estrategia;

commit;
