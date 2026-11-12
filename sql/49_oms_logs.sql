-- ============================================================================
-- 49 — Tabla de bitácora del OMS (oms_logs).
--
-- Observabilidad in-app del OMS: cada acción importante del motor (barrido,
-- priorización, liberación a eFlow, acción manual "Procesar a Eflow") y cada
-- error deja una fila aquí. La pestaña "Logs OMS" de la vista de Auditoría
-- (solo rol developer) la lee por /api/data/oms_logs. Complementa —no reemplaza—
-- los logs JSON que la Lambda ya manda a CloudWatch.
--
-- Nomenclatura OLTP Intelix: snake_case, entidad singular en constraints/índices
-- (oms_log), prefijos pk_/ck_/idx_.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/49_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/49_...sql --execute
-- ============================================================================

begin;

create table if not exists oms_logs (
  id                  uuid        not null default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  level               text        not null default 'info',
  action              text        not null,
  corrida_id          text,
  numero_viaje        text,
  eflow_id_expedicion text,
  message             text        not null,
  detail              jsonb,
  actor               text        not null default 'system',
  country_id          text,
  company_code        text,
  constraint pk_oms_log primary key (id),
  constraint ck_oms_log_level check (level in ('info', 'warn', 'error'))
);

-- Consulta típica de la pestaña: últimos N, más recientes primero.
create index if not exists idx_oms_log_created_at on oms_logs (created_at desc);
-- Filtro por severidad (ver solo errores) y por corrida.
create index if not exists idx_oms_log_level      on oms_logs (level);
create index if not exists idx_oms_log_corrida    on oms_logs (corrida_id);

do $$
begin
  if to_regclass('public.oms_logs') is null then
    raise exception 'Validación sql/49: FALTA crear oms_logs';
  end if;
  raise notice 'Validación sql/49: OK';
end $$;

-- ROLLBACK:
-- drop table if exists oms_logs;

commit;
