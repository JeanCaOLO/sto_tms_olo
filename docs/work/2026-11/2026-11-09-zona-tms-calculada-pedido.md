# 2026-11-09 — Zona TMS del pedido, calculada por geocerca

## What changed

- **`sql/64_zona_tms_calculada_pedido.sql`** (aplicada en Aurora `tms_olo`, con su rollback):
  - `tbl_orders.route_type_id` → `tms_zone_id` y `fk_order_zone` → `fk_orders_tms_zone`. Ya era FK a
    `tbl_zones` (nombre viejo de antes de sql/09); solo la tenían 706 pedidos de la carga demo del 26-sep
    y nadie la leía.
  - `fn_zona_tms(lat, lng, warehouse_id)`: zona del país de la bodega cuya geocerca (GeoJSON, PostGIS)
    contiene el punto. Si varias la contienen, gana la de menor área.
  - `trg_orders_tms_zone` (`fn_orders_set_tms_zone`): recalcula al insertar o al cambiar coordenadas o
    bodega. La ingesta de eFlow no cambió.
  - Relleno: 835 de 1100 pedidos de eFlow quedan con zona TMS; los 706 valores demo se reemplazan (nulos).
- `backend/data/src/relations.py`: la relación `orders → zones` apunta a `tms_zone_id`.
- Requerimientos (OQ-2 cerrada, R009 Partial) e historia 012 (Partial, con el reparto Planificación/OMS).

## Why

Reunión 2026-11-06 (Ana, Eduardo): los días de anticipo viven en `tbl_zones` y el OMS los lee desde la
zona que Planificación asigna al pedido por coordenadas. El `delivery_zone` de eFlow es del cliente y
no coincide con el catálogo (rutas 17–39 no existen en `tbl_zones`).

## How

- Formato verificado: `geofence` es `jsonb` GeoJSON y la base tiene PostGIS 3.5, así que el cálculo es
  SQL (`ST_Covers` + `ST_GeomFromGeoJSON`). Trigger en vez de tocar la ingesta: cubre a cualquier escritor.
- Las 15 geocercas (CR 01–16, sin la 14) se pisan: 320 pedidos caían en 2–4 zonas. Con "gana la más
  chica", de los pedidos de rutas 01–16 coinciden 461 con el código de eFlow y difieren 80.
- Pruebas en Aurora, en transacción con rollback: dry-run de la 64, de 64 + rollback, idempotencia
  (segunda corrida sin cambios), trigger (coordenada 0,0 → nulo) y escritura con el usuario `tms_app`.
  Suite backend: 566 pruebas en verde.

## Promoted knowledge

- `tbl_orders` tiene dos zonas: `delivery_zone` (texto de eFlow, agrupa los viajes) y `tms_zone_id`
  (catálogo TMS, para los días de anticipo del OMS).
- Recalcular todo tras editar geocercas: el `UPDATE` del final de la sql/64.

## Follow-ups

- Avisar a Eduardo el nombre de la columna (`tms_zone_id`) y que nulo = 1 día.
- Geocercas de las rutas 17–39 y de Venezuela (app de zonas de Jean): hasta entonces 265 pedidos sin zona.
- Zonas CR 01–16 duplicadas sin geocerca en `tbl_zones`: limpiar cuando se confirme quién las referencia.
- Si el catálogo crece a cientos de zonas: columna `geometry` con índice GiST.
