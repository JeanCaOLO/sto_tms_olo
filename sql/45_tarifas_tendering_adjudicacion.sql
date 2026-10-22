-- ============================================================================
-- 45 — Adjudicación de tendering por viaje (tarifador, 2026-10-20).
--
--   tarifas_trip_tender_awards   una fila por viaje con el monto que se le adjudicó a un
--       transportista. Con carriers.rate_type = 'TENDERING' ese monto ES la base del viaje: se liquida
--       como tarifa fija (mismo camino que carriers.flat_rate_amount, sql/36). Sin adjudicación, el
--       cálculo queda bloqueado con el motivo (no cae a otra base).
--
-- "Tendering" es un proceso de asignación (se ofrece el viaje a transportistas ranqueados y uno
-- acepta), no una fórmula. Este script solo guarda su RESULTADO; el proceso completo (ofertas,
-- ranking, cascada) está pendiente: ver docs/arquitectura-tms-oms/05-roadmap.md, Fase 11.
--
-- Idempotente. Solo agrega una tabla nueva: no cambia el resultado de ninguna liquidación existente.
-- Ejecutarlo en la base es decisión de quien administra la BD; el despliegue lo hace Intelix.
-- ============================================================================

begin;

create table if not exists tarifas_trip_tender_awards (
  id text primary key,
  country_id uuid not null,
  trip_id uuid not null,
  carrier_id uuid not null,
  amount numeric not null,
  awarded_at timestamptz,
  actor text,
  notes text,
  constraint tarifas_trip_tender_awards_country_id_fkey foreign key (country_id) references countries (id),
  constraint tarifas_trip_tender_awards_trip_id_fkey foreign key (trip_id) references routes (id),
  constraint tarifas_trip_tender_awards_carrier_id_fkey foreign key (carrier_id) references carriers (id),
  constraint tarifas_trip_tender_awards_amount_check check (amount >= 0)
);
create index if not exists tarifas_trip_tender_awards_country_id_idx on tarifas_trip_tender_awards (country_id);
create index if not exists tarifas_trip_tender_awards_trip_id_idx on tarifas_trip_tender_awards (trip_id);
create index if not exists tarifas_trip_tender_awards_carrier_id_idx on tarifas_trip_tender_awards (carrier_id);
create unique index if not exists tarifas_trip_tender_awards_uq on tarifas_trip_tender_awards (trip_id);

commit;
