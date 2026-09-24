-- ============================================================================
-- 17 — Bitácora de auditoría particionada por mes.
--
-- Decisión del usuario (2026-09-24): la bitácora crece sin límite (no se
-- borra nada), pero con acceso rápido a por lo menos los últimos 3 meses.
--   * audit.events pasa a ser una tabla particionada por RANGO de occurred_at,
--     una partición por mes (audit.events_YYYY_MM). Una consulta por fecha
--     solo lee los meses que pide; los índices de cada mes son chicos.
--   * audit.events_default atrapa cualquier fila fuera de las particiones
--     creadas (red de seguridad: una inserción nunca falla por falta de mes).
--   * audit.ensure_partitions(meses) crea los meses que falten desde el mes
--     actual hacia adelante. Se crean ya hasta 2027-12 y el mantenimiento
--     mensual (backend/admin, AuditMaintenanceFunction) la llama cada mes.
--   * Los meses viejos NO se borran: se podrán desadjuntar y archivar
--     (DETACH PARTITION) si algún día el volumen lo pide, sin tocar los
--     recientes.
-- Copia los eventos existentes con el mismo id. Idempotente: si audit.events
-- ya está particionada, no hace nada salvo asegurar particiones.
-- ============================================================================

begin;

do $$
begin
  if exists (select 1 from pg_partitioned_table pt join pg_class c on c.oid = pt.partrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'audit' and c.relname = 'events') then
    return;  -- ya particionada
  end if;

  lock table audit.events in access exclusive mode;
  alter table audit.events rename to events_unpartitioned;
  alter index if exists audit.events_pkey rename to events_unpartitioned_pkey;
  alter index if exists audit.events_occurred_at_idx rename to events_unpartitioned_occurred_at_idx;
  alter index if exists audit.events_entity_idx rename to events_unpartitioned_entity_idx;
  alter index if exists audit.events_app_user_idx rename to events_unpartitioned_app_user_idx;
  alter index if exists audit.events_module_idx rename to events_unpartitioned_module_idx;
  alter index if exists audit.events_action_idx rename to events_unpartitioned_action_idx;

  create sequence audit.event_ids;

  create table audit.events (
    id           bigint not null default nextval('audit.event_ids'),
    occurred_at  timestamptz not null default clock_timestamp(),
    actor_type   text not null check (actor_type in ('user', 'system', 'anonymous')),
    auth_user_id uuid,
    app_user_id  uuid,
    actor_email  text,
    role_name    text,
    source       text not null,
    action       text not null,
    module_key   text,
    entity_table text,
    entity_id    text,
    changes      jsonb,
    before       jsonb,
    after        jsonb,
    request_id   text,
    ip           text,
    user_agent   text,
    metadata     jsonb,
    primary key (id, occurred_at)
  ) partition by range (occurred_at);

  alter sequence audit.event_ids owned by audit.events.id;
  create table audit.events_default partition of audit.events default;
  create trigger events_no_truncate before truncate on audit.events_default
    for each statement execute function audit.forbid_change();
end $$;

create index if not exists events_occurred_at_idx on audit.events (occurred_at desc);
create index if not exists events_entity_idx on audit.events (entity_table, entity_id, occurred_at desc);
create index if not exists events_app_user_idx on audit.events (app_user_id, occurred_at desc);
create index if not exists events_module_idx on audit.events (module_key, occurred_at desc);
create index if not exists events_action_idx on audit.events (action, occurred_at desc);

-- Crea la partición de cada mes entre el mes actual (o `from_month`) y
-- `months_ahead` meses después. Devuelve cuántas creó.
create or replace function audit.ensure_partitions(months_ahead int default 3, from_month date default null)
returns int language plpgsql as $$
declare
  first_month date := date_trunc('month', coalesce(from_month, current_date))::date;
  month_start date;
  created int := 0;
begin
  for i in 0..months_ahead loop
    month_start := (first_month + make_interval(months => i))::date;
    if to_regclass(format('audit.events_%s', to_char(month_start, 'YYYY_MM'))) is null then
      execute format('create table audit.%I partition of audit.events for values from (%L) to (%L)',
                     'events_' || to_char(month_start, 'YYYY_MM'), month_start,
                     (month_start + interval '1 month')::date);
      -- TRUNCATE directo sobre la partición no dispara el trigger de la tabla madre.
      execute format('create trigger events_no_truncate before truncate on audit.%I '
                     'for each statement execute function audit.forbid_change()',
                     'events_' || to_char(month_start, 'YYYY_MM'));
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;

select audit.ensure_partitions(15, date '2026-09-01');  -- 2026-09 … 2027-12

-- Copia lo que había (mismos ids) y sigue la numeración desde ahí.
do $$
begin
  if to_regclass('audit.events_unpartitioned') is not null then
    insert into audit.events (id, occurred_at, actor_type, auth_user_id, app_user_id, actor_email, role_name,
                              source, action, module_key, entity_table, entity_id, changes, before, after,
                              request_id, ip, user_agent, metadata)
    select id, occurred_at, actor_type, auth_user_id, app_user_id, actor_email, role_name, source, action,
           module_key, entity_table, entity_id, changes, before, after, request_id, ip, user_agent, metadata
      from audit.events_unpartitioned;
    perform setval('audit.event_ids', (select coalesce(max(id), 0) + 1 from audit.events), false);
    drop table audit.events_unpartitioned;
  end if;
end $$;

-- Solo inserción, igual que antes (ahora sobre la tabla particionada).
drop trigger if exists events_append_only on audit.events;
create trigger events_append_only before update or delete on audit.events
  for each row execute function audit.forbid_change();
drop trigger if exists events_no_truncate on audit.events;
create trigger events_no_truncate before truncate on audit.events
  for each statement execute function audit.forbid_change();

commit;
