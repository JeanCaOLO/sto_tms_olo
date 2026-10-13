-- ============================================================================
-- 30 — Base de cálculo cambiada por el liquidador.
--
-- Al liquidar, la persona puede cambiar la fase BASE por otro tipo de cobro (km, unidad, fija,
-- volumen). La liquidación guarda cuál eligió, de dónde salió (regla, tarifario o estructura de
-- costos), qué dejó de aplicar, y quién y cuándo lo cambió: es lo que permite auditarla y
-- re-liquidarla.
--
--   * tarifas_settlements.base_change: jsonb nulo. Nulo = se usó la base por defecto.
--
-- Aditiva e idempotente. El frontend solo escribe esta columna cuando hay cambio de base, así que
-- liquidar con la base por defecto no depende de que esté aplicada.
-- ============================================================================

alter table tarifas_settlements add column if not exists base_change jsonb;
