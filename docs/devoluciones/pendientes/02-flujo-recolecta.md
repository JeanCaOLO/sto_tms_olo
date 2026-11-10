# 02 — Flujo «recolecta» (Atención al Cliente → viaje)

**Estado:** pendiente por implementar — **bloqueado: hay que cuadrarlo con el encargado de Planificación** (decisión del 2026-11-05: no se construye hasta acordar los puntos de abajo).

## Qué existe hoy (no hay que rehacerlo)
- Etiqueta `recolecta` en la tabla de Devoluciones (`returnTypeLabel`, `ReturnLinesTable`).
- `dispatch_guides.stop_type = 'collection'` (m05) y su lectura en Tracking (`backend/tracking`, `backend/mobile/trips.py`).
- App del chofer: una parada `collection` pide foto del producto + firma de quien entrega y se confirma como «Recolectado» / «No pude recolectar» (`parada/[id].tsx`). `backend/mobile` ya acepta `type: 'collection'` en la transición.
- NO probado: la transición de una recolecta contra el sandbox.

## Qué falta
1. **Alta** (Atención al Cliente, rol con `devoluciones:edit`): endpoint y formulario para registrar la solicitud. Hoy `backend/admin` solo lista y recibe; no crea.
2. **Entrada al viaje**: que la recolecta quede como parada `collection` de un viaje y llegue a la app.
3. **Seguimiento** del ciclo de la recolecta en Devoluciones: solicitada → planificada (con viaje) → recolectada → recibida en bodega. Hoy `tbl_returns.status` solo tiene `pending/approved/received/completed/rejected/cancelled` y `RETURNS_SQL` hace JOIN con `tbl_dispatch_guides`, así que una solicitud sin guía no se vería en el módulo.

## Qué hay que acordar con Planificación
- **¿Quién crea la parada?** Planificación (`plan_stops` del viaje, que `start.py` convierte en guías al iniciar) o Devoluciones/Tracking sin tocar `plan_stops`.
  - Opción A (asignación manual desde Devoluciones): se elige un viaje planificado sin iniciar o en tránsito. Tracking crea la guía `collection` al iniciar el viaje (`backend/mobile/src/mobile_api/start.py`, `INSERT_GUIDE_SQL`) o al instante si ya va en tránsito. Requiere columna nueva en `tbl_returns` (p. ej. `plan_trip_id`) y migración.
  - Opción B (automática): Planificación lee las solicitudes pendientes y las agrega al plan (lo que pidió el negocio: «se manda automáticamente para planificar»). Devoluciones solo expone la solicitud (vista tipo `vw_pickup_requests`: pedido, cliente, dirección/coordenadas, artículos, peso/volumen, estado).
  - El intent AI-DLC `aidlc/spaces/default/intents/260831-devoluciones-pickups` ya modela una devolución conocida como «una parada más con tipo = devolución, peso y volumen» en la secuencia (FR16.1–16.3, pantalla de Planificación con datos mock) y deja FR16.4 («al pie de camión», recalcular en vivo) fuera; OQ-4 (contrato de datos con Devoluciones) sigue abierto.
- **Contrato de datos**: campos mínimos de la solicitud, quién fija `stop_type='collection'`, cómo se calculan peso/volumen/capacidad, y qué pasa si el viaje ya salió.
- **Ventana y reglas** de cuándo se acepta una recolecta (fecha, % de costo): el alcance de FR16 las deja al módulo de Devoluciones.

## Qué hay que acordar para identificar el pedido (Atención al Cliente)
- Buscar pedidos ya entregados por n.º de pedido o factura y traer cliente, dirección, coordenadas y artículos (`tbl_orders`, `tbl_order_items`), o captura manual libre (sin coordenadas no hay parada ruteable).
- ¿Una recolecta puede cubrir artículos de varios pedidos del mismo cliente?
- ¿Se permite recolectar algo que no figura en el pedido (como en contracamión)?

## Cómo hacerlo cuando se acuerde
- `backend/admin/src/admin_returns.py`: `create_collection` (`POST /api/v1/devoluciones/recolectas`) con `return_type='recolecta'`, una fila de `tbl_returns` por artículo; registrar la ruta en `backend/admin/src/app.py` y `backend/admin/template.yaml`.
- Migración nueva (`sql/NN_...`, con ROLLBACK) para lo que falte: estado/viaje de la solicitud y que `dispatch_guide_id` pueda ser nulo si hoy no lo es (verificar el esquema real).
- `src/pages/devoluciones`: pestaña/lista «Recolectas» (las solicitudes sin viaje no pasan por `vw_return_trips`) y formulario de alta.
- Tracking: crear la guía `collection` según la opción elegida; mostrar la recolecta en el monitor ya funciona por `stop_type`.
