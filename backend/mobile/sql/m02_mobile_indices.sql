-- ============================================================================
-- m02 — App móvil del chofer: índices de rendimiento. BD COMPARTIDA con el TMS (aditivo e idempotente).
--
--   ix_routes_driver_org            viajes de un conductor (consulta "mi-viaje" y validación de /posiciones). Sin él,
--                                   la consulta filtra por lower(status) y recorre todas las rutas activas.
--   ix_dispatch_guides_route        paradas de un viaje (mi-viaje, transición, conteo de entregadas). Se crea solo si
--                                   no hay ya un índice que empiece por route_id (el TMS puede tenerlo).
--   ix_mobile_refresh_expires       purga de sesiones vencidas o revocadas (la tabla crece con cada login/rotación).
--
-- No toca datos ni columnas. Se aplica con `python scripts/migrate.py sql/m02_mobile_indices.sql`
-- (dry-run por defecto; --execute aplica). Antes de aplicar, `EXPLAIN` de las consultas en
-- `.test/optimizacion-backend.md`.
--
-- Purga recomendada (la corre un job de Intelix o a mano; NO se ejecuta en esta migración):
--   delete from mobile_refresh_tokens
--    where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days';
-- ============================================================================

begin;

create index if not exists ix_routes_driver_org on routes (driver_id, organization_id) where driver_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where tablename = 'dispatch_guides' and indexdef ~* '\(route_id[,)]'
  ) then
    create index ix_dispatch_guides_route on dispatch_guides (route_id, sequence_number);
  end if;
end $$;

create index if not exists ix_mobile_refresh_expires on mobile_refresh_tokens (expires_at);

commit;
