-- ============================================================================
-- m05 — Recolectas (Tracking): tipo de parada explícito en la guía. BD COMPARTIDA con el TMS (aditivo e idempotente).
--
--   dispatch_guides.stop_type   'delivery' (por defecto) o 'collection' = parada para BUSCAR mercancía ya entregada
--                               (distinta de la devolución inmediata en sitio del botón «Devoluciones»). Es lo que leen
--                               la app del chofer y el monitor de Tracking. Hoy nadie la fija en 'collection':
--                               Planificación la asignará cuando se acuerde con ellos; no se toca plan_stops.
--
-- ROLLBACK: alter table dispatch_guides drop column if exists stop_type;
-- ============================================================================

alter table dispatch_guides add column if not exists stop_type text not null default 'delivery';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ck_dispatch_guide_stop_type') then
    alter table dispatch_guides add constraint ck_dispatch_guide_stop_type check (stop_type in ('delivery', 'collection'));
  end if;
end $$;
