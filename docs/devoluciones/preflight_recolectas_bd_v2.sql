-- Entregable para Jean: inspección previa, sin aplicar ni reservar migraciones.
-- Ejecutar con una conexión autorizada al ambiente correcto. Este archivo no se
-- ejecutó contra Aurora durante la preparación. Versión para revisión del contrato BD v2.
-- No usar run-migration.mjs:
-- el runner crea/escribe schema_migrations y no corresponde a esta inspección.
begin transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select current_database() as database_name, current_user as role_name,
       current_setting('server_version') as postgres_version,
       current_setting('transaction_read_only') as read_only;

-- Existencia: NULL significa ausente, no una migración que deba reaplicarse.
select name, to_regclass('public.' || name) as effective_relation
from (values
 ('schema_migrations'), ('tbl_return_requests'), ('tbl_return_request_items'),
 ('tbl_return_incidents'), ('tbl_return_incident_resolutions'),
 ('tbl_return_request_origins'), ('tbl_return_request_outbox'),
 ('tbl_return_collection_events'), ('tbl_return_collection_assignments'),
 ('tbl_return_collection_allocations'),
 ('tbl_return_collection_results'), ('tbl_returns'), ('tbl_plan_trips'),
 ('tbl_plan_stops'), ('tbl_routes'), ('tbl_dispatch_guides')
) as expected(name)
order by name;

select table_name, column_name, data_type, numeric_precision, numeric_scale,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in (
 'tbl_return_requests', 'tbl_return_request_items', 'tbl_return_request_origins',
 'tbl_return_incidents', 'tbl_return_incident_resolutions',
 'tbl_return_request_outbox', 'tbl_return_collection_events',
 'tbl_return_collection_assignments', 'tbl_return_collection_results',
 'tbl_return_collection_allocations',
 'tbl_returns', 'tbl_plan_trips', 'tbl_plan_stops', 'tbl_routes', 'tbl_dispatch_guides')
order by table_name, ordinal_position;

select cls.relname as table_name, con.conname as constraint_name,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class cls on cls.oid = con.conrelid
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname = 'public' and cls.relname like 'tbl_return%'
order by cls.relname, con.conname;

select cls.relname as table_name, trg.tgname as trigger_name,
       pg_get_triggerdef(trg.oid) as definition
from pg_trigger trg
join pg_class cls on cls.oid = trg.tgrelid
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname = 'public' and not trg.tgisinternal and cls.relname like 'tbl_return%'
order by cls.relname, trg.tgname;

-- El registro puede no reflejar una corrección manual: contrastar también guards
-- y función de saldo efectivos, sin modificar funciones ni sus checksums.
select ns.nspname as schema_name, proc.proname as function_name,
       pg_get_function_identity_arguments(proc.oid) as arguments,
       pg_get_functiondef(proc.oid) as definition
from pg_proc proc
join pg_namespace ns on ns.oid = proc.pronamespace
where ns.nspname = 'public' and proc.proname in (
 'return_balance_76', 'guard_return_origin_76',
 'guard_return_incident_resolution_75', 'check_return_incident_resolution_75',
 'guard_return_leaves_review_75', 'guard_return_collection_event_77',
 'guard_return_collection_assignment_77','guard_return_collection_allocation_77',
 'guard_return_collection_result_77','assign_return_collection_v2',
 'bind_return_collection_v2','cancel_return_collection_v2',
 'record_return_collection_evaluation_v2')
order by proc.proname, arguments;

-- Si schema_migrations no existe o el rol no puede leerla, detenerse y pedir la
-- evidencia al dueño. No crear la tabla ni ampliar permisos para esta consulta.
select name, checksum, applied_at
from public.schema_migrations
where name ~ '^(6[0-9]|7[0-9])_'
order by name;

rollback;
