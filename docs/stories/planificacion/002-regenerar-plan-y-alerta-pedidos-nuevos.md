# 002 — Regenerar el plan y alerta de pedidos nuevos

- **Status:** Delivered
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Branch:** planificacion-2
- **Depends on:** 001

## Narrative

Como planificador, quiero poder **regenerar** el plan cuando entran pedidos nuevos para el día que estoy planificando, y que el sistema me **avise** que llegaron, para no quedarme con un plan desactualizado.

## Acceptance criteria

1. Cuando aún no hay plan, el botón dice **"Generar plan"**; una vez generado, el mismo botón pasa a decir **"Regenerar plan"** (con icono de refresco).
2. Al regenerar, el plan se rearma tomando **los pedidos actuales** del día (incluye los que llegaron después de la primera generación).
3. Si entran pedidos nuevos para ese día después de generar, aparece una **alerta visible en el botón**: se pone ámbar/pulsante con un **badge que indica cuántos pedidos nuevos** hay.
4. La alerta se recalcula periódicamente sin recargar la página.
5. Tras regenerar (que ya incluye los nuevos), la alerta vuelve a cero.

## Edge cases

- No hay plan todavía → no se muestra alerta (no hay base contra la cual comparar).
- Se cae la red al consultar → la alerta no molesta (no muestra números erróneos).
- Cambiar de día o de contexto operativo → la base de comparación se reinicia.

## Test scenarios

- **Llega un pedido nuevo y el botón avisa**
  - **Steps:** generar plan de `2026-10-13` → en otra terminal `node agregar_viajes_para_recalcular.js 2026-10-13 3` → esperar ≤15 s → ver el badge "3" sobre "Regenerar plan" → pulsar → el plan incorpora los 3.
  - **Data:** plan `draft` de `2026-10-13` ya generado; pedidos base `SEEDC-20261013-*`.
  - **Expected result:** aparece badge rojo "3" (botón ámbar/pulsante); tras regenerar, badge en 0 y los 3 pedidos están en el plan.

## Out of scope

- WebSocket real (hoy es polling cada 15 s; la detección vive aislada en `use-nuevos-pedidos.ts` para enchufar WS cuando haya infra — ver requirement 005).

## Open questions

- (vacío)

## Changes

- (vacío)

## Validation

- Verificado 2026-10-06: el badge aparece tras agregar pedidos al día y desaparece al regenerar.
