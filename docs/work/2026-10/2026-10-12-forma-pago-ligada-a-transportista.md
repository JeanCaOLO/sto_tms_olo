# 2026-10-12 — Forma de pago ligada al transportista (paso 1 de 2)

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

## Follow-ups

- [ ] Claude: crear `carriers.rate_type` (text, nullable; valores del enum) y
      whitelistearla. Responder la pregunta de diseño: ¿vive en `carriers` o en
      el perfil `settlement_party` (1:1 con el carrier)?
- [ ] Paso 2 (Kiro, cuando exista la columna): heredar `rate_type` en
      `calculateTrip`, quitar el selector de Liquidaciones, tests de regresión.
