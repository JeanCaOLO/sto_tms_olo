# 2026-10-12 — Forma de pago ligada al transportista (pasos 1 y 2)

## What changed (frontend — paso 1)

El tipo de pago/liquidación (por km / unidad / volumen / fijo / tendering) se
asigna ahora en el **catálogo de Transportistas**:
- `src/pages/transportistas/components/CarrierModal.tsx`: nuevo Select
  "Forma de pago / liquidación" con los 5 tipos, reusando `BASE_METHODS` /
  `BASE_METHOD_ORDER` del motor de tarifas (no se inventó enum nuevo). Guarda
  `carriers.rate_type` (string = `BaseMethodId`, nullable). Nota en el modal:
  la liquidación lo hereda de aquí.
- `src/pages/transportistas/page.tsx`: columna "Forma de pago" en la lista.
- `src/i18n/local/{es,en}/carriers.ts`: `carriers.colRateType`.

## Why

Pedido del usuario: ligar el tipo de pago al transportista y **quitar** de
Liquidaciones la opción de elegir la forma de pago (debe heredarse). En el
catálogo de Transportistas se define cómo se le paga/liquida.

## How — decisión de secuencia (opción A, acordada con el usuario)

Investigación previa (context-gatherer): la "forma de pago" en Liquidaciones es
el panel "Base del cálculo" (`BaseMethodPanel.tsx`), un override manual por
viaje con `BaseMethodId`. `carriers` no tenía campo de tipo de pago. El cálculo
(`src/lib/tarifas/tripSettlement.ts`) ya resuelve el perfil del transportista y
sabe aplicar un `baseOverride`.

Se hace en **2 pasos** para no romper Liquidaciones (módulo en uso; `project.md`
exige tests de regresión antes de tocarlo):
- **Paso 1 (este):** campo en el catálogo de Transportistas. Defensivo: si la
  columna `rate_type` no existe aún, no rompe; persiste en cuanto Claude la cree.
- **Paso 2 (pendiente, coordinado con Claude):** cablear `calculateTrip` para
  heredar `rate_type` del transportista como `baseOverride` automático, **quitar**
  el `BaseMethodPanel` de Liquidaciones, con tests de regresión. NO se hizo aún
  para no dejar el cálculo sin saber qué base usar.

## Verification

- type-check (`tsc --noEmit`): **0 errores**.

## Paso 2 — HECHO (2026-10-12, misma fecha)

Con `carriers.rate_type` ya en Aurora (sql/35 de Claude) + decisión: vive en
`carriers` (fuente de verdad del catálogo, no en `settlement_party`).

- **Herencia en el cálculo:** `src/lib/tarifas/partiesDataSource.ts` →
  `rateTypeToOverride()` (puro) + `rateTypeOverrideForCarrier()` (lee la columna
  con caché corta). `src/lib/tarifas/tripSettlement.ts` → `calculateTrip` deriva
  `baseOverride = options.baseOverride ?? rateTypeOverrideForCarrier(carrierId)`.
  TENDERING / vacío / desconocido → null (base por defecto; no fuerza base sin
  fórmula). `carrier.rate_type` agregado a `schema.ts` + manifiesto del backend
  regenerado (`npm run tarifas:manifest`).
- **Selector quitado:** borrados `BaseMethodPanel.tsx` y `CrearReglaBase.tsx`
  (huérfanos); `CalculationContent` muestra un bloque informativo de solo
  lectura. Props `baseMethod`/`onBaseChange`/etc. limpiadas de la cadena.
- **Tests:** borrado `LiquidarViajeModal.base.test.tsx` (probaba el selector
  eliminado por diseño); snapshot de `LiquidarViajeModal.snap.test.tsx`
  actualizado; regresión nueva en `partiesDataSource.test.ts` (clasificación de
  `rate_type` → override). Verificación: type-check 0, **vitest 775/775**
  (tarifas + liquidaciones + transportistas).
- Re-liquidación: respeta la base emitida previa (flujo `settlement.baseChange`
  intacto). Deuda menor: `useLiquidarViajeController` aún expone
  `baseMethod`/`changeBase` sin consumidor de UI (los usa el re-check).

## Follow-ups

- [ ] Claude: confirmar/desplegar el manifiesto del backend regenerado
      (`backend/tarifas/src/schema_manifest.json`) junto con el resto.
- [ ] Opcional (Kiro): limpiar `baseMethod`/`changeBase` del controller si se
      decide no soportar override en re-liquidación.
