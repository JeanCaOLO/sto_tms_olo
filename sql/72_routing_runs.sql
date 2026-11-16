-- ============================================================================
-- 72 — Registro de corridas del motor de ruteo (tbl_routing_runs), 2026-11-13.
--
-- ADR-005 / ADR-007: cada corrida del motor de ruteo deja su entrada y su resultado,
-- para explicar y reproducir un plan ("¿por qué este pedido fue en este camión?").
-- Una fila por (compañía, día) planificado, escrita por plan_builder en la MISMA
-- transacción que persiste el plan: si el plan se revierte, el registro también.
--
--   planning_run_id  = tbl_orders.planning_run_id de los pedidos que estampó la corrida.
--   motor            = el que corrió de verdad ('ortools' | 'heuristico');
--   motor_solicitado = el del interruptor MOTOR_RUTEO (difieren si el solver falló → error).
--   entrada          = pedidos (id, coordenadas, peso, volumen, zona), flota, sede y usos previos.
--   resultado        = viajes (zona, camión, pedidos en orden, peso, volumen, días de anticipación).
--   parametros       = márgenes, tope de paradas, costos y versión de OR-Tools usados.
--
-- Solo inserción para la app (tms_app: SELECT, INSERT). Es un registro de auditoría en sí
-- mismo: no lleva el trigger de audit.events. Retención: pendiente (≈ 70 filas por día hábil).
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/72_routing_runs.sql [--execute]
-- Deshacer con: sql/72_routing_runs_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

create table if not exists tbl_routing_runs (
  id                uuid        not null default gen_random_uuid(),
  planning_run_id   uuid        not null,
  organization_id   uuid        not null,
  warehouse_id      uuid        not null,
  customer_id       uuid        not null,
  plan_date         date        not null,
  plan_id           uuid,
  motor             text        not null,
  motor_solicitado  text        not null,
  region            text,
  deposito_origen   text,
  fuente_matriz     text,
  pedidos           integer     not null,
  viajes            integer     not null,
  km                numeric(12,1),
  duracion_ms       integer     not null,
  error             text,
  parametros        jsonb       not null default '{}'::jsonb,
  entrada           jsonb       not null,
  resultado         jsonb       not null,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  constraint pk_routing_runs primary key (id),
  constraint fk_routing_runs_organization_id foreign key (organization_id) references tbl_organizations (id),
  constraint fk_routing_runs_warehouse_id foreign key (warehouse_id) references tbl_warehouses (id),
  constraint fk_routing_runs_customer_id foreign key (customer_id) references tbl_customers (id),
  constraint ck_routing_runs_motor check (motor in ('ortools', 'heuristico')),
  constraint ck_routing_runs_motor_solicitado check (motor_solicitado in ('ortools', 'heuristico'))
);

create index if not exists idx_routing_runs_warehouse_id_plan_date on tbl_routing_runs (warehouse_id, plan_date);
create index if not exists idx_routing_runs_planning_run_id on tbl_routing_runs (planning_run_id);
create index if not exists idx_routing_runs_created_at on tbl_routing_runs (created_at);

comment on table tbl_routing_runs is
  'Una fila por corrida del motor de ruteo (compania, dia): entrada, resultado y parametros, para explicar y reproducir el plan (ADR-005, ADR-007). Solo insercion.';
comment on column tbl_routing_runs.motor is 'Motor que armo el plan: ortools | heuristico.';
comment on column tbl_routing_runs.motor_solicitado is 'Motor del interruptor MOTOR_RUTEO. Si difiere de motor, el solver fallo (ver error).';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    grant select, insert on public.tbl_routing_runs to tms_app;
  else
    raise notice 'tms_app no existe: se omite el GRANT (correr sql/18 primero)';
  end if;
end;
$$;

-- Validación.
do $$
begin
  if to_regclass('public.tbl_routing_runs') is null then
    raise exception '72: tbl_routing_runs no quedo creada';
  end if;
end;
$$;

commit;
