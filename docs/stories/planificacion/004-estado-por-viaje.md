# 004 — Estado por viaje: completar / cancelar / reabrir

- **Status:** Delivered
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Branch:** planificacion-2
- **Depends on:** 003

## Narrative

Como planificador, quiero marcar cada viaje de un plan confirmado como completado o cancelado (y poder reabrirlo), para reflejar lo que pasó en operación sin tocar el resto del plan.

## Acceptance criteria

1. En un plan **confirmado** (no editable), cada viaje muestra su estado (`pending` / `completed` / `cancelled`) y las acciones disponibles.
2. **Completar** lleva el viaje a `completed`; **Cancelar** lo lleva a `cancelled`; **Reabrir** lo devuelve a `pending`.
3. El estado es **por viaje e independiente del plan y de los demás viajes**.
4. Las transiciones son **reversibles** (reabrir siempre disponible salvo cuando ya está `pending`).
5. La pestaña de Planificaciones refleja los viajes completados/cancelados por plan.

## Edge cases

- Reabrir un viaje ya `pending` → la acción no se ofrece.
- Transición inválida en backend → se rechaza (`TransicionViajeInvalida`) sin dejar el viaje en estado inconsistente.

## Test scenarios

- **Completar y luego reabrir un viaje**
  - **Steps:** confirmar un plan → en un viaje pulsar Completar (queda `completed`) → pulsar Reabrir (vuelve a `pending`).
  - **Data:** plan `confirmed` con ≥1 viaje.
  - **Expected result:** el pill de estado del viaje cambia a Completado y luego a Pendiente; los otros viajes no cambian.

## Out of scope

- Estatus de **entrega/recepción** de devoluciones (pendiente, ligado a IPRAC — ver reunión 2026-10-05).

## Open questions

- Falta el estado de **recepción** para devoluciones (no se puede liquidar sin recepción). Owner: negocio/Ricardo.

## Changes

- (vacío)

## Validation

- Backend: `estados_viaje.py` (máquina PENDING/COMPLETED/CANCELLED) + rutas /viajes/{tripId}/completar|cancelar|reabrir. Front: botones en `PlanTripCard`.
