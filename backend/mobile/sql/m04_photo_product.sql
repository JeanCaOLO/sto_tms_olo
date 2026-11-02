-- ============================================================================
-- m04 — Recolectas: `tracking_evidences.kind` acepta `photo_product` (foto del producto que se retira).
-- BD COMPARTIDA con el TMS (aditivo e idempotente: solo AMPLÍA el CHECK, ningún valor existente deja de valer).
--
-- ROLLBACK (solo si no hay filas con kind = 'photo_product'):
--   alter table tracking_evidences drop constraint if exists ck_tracking_evidence_kind;
--   alter table tracking_evidences add constraint tracking_evidences_kind_check
--     check (kind in ('photo_invoice', 'signature', 'photo_other'));
-- ============================================================================

alter table tracking_evidences drop constraint if exists tracking_evidences_kind_check;
alter table tracking_evidences drop constraint if exists ck_tracking_evidence_kind;
alter table tracking_evidences add constraint ck_tracking_evidence_kind
  check (kind in ('photo_invoice', 'photo_product', 'signature', 'photo_other'));
