# 003 — Editar (mover pedidos) y confirmar el plan

- **Status:** Delivered
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Branch:** planificacion-2
- **Depends on:** 001

## Narrative

Como planificador, quiero ajustar un plan en borrador moviendo pedidos entre viajes y luego confirmarlo, para dejarlo listo para operación cuando esté conforme.

## Acceptance criteria

1. Solo un plan en estado `draft` es editable.
2. En cada parada de un viaje `draft` hay un selector **"Mover a…"** con los otros viajes del plan como destino.
3. Al mover un pedido a otro viaje, el servidor **revalida la capacidad** del viaje destino y **recalcula la secuencia** de paradas; si el pedido no cabe, la operación se rechaza.
4. El botón **Confirmar** pasa el plan de `draft` a `confirmed`; a partir de ahí deja de ser editable.
5. Tras confirmar, la vista cambia a la pestaña de Planificaciones.

## Edge cases

- Mover el último pedido de un viaje → el viaje queda vacío (se maneja sin romper el plan).
- Intentar editar un plan ya confirmado → no se ofrecen controles de edición.
- Mover un pedido que haría exceder la capacidad del destino → rechazo con el margen (85% peso / 95% volumen).

## Test scenarios

- **Mover un pedido entre viajes y confirmar**
  - **Steps:** generar plan `draft` → en una parada elegir "Mover a" otro viaje → ver que la parada aparece en el destino con la secuencia recalculada → Confirmar → el plan queda `confirmed` y no editable.
  - **Data:** plan `draft` con ≥2 viajes de `2026-10-09`.
  - **Expected result:** el pedido queda en el viaje destino; al confirmar, estado `confirmed` y controles de edición ocultos.

## Out of scope

- Estado por viaje (completar/cancelar/reabrir) → story 004.

## Open questions

- (vacío)

## Changes

- (vacío)

## Validation

- Comportamiento disponible en `PlanEditor` (draft editable) + endpoint PUT /planes/{id} que revalida capacidad y recalcula secuencia.
