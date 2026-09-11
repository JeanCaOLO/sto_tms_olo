# 2026-09-09 — Viajes desde journeys, pedidos desde journey_orders

Commit: `bfcd4f9`.

## What changed

Se corrigió el modelo de datos de viajes/pedidos del módulo de Planificación
para que refleje el modelo real de EFLOW (confirmado por Padrón/Calzadilla y
validado contra PROD):

- Los **viajes** se leen de `journeys` y se listan **solo los que tienen pedidos
  asignados** (filtro por `journey_orders`).
- El **viaje muestra solo su número** ("Viaje N"). El nombre pertenece a la
  **ruta**, no al viaje — antes el label metía el nombre de la ruta, confundiendo
  los dos conceptos.
- Los **pedidos de un viaje** se traen de `journey_orders` (viaje ↔ pedido) y se
  enriquecen con `EXPEDICIONESCABECERA` y `CLIENTES`.
- Los pedidos se cargan **perezosamente al elegir el viaje**, no precargando los
  ~100 viajes (elimina el N+1).

## Why

El modelo anterior (heredado de la exploración QA) derivaba los pedidos por
`EXPEDICIONESCABECERA.NUMEROVIAJEWMH` y ponía el nombre de la ruta en el label
del viaje. El equipo aclaró el modelo real: `journeys` = todos los viajes;
`journey_orders` = la relación viaje↔pedido (con `order_number`); el viaje solo
tiene número. Además el enriquecimiento por-viaje de los 100 viajes al cargar
generaba un N+1 ruidoso (una llamada `/pedidos` por viaje).

## How

- `server/queries.mjs`:
  - `VIAJES_BASE`: `journeys` + `CROSS APPLY` que agrega los pedidos del viaje vía
    `journey_orders JOIN EXPEDICIONESCABECERA ON (IDEXPEDICION=order_number,
    IDCOMPANIA=company_id, IDSUCURSAL=branch_id)`, con `WHERE agg.pedidos > 0`
    (solo viajes con pedidos). La ruta se deriva del pedido (`MIN(RUTA)`), no del
    viaje.
  - `listPedidosPorViaje`: `journey_orders` → `EXPEDICIONESCABECERA` → `CLIENTES`
    por `journey_id = @viajeId` (antes por `NUMEROVIAJEWMH`).
- `eflow-api.ts`: `mapViaje` → `trip_number = "Viaje ${id}"` (solo número),
  `pedidos: []`. `fetchViajes` ya no enriquece. Nuevo `fetchPedidosDeViaje`
  (reemplaza `fetchPedidosPorViaje`) con fallback interno al mock.
- `use-pedidos-ruta.ts`: `setViaje` async — carga los pedidos al elegir el viaje
  (usa los ya presentes si el viaje los trae); expone `cargandoPedidos`.
- Tests actualizados al nuevo contrato.
- Verificado en vivo (CR y VE): viajes solo con pedidos, pedidos reales por
  `journey_orders`. `pnpm test` 70/70, `tsc` 0 en planificacion, `pnpm build` OK,
  e2e 13/13.

## Promoted knowledge

Ninguna guía nueva. El mapa de fuentes real ya está en
`docs/guides/eflow-fuentes-reales.md` (esta corrección alinea el código con lo
ahí documentado: `journey_orders` como fuente de la relación viaje↔pedido, viaje
= número, ruta ≠ viaje). Actualizado el detalle de `listPedidosPorViaje` /
`VIAJES_BASE` en `server/queries.mjs` (comentarios inline).

## Follow-ups

- [ ] Un viaje puede tener pedidos de varias rutas (caso de excepción); el
  resumen muestra `MIN(RUTA)`. Evaluar mostrar "múltiples rutas" cuando aplique.
- [ ] Repuntar el mirror y el `server/` al nuevo repo base `olo/tms/TMS-Frontend`
  cuando esté el token (hoy el mirror va al repo de prueba).
