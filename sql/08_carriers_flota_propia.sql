-- ============================================================================
-- Marca qué transportistas (carriers) son flota PROPIA de la empresa vs.
-- terceros. Necesario para que Planificación pueda priorizar flota propia al
-- repartir pedidos entre camiones (mandato Jean Carlo, 2026-09-16/21:
-- "Planificación debe generar automáticamente con prioridad a flota propia y
-- por fecha de entrega" — ver aidlc/spaces/default/memory/project.md).
--
-- Antes de esto no había ningún campo explícito para esto - depender del
-- nombre del carrier ("OLO") para detectarlo es frágil (server/tms-routes.mjs
-- y toda la app de todos modos NUNCA deben inferir "propio" por nombre).
--
-- Nunca destructivo: columna nueva con default seguro (false = tercero,
-- el comportamiento actual no cambia hasta que se marque explícitamente).
-- ============================================================================

begin;

alter table carriers add column if not exists is_flota_propia boolean not null default false;

comment on column carriers.is_flota_propia is
  'true = flota propia de la empresa (prioridad en el reparto automático de Planificación); false = transportista tercero.';

commit;
