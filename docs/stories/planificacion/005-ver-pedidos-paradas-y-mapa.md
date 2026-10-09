# 005 — Ver pedidos, paradas y mapa de la ruta

- **Status:** Delivered
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Branch:** planificacion-2
- **Depends on:** 001

## Narrative

Como planificador, quiero ver cada viaje con su mapa, su secuencia de paradas y el detalle de los pedidos, incluso cuando varios pedidos se entregan en el mismo punto, para revisar el reparto de un vistazo.

## Acceptance criteria

1. Cada tarjeta de viaje muestra: zona, vehículo (placa + si es flota propia), barras de capacidad (peso/volumen) y un **mapa** con las paradas numeradas y la ruta por calles (OSRM).
2. Los pedidos que van al **mismo punto** (mismas coordenadas) comparten **color** en la lista y en el pin del mapa.
3. La lista de paradas muestra las **primeras 3**; si hay más, un botón **"Ver las N paradas" / "Ver menos"** las expande/colapsa.
4. Al tocar un pin del mapa que agrupa **varios pedidos**, se abre una **tabla del punto** (#, cliente, nº pedido, peso); al tocar una fila se abre el **detalle del pedido** (encima de la tabla). Si el punto tiene un solo pedido, va directo al detalle.
5. Botón **"Ver pedidos"** lista todos los pedidos del viaje **agrupados por punto**.
6. Cualquier modal se cierra al **hacer click fuera** o con **Escape**.

## Edge cases

- Viaje sin coordenadas → el mapa muestra "Sin coordenadas" en vez de romperse.
- Punto con 1 solo pedido → no se muestra la tabla intermedia, va al detalle.
- Viaje con ≤3 paradas → no aparece el botón "Ver todas".

## Test scenarios

- **Punto compartido en el mapa**
  - **Steps:** generar plan → en el mapa tocar un pin con 2 pedidos (mismo color) → ver la tabla del punto → tocar una fila → ver el detalle encima → cerrar detalle (vuelve a la tabla) → click afuera (cierra).
  - **Data:** un viaje con ≥2 pedidos en el mismo punto de entrega (mismas coordenadas).
  - **Expected result:** tabla con los pedidos del punto; el detalle abre **delante** (no detrás); los modales cierran al click afuera/Escape.

## Out of scope

- Edición/estado (stories 003-004).

## Open questions

- (vacío)

## Changes

- (vacío)

## Validation

- `TripMapa` (Leaflet + OSRM), `PlanTripCard` (lista colapsable, color por punto), `PuntoModal` (tabla del punto), `ParadaModal` (detalle), `ViajePedidosModal` (agrupado), `AdminModal` (cierre al click afuera/Escape). Verificado 2026-10-06 incl. fix de z-index del detalle sobre la tabla.
