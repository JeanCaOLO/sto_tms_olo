# 2026-11-03 — Ingesta de artículos de eFlow a `order_items`

## What changed

- `backend/planning/src/ingest_items.py` (nuevo): trae EXPEDICIONESDETALLE (+ nombre de
  ARTICULOSGESTION) a `order_items`. Refresca los pedidos de la cola DISP/DISP no
  liberados por el OMS y rellena (backfill) los pedidos de Aurora sin líneas. UPSERT por
  `(order_id, line_number)` que solo escribe si algo cambió; borra líneas que eFlow ya no trae.
- `backend/planning/src/ingest_orders.py`: `ingest_cr` llama a la ingesta de artículos
  después de las cabeceras (corre al armar, al replanificar y en el replan horario).
- `backend/planning/src/pedido_articulos.py`: el modal de la parada lee de `order_items`
  (Aurora), ya no consulta eFlow en vivo en cada clic.
- `sql/56_order_item_line_number_desde_cero.sql` (aplicada en Aurora):
  `ck_order_item_line_number` pasa de `>= 1` a `>= 0`.
- `backend/planning/template.yaml`: la Lambda de planning recibe `EFLOW_SECRET_NAME`
  (antes no lo tenía: la ingesta y los artículos fallaban en AWS).

## Why

El modal de la parada mostraba "Este pedido aún no tiene artículos desglosados" en
pedidos que sí tienen líneas (p. ej. PL0000004452-O, 3 líneas). `order_items` estaba
vacía (0 de 720 pedidos) y el modal leía eFlow en vivo; la pantalla convierte cualquier
error en "sin artículos". En AWS fallaba porque la Lambda de planning no tenía el secreto
de eFlow.

## How

- eFlow numera `IDEXPEDICIONLINEA` desde 0; sql/44 había puesto `>= 1` suponiendo que
  arrancaba en 1, y la primera ingesta lo rechazó. Se guarda el número real (llave natural).
- Nombre del artículo traído como `VARBINARY` y decodificado cp1252 (gotcha de pytds).
- Corrida real contra eFlow CR + Aurora: 720/720 pedidos con líneas, 7.043 líneas,
  0 nombres con caracteres dañados, 707 con tildes. Segunda corrida: 0 eventos nuevos en
  `audit.events`. `pytest backend/tests` → 530 passed.

## Promoted knowledge

- `IDEXPEDICIONLINEA` de eFlow empieza en 0.
- Un pedido ya liberado en eFlow real (TPEXSI `EXCO`, etc.) sale de la cola DISP/DISP:
  solo el backfill trae sus líneas, una vez.

## Follow-ups

- La vista Bandeja (`GET /planificacion/bandeja`) solo lee Aurora: se actualiza cuando
  corre una ingesta (armar, replanificar o el replan horario una vez desplegado).
- El modal sigue mostrando "sin artículos" ante un error de red; distinguir error de vacío.
