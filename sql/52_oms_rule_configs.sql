-- ============================================================================
-- 52 — Configuración del Motor de Reglas del OMS por scope (oms_rule_configs).
--
-- Las reglas (su LÓGICA) viven en código (DECIDED: el Motor de Reglas NO es un
-- constructor dinámico); esta tabla aporta los PARÁMETROS editables por compañía
-- que resuelve `backend/oms/src/reglas_config.py` por precedencia de scope
-- CUSTOMER → WAREHOUSE → COUNTRY → GLOBAL.
--
-- `reglas` (jsonb) es POR REGLA: cada una trae `aplica` (on/off), `peso` y los
-- parámetros que necesite (p. ej. `prioridad` de cliente-retira). `priorizar` y
-- `dias_prep_picking` NO son reglas (comportamiento del barrido) → son columnas.
--   priorizar=false  → la compañía YA viene priorizada (EPA trae su prioridad de
--                      EFLOW); el barrido conserva orders.priority y solo libera.
--
-- Seed: una fila GLOBAL (default, priorizar=true) y una de EPA (priorizar=false).
--
-- Nomenclatura OLTP Intelix: snake_case, entidad singular en constraints/índices
-- (oms_rule_config), prefijos pk_/fk_/ck_/uidx_.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/52_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/52_...sql --execute
-- ============================================================================

begin;

create table if not exists oms_rule_configs (
  id                uuid        not null default gen_random_uuid(),
  scope_type        text        not null,
  customer_id       uuid,
  warehouse_id      uuid,
  country_id        uuid,
  priorizar         boolean     not null default true,
  reglas            jsonb       not null default '{}'::jsonb,
  dias_prep_picking integer     not null default 1,
  activo            boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pk_oms_rule_config primary key (id),
  constraint ck_oms_rule_config_scope check (scope_type in ('customer', 'warehouse', 'country', 'global')),
  constraint ck_oms_rule_config_scope_target check (
    (scope_type = 'customer'  and customer_id is not null and warehouse_id is null and country_id is null) or
    (scope_type = 'warehouse' and warehouse_id is not null and customer_id is null and country_id is null) or
    (scope_type = 'country'   and country_id is not null and customer_id is null and warehouse_id is null) or
    (scope_type = 'global'    and customer_id is null and warehouse_id is null and country_id is null)
  ),
  constraint fk_oms_rule_config_customer  foreign key (customer_id)  references customers (id),
  constraint fk_oms_rule_config_warehouse foreign key (warehouse_id) references warehouses (id),
  constraint fk_oms_rule_config_country   foreign key (country_id)   references countries (id)
);

-- Una sola config por destino de scope (y una sola GLOBAL).
create unique index if not exists uidx_oms_rule_config_customer  on oms_rule_configs (customer_id)  where scope_type = 'customer';
create unique index if not exists uidx_oms_rule_config_warehouse on oms_rule_configs (warehouse_id) where scope_type = 'warehouse';
create unique index if not exists uidx_oms_rule_config_country   on oms_rule_configs (country_id)   where scope_type = 'country';
create unique index if not exists uidx_oms_rule_config_global    on oms_rule_configs ((true))        where scope_type = 'global';

-- Seed GLOBAL: default aplicado a quien no tenga una regla más específica.
insert into oms_rule_configs (scope_type, priorizar, reglas, dias_prep_picking)
values (
  'global', true,
  '{"fecha_t1": {"aplica": true, "peso": 1.0},
    "observaciones": {"aplica": true, "peso": 1.0},
    "cliente_retira": {"aplica": true, "peso": 0.0, "prioridad": 1}}'::jsonb,
  1
);

-- Seed EPA (scope CUSTOMER): NO se prioriza, ya viene priorizado desde EFLOW; solo
-- se libera por fecha. Resuelve la compañía por código (independiente del UUID del
-- entorno); si EPA no existe en este entorno, no inserta nada.
insert into oms_rule_configs (scope_type, customer_id, priorizar, reglas, dias_prep_picking)
select 'customer', c.id, false, '{}'::jsonb, 1
from customers c
where c.code = 'EPA';

do $$
begin
  if to_regclass('public.oms_rule_configs') is null then
    raise exception 'Validación sql/52: FALTA crear oms_rule_configs';
  end if;
  if not exists (select 1 from oms_rule_configs where scope_type = 'global') then
    raise exception 'Validación sql/52: falta la fila GLOBAL';
  end if;
  raise notice 'Validación sql/52: OK';
end $$;

-- ROLLBACK:
-- drop table if exists oms_rule_configs;

commit;
