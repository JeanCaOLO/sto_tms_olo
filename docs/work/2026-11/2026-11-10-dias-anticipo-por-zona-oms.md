# 2026-11-10 — Días de anticipo de la ventana de liberación por ZONA (OMS)

## Contexto

Handoff con Planificación (mensaje del 2026-11-09): cada pedido ya tiene su zona TMS
calculada en `tbl_orders.tms_zone_id` (FK a `tbl_zones.id`, por geocerca y país, poblada
en Aurora; 265/1100 sin zona = rutas 17–39 aún sin geocerca dibujada). Además Planificación
renombró `tbl_orders.route_type_id` → `tbl_orders.tms_zone_id`.

El OMS pasa a tomar los **días de anticipo** de la ventana de liberación desde la **zona del
pedido**, en vez del valor fijo por scope `oms_rule_configs.dias_prep_picking` (que en CR es
1 para todos). `dias_prep_picking` **se conserva como DEFAULT** para cuando el pedido no hace
match de zona.

## Decisiones (confirmadas con Eduardo)

- `dias_anticipo` **reemplaza como FUENTE** a `dias_prep_picking`; misma mecánica (offset de
  la ventana, anclado en `dispatch_date`), solo cambia de dónde sale el número.
- `dispatch_date` lo sigue calculando Planificación igual que hoy. **No hay reconciliación**:
  no se toca el modelo de días de Planificación.
- Sin match de zona (`tms_zone_id` NULL o fuera de geocerca) → se cae a
  `config.dias_prep_picking` (que a su vez es 1 por defecto).
- Columna en español `dias_anticipo` (lo permite el estándar OLTP; es lo que Planificación ya
  usó en su SELECT y es consistente con `dias_prep_picking`).
- Zonas **por país, sin compañía** (`tbl_zones` ya es country-level).

## Cambios

- **`sql/64_zonas_dias_anticipo.sql`** (+ rollback): `ALTER tbl_zones ADD dias_anticipo
  smallint NOT NULL DEFAULT 1` (`ck_zones_dias_anticipo` ≥ 0) y `tipo_zona text`
  (`ck_zones_tipo_zona IN ('corta','larga')`, nullable — lo pidió Planificación, el OMS no lo
  usa). Idempotente, con `COMMENT ON COLUMN`.
- **`backend/oms/src/cola_candidatos.py`**: `LEFT JOIN tbl_zones z ON z.id = o.tms_zone_id`
  y `z.dias_anticipo` en `COLA_SQL`; mapeo en `_desde_fila` (NULL si no hay zona).
- **`backend/oms/src/models.py`**: `PedidoCandidato.dias_anticipo: int | None = None`.
- **`backend/oms/src/app.py`**: helper `_offset_liberacion(pedido, config)` =
  `pedido.dias_anticipo if not None else config.dias_prep_picking`; el barrido (`correr`) lo
  usa en la evaluación de la ventana. Los endpoints manuales (`procesar_viaje`,
  `liberar_pedidos`) ignoran la ventana, no cambian.
- **`backend/tests/test_oms.py`**: 2 tests nuevos (`_offset_liberacion` y barrido con zona).
  Suite: **71 verdes**.

## Impacto del rename `route_type_id` → `tms_zone_id`

- `backend/oms` y `backend/planning`: **no usaban** esa columna → no se rompe nada.
- Queda metadata apuntando al nombre viejo de `orders` (a refrescar, no urgente): ver
  `docs/oms/pendientes/01-dias-anticipo-por-zona.md`.

## Pendiente

Ver `docs/oms/pendientes/01-dias-anticipo-por-zona.md`.
