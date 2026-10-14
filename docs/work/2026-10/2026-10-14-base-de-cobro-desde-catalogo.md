# 2026-10-14 — La base de cálculo sale siempre del catálogo (terceros) o de la estructura de costos (flota propia)

## What changed

- **Terceros**: `calculateTrip` (`src/lib/tarifas/tripSettlement.ts`) toma la base siempre de
  `carriers.rate_type` (+ `flat_rate_amount`) vía `carrierBaseForCarrier` / `resolveCarrierBase`
  (`partiesDataSource.ts`). Sin forma de cobro, con TENDERING, valor desconocido, monto fijo inválido
  o viaje sin transportista, el cálculo queda bloqueado con el issue `BASE_NO_DEFINIDA` (ya no cae a km).
  FIXED sin monto usa la regla BASE fija del tercero.
- **Flota propia**: el kernel (`src/lib/tarifas/index.ts`) ignora cualquier `baseOverride` cuando
  `fleetType === 'OWN'`; la base es la estructura de costos.
- Se eliminó `options.baseOverride` de `CalculateTripOptions`, `baseMethods` de `TripCalculation` y el
  hook `useBaseOverride`; re-liquidar y `recheckBeforeEmit` recalculan desde el catálogo vigente (se
  corrige que un FIXED perdiera su monto al re-liquidar).
- `DetalleLiquidacionModal`: "Base cambiada a…" → "Base de cobro: …".
- `sql/37_tarifas_reglas_base_por_tercero.sql`: crea el perfil de cálculo de cada tercero y 4 reglas
  BASE PARTY (km, unidad, volumen, fija), idempotente, y **activa** las reglas BASE de tercero que
  existieran desactivadas. **No se ha ejecutado contra ninguna BD**; aplicarlo es decisión del dueño de la BD.
- Seeds de prueba/demo: carriers terceros con `rate_type: 'FIXED'` (`seed.json`, `scripts/build-demo-seed.ts`
  y `seed.demo.json` regenerado).

## Why

El botón "Cambiar base" se eliminó: la forma de cobro del tercero la define el catálogo de Transportistas.

## Pendiente / riesgos

- Transportistas terceros sin `rate_type` quedarán bloqueados hasta que se les asigne.
- `tariff_types` (sql/05) sigue sin conectarse al motor; el motor usa `BaseMethodId`.
- `base_change` sigue persistiéndose en cada emisión (ahora informativo).
