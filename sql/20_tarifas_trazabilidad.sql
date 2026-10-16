-- Trazabilidad del desglose: la liquidación guarda las reglas del catálogo que produjeron líneas,
-- tal como estaban al emitir, para poder explicar el "por qué" aunque la regla cambie o se borre.
-- Idempotente. Modelo en src/lib/tarifas/data/schema.ts (columna `rules_used` de `settlement`).

ALTER TABLE tarifas_settlements
  ADD COLUMN IF NOT EXISTS rules_used jsonb NOT NULL DEFAULT '[]'::jsonb;
