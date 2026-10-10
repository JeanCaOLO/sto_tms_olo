# P1b — alternativa: agregar la columna `updated_at` a `tarifas_pricing_rules`

Solo si se quiere conservar "cuándo se editó la regla" en la propia fila (hoy la bitácora ya guarda
fecha, autor, antes y después de cada cambio).

1. `sql/32_tarifas_reglas_updated_at.sql` (idempotente):

       alter table tarifas_pricing_rules
         add column if not exists updated_at timestamptz not null default now();

2. `src/lib/tarifas/data/schema.ts`, entidad `pricingRule`, junto a `version`:

       updated_at: { type: 'timestamptz' },

3. `npm run tarifas:manifest` (regenera `backend/tarifas/src/schema_manifest.json`).
4. Desplegar el backend. Hasta que el manifiesto desplegado incluya la columna, el 400 sigue.
5. La semilla demo y `fixtures/seed.json` no necesitan cambios (el mock no valida columnas).

Riesgo: toca esquema de Aurora y exige despliegue de Intelix; mientras tanto, la edición de reglas
sigue rota. P1a no tiene ese riesgo.
