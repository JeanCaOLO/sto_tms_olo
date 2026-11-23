# Planificación sin artículos ni líneas

> 2026-11-23 · planificacion-2

- **What:** a pedido de Jesús, Planificación deja de trabajar con líneas o artículos del pedido: el API de eFlow
  (ePRAC) no los trae y no se van a usar.
- **Frontend:** el detalle de la parada (`ParadaModal`) ya no muestra ni carga la tabla de artículos; se quitaron
  `fetchArticulosDePedido` y el tipo `Articulo` de planificación y sus textos (es/en).
- **Backend:** se borró `ingest_items.py` (copiaba `EXPEDICIONESDETALLE` a `tbl_order_items`); la ingesta ya no cuenta
  líneas (`CANT_LINEAS` va NULL) y `planning_sql.ORDERS_SQL` ya no lee `cant_lineas`.
- **Se conserva:** el endpoint `GET /api/v1/planificacion/pedidos/{id}/articulos` y `pedido_articulos.py`, porque
  Guías lo usa para el detalle y el impreso de la guía. El tipo y la llamada se movieron a `src/pages/guias/articulos-api.ts`.
  Con la ingesta sin líneas, los pedidos nuevos no traen artículos en Guías ni en Devoluciones.
- **Verificación:** `tsc` y `eslint` limpios, vitest 75 passed (planificación, guías, i18n), pytest 1051 passed.
