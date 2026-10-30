-- ============================================================================
-- 54 — Tracking: cada evidencia de entrega (foto de factura, firma) identifica su PEDIDO y su bucket.
--
--   tracking_evidences.order_id        pedido de la parada (dispatch_guides.order_id) al subir la evidencia.
--   tracking_evidences.order_number    número del pedido en ese momento (copia: sigue legible aunque el pedido se
--                                      borre o se regenere; el FK queda en NULL con `on delete set null`).
--   tracking_evidences.storage_bucket  bucket S3 donde vive el archivo. NULL = bucket del stack tracking
--                                      (evidencias anteriores a este cambio). La app del chofer (backend/mobile)
--                                      sube ahora a su bucket propio `<env>-tms-mobile-evidencias-<cuenta>`, con
--                                      llave `pedidos/<order_number>/<order_id>/<kind>-<uuid>.<ext>`.
--
-- Rellena order_id/order_number de las evidencias existentes desde su parada. Aditivo e idempotente: el código
-- anterior (que no conoce estas columnas) sigue funcionando. Aplicar ANTES de desplegar los stacks mobile y tracking.
-- Se aplica con scripts/run-migration.mjs (dry-run por defecto).
-- ============================================================================

begin;

alter table tracking_evidences add column if not exists order_id uuid;
alter table tracking_evidences add column if not exists order_number text;
alter table tracking_evidences add column if not exists storage_bucket text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_tracking_evidence_order') then
    alter table tracking_evidences add constraint fk_tracking_evidence_order
      foreign key (order_id) references orders(id) on delete set null;
  end if;
end $$;

create index if not exists idx_tracking_evidence_order on tracking_evidences (order_id) where order_id is not null;
create index if not exists idx_tracking_evidence_order_number on tracking_evidences (order_number)
  where order_number is not null;

comment on column tracking_evidences.order_id is 'Pedido de la parada al subir la evidencia (dispatch_guides.order_id).';
comment on column tracking_evidences.order_number is 'Número del pedido al subir la evidencia (copia legible).';
comment on column tracking_evidences.storage_bucket is 'Bucket S3 del archivo; NULL = bucket del stack tracking.';

update tracking_evidences e
   set order_id = g.order_id, order_number = o.order_number
  from dispatch_guides g
  left join orders o on o.id = g.order_id
 where g.id = e.dispatch_guide_id and e.order_id is null and g.order_id is not null;

-- Validación: ninguna evidencia con parada con pedido queda sin pedido.
do $$
declare faltan integer;
begin
  select count(*) into faltan
    from tracking_evidences e join dispatch_guides g on g.id = e.dispatch_guide_id
   where g.order_id is not null and e.order_id is null;
  if faltan > 0 then
    raise exception 'Quedaron % evidencias sin order_id', faltan;
  end if;
end $$;

commit;

-- ROLLBACK (manual; antes, volver a desplegar mobile y tracking sin estas columnas):
--   begin;
--   drop index if exists idx_tracking_evidence_order_number;
--   drop index if exists idx_tracking_evidence_order;
--   alter table tracking_evidences drop constraint if exists fk_tracking_evidence_order;
--   alter table tracking_evidences drop column if exists storage_bucket, drop column if exists order_number,
--     drop column if exists order_id;
--   commit;
