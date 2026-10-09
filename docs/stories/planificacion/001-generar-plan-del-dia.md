# 001 — Generar el plan del día

- **Status:** Delivered
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Branch:** planificacion-2
- **Depends on:** None

## Narrative

Como planificador, quiero generar el plan de reparto de un día elegido a partir de los pedidos de ese día, para obtener los viajes con sus paradas sin armarlos a mano.

## Acceptance criteria

1. Elijo un día en el selector; el sistema muestra cuántos pedidos y cuántos vehículos hay para ese día (en el contexto operativo activo).
2. Al pulsar **Generar plan**, el sistema crea un plan en estado `draft` con uno o más viajes.
3. Los pedidos se **agrupan por zona de entrega**; dentro de cada zona se asignan a vehículos por **capacidad** (peso/volumen), priorizando la **flota propia**.
4. Dentro de cada viaje, las paradas quedan **secuenciadas** (orden de entrega optimizado), no en orden de llegada.
5. Los pedidos que no caben por capacidad aparecen listados como **sin asignar**.
6. Si el día no tiene pedidos, el botón se deshabilita y se muestra un aviso ("No hay pedidos para este día").

## Edge cases

- Día sin pedidos → no se puede generar; mensaje claro.
- Pedido sin coordenadas → entra al plan pero queda fuera del dibujo de ruta en el mapa.
- Sin vehículos disponibles → los pedidos quedan sin asignar.

## Test scenarios

- **Generar un plan de un día con varias zonas**
  - **Steps:** Login → Planificación → elegir día `2026-10-09` → Generar plan → ver los viajes.
  - **Data:** pedidos `SEEDC-20261009-*` en Aurora (zona foco con 16-20 pedidos + 2 zonas secundarias), vehículos de Costa Rica.
  - **Expected result:** se crea un plan `draft` con varios viajes; al menos un viaje con ~16 paradas; 0 pedidos sin asignar.

## Out of scope

- Edición de paradas (story 003), estado por viaje (004) y confirmación (003).
- Regla de piso de capacidad mínima 80% (requirement pendiente).

## Open questions

- (vacío)

## Changes

- (vacío)

## Validation

- Verificado end-to-end el 2026-10-06 generando el plan de `2026-10-09`: viaje de zona "07 Carretera" con 16 paradas, 0 sin asignar.
