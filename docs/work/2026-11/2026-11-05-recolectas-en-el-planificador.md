# 2026-11-05 — Recolectas (devoluciones) en el planificador

## What changed

- **`sql/60_recolectas_en_viajes.sql`** (**aplicada en Aurora**):
  - `tbl_returns.pickup_date` guarda la fecha agendada.
  - `tbl_plan_stops` gana `stop_type` (`delivery` | `collection`, el mismo vocabulario de
    `tbl_dispatch_guides`) y `return_id` (FK a `tbl_returns`, con un check que exige que una
    `collection` tenga devolución).
  - Se recrearon las vistas de compatibilidad `returns` y `plan_stops`.
- **`backend/planning/src/recolectas.py`** (nuevo): en cada armado de un día y una compañía, mete las
  devoluciones abiertas (`pending`/`approved`, sin agendar o agendadas para ese día) como parada
  `collection` en un viaje con camión de ese día:
  - Elige el viaje que ya entrega a ese mismo cliente; si no hay, uno de su grupo (la zona, o la
    tienda si es EPA).
  - Pone la parada después de las entregas a ese cliente.
  - También usa viajes ya liberados, porque la recolecta no va a eFlow.
  - Si ningún viaje pasa por ahí, la devolución queda sin agendar y se reintenta en el siguiente
    armado.
- `plan_builder`: llama a `recolectas.agendar` al terminar el armado y también cuando el día no
  tiene pedidos nuevos (viajes congelados). La geometría pasa a `ruta_geo.py` por el tope de
  tamaño del archivo.
- `viajes_liberados._liberado`: solo cuentan las entregas. Una recolecta apunta al pedido
  original, que ya se liberó, y sin este filtro congelaba el viaje.
- `bandeja.py`: la fecha de un pickup es `pickup_date` si ya está agendado.
- `plans_read.py`: cada parada expone `stop_type`, `return_id` y `return_reason`.
- **Inicio del viaje** (`backend/tracking/src/app.py` y `backend/mobile/src/mobile_api/start.py`,
  con el mismo SQL en los dos): la guía nace con el `stop_type` de la parada, y la devolución queda
  amarrada a su guía (`tbl_returns.dispatch_guide_id`). Así la app muestra la parada como
  "recolecta", con foto del producto y firma.
- **Frontend**: etiqueta "Recolecta" en la tarjeta del viaje (`StopBadges.tsx`) y en el detalle de
  la parada, con el motivo de la devolución.

## Why

En la reunión del 2026-11-05 se definió el flujo: servicio al cliente crea la devolución en el
TMS, la devolución cae en la Bandeja y Planificación la agenda en un viaje que ya pase por ese
cliente. La v1 es sencilla porque una devolución trae de 1 a 3 artículos.

## How

- E2E contra Aurora en una transacción con ROLLBACK: se aplicó la sql/60, se creó una devolución
  de FERRETERIA EPA CURRIDABAT y se corrió el planificador del 06-nov. La recolecta quedó en
  `20261106-002` como parada 3, después de las 2 entregas a ese cliente, aunque el viaje ya estaba
  liberado, y `pickup_date` quedó en 2026-11-06.
- `pytest backend/tests`: 549 passed. `backend/mobile`: 146 passed, 23 skipped.
- `tsc` sin errores; `vitest src/pages/planificacion`: 70 passed.
- Ensayo de la sql/60 y luego `--execute`. `tms_app` lee las columnas nuevas por la tabla y por la vista.

## Follow-ups

- **Capacidad**: la recolecta no suma peso ni volumen. Hay que agregarlo cuando haya devoluciones
  grandes; en la reunión se mencionó tener cuidado si es la primera parada.
- **Rutas solo de recolección** (muchas devoluciones juntas): quedan para después.
- **Tarifas**: `pickup_count` del viaje puede salir de las paradas `collection`.
- **Edición manual del plan**: el selector "mover a" trabaja con `order_id`, que en una recolecta es
  el pedido original. Mover una recolecta a mano no está soportado.
- **Escenario 2** (el chofer crea la devolución en el sitio): no pasa por el planificador; ya lo
  cubre la app.
