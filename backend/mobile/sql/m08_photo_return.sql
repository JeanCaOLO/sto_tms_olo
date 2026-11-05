-- ============================================================================
-- m08 — Devolución contracamión: `tbl_tracking_evidences.kind` acepta `photo_return` (foto del artículo que el
-- chofer devuelve en la parada). BD COMPARTIDA con el TMS (aditivo e idempotente: solo AMPLÍA el CHECK).
-- No toca `tbl_returns`: `return_type` no tiene CHECK, así que `'contracamion'` entra sin migración.
--
-- Se aplica con `python scripts/migrate.py sql/m08_photo_return.sql` (dry-run por defecto; --execute aplica).
--
-- ROLLBACK (solo si no hay filas con kind = 'photo_return'):
--   alter table tbl_tracking_evidences drop constraint if exists ck_tracking_evidence_kind;
--   alter table tbl_tracking_evidences add constraint ck_tracking_evidence_kind
--     check (kind in ('photo_invoice', 'photo_product', 'signature', 'photo_other'));
-- ============================================================================

begin;

alter table tbl_tracking_evidences drop constraint if exists tracking_evidences_kind_check;
alter table tbl_tracking_evidences drop constraint if exists ck_tracking_evidence_kind;
alter table tbl_tracking_evidences add constraint ck_tracking_evidence_kind
  check (kind in ('photo_invoice', 'photo_product', 'photo_return', 'signature', 'photo_other'));

commit;
