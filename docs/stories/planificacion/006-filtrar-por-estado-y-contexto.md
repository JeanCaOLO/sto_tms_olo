# 006 — Filtrar planificaciones por estado y por contexto operativo

- **Status:** Delivered
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Branch:** planificacion-2
- **Depends on:** 001

## Narrative

Como planificador, quiero ver la lista de planificaciones filtrada por estado y acorde al país/almacén/compañía que elegí en el headbar, para encontrar lo que me interesa sin recargar la página.

## Acceptance criteria

1. La pestaña **Planificaciones** lista los planes con su fecha, estado, nº de rutas y paradas.
2. Hay filtros por estado: todas / borrador / confirmado / completado / cancelado. "Completado" y "Cancelado" filtran por el **estado de los viajes** (un plan entra si tiene ≥1 viaje en ese estado); "Borrador"/"Confirmado" por el ciclo de vida del plan.
3. Al cambiar **país / almacén / compañía** en el headbar, **tanto la pestaña de Planificaciones como la de Generar se re-consultan en vivo** (sin recargar la página).
4. Cada plan se expande para ver sus viajes con el mismo detalle de la story 005.

## Edge cases

- Contexto sin planes → estado vacío con mensaje.
- Cambiar de compañía a media sesión → la lista se refiltra sola.

## Test scenarios

- **Cambiar de compañía refiltra en vivo**
  - **Steps:** en Planificaciones con compañía A → cambiar a compañía B en el headbar → la lista cambia sin recargar.
  - **Data:** planes de dos compañías distintas (COFERSA y EPA) en el mismo almacén.
  - **Expected result:** la lista pasa a mostrar los planes/pedidos de la compañía seleccionada sin F5.

## Out of scope

- La selección en sí del contexto (vive en el headbar / `useOperationalContext`).

## Open questions

- (vacío)

## Changes

- (vacío)

## Validation

- `usePlanesList` y `usePedidosDia` dependen del contexto operativo (país/almacén/cliente) en su efecto → re-fetch al cambiar. Verificado 2026-10-06.
