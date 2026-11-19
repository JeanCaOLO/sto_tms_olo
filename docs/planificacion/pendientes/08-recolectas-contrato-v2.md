# 08 — Recolectas del contrato v2 de Devoluciones

**Estado:** pendiente por verificar

## Hecho (2026-11-18)

Consumidor de Planificación del contrato directo de Dylan (sql/75/76/77, aplicadas en Aurora
por Dylan el 2026-11-18; contrato en `docs/devoluciones/ENTREGA_PLANIFICACION_BD_V2.md`):

- `recolectas.agendar` lee `vw_return_collection_candidates`, elige viaje con la misma regla que
  las históricas (`elegir_viaje`), crea la parada `collection` sin `return_id` y llama a
  `assign_return_collection_v2`, todo en un SAVEPOINT. Si falla, se deshace solo esa parada y se
  registra `planning.failed`; sin viaje, `planning.no_candidate` (clave estable por
  solicitud/día/causa: el replan horario no duplica eventos). Deadlock/serialización se propagan.
- `viajes_liberados.borrar_no_liberado` cancela con `cancel_return_collection_v2` las
  asignaciones `planned` de los viajes que va a borrar, antes del DELETE.
- El camino viejo (`recolectas._ABIERTAS`) y la bandeja (`bandeja._PICKUP`) excluyen las
  devoluciones físicas que ya tienen fila en `tbl_return_collection_results`.

- Si un viaje rechaza la recolecta (capacidad, magnitudes), se prueba el siguiente compatible
  (`viajes_compatibles`: mismo cliente primero, luego su zona/tienda).
- `sql/78_recolecta_v2_sin_return_id.sql`: sql/60 exigía `return_id` en toda parada `collection`
  y el contrato v2 la crea sin él (choque `ck_plan_stops_collection_return`). Dry-run OK.

Prueba en Aurora (2026-11-18), todo en una transacción con ROLLBACK y la 78 aplicada dentro:
solicitud v2 creada sobre un pedido real → candidata → asignada al viaje 20261119-0109-005 con
peso/volumen/coordenadas → el replan no la toca en viaje congelado → cancelación → reasignación →
replan con el viaje NO congelado la cancela y borra el viaje sin chocar con la FK. Una segunda
solicitud en un viaje con paradas sin peso queda `planning.failed` («Magnitudes de parada incompletas»).

## Qué falta

- Pruebas en Aurora: SOL-2026-11-0001 (asignada, viaje 20261119-0109-005) y SOL-2026-11-0002 (falla por magnitudes). Verlas en la UI de Planificación y Devoluciones.
- **Datos de los viajes** (bloquea v2 en la práctica): el 2026-11-18, de 29 viajes futuros solo 12
  tenían todas las paradas con peso y volumen; el resto rechaza cualquier recolecta v2. Además hay
  volúmenes absurdos de eFlow (viaje 20261119-0109-004: 7807 m³ contra 30 m³ de capacidad) que
  hacen fallar el chequeo de capacidad. Revisar en la ingesta (`ingest_orders`/`ingest_items`)
  de dónde salen `total_weight/total_volume` NULL y la unidad del volumen.
- **Recolectas históricas sin peso**: se insertan con `weight/volume NULL`, así que un viaje con
  una histórica rechaza cualquier v2. Si pasa: peso/volumen 0 explícito o excluirlas del chequeo (Dylan).
- **Bandeja**: las solicitudes v2 todavía no aparecen como `pickup` (la bandeja solo lee
  `tbl_returns`). Agregar un tercer bloque en `bandeja.py` desde la vista de candidatas.
- **Detalle de viaje** (`plans_read.py`): la parada v2 no trae motivo/notas (join con
  `tbl_returns` por `return_id`, que en v2 es NULL). Unir por
  `tbl_return_collection_allocations.plan_stop_id` si se quiere mostrar.
- **Ruido de evaluación**: una solicitud sin viaje el día D pero con viaje el D+1 deja un
  `planning.no_candidate` del día D. Aceptable; filtrar si molesta a Devoluciones.

## Por qué

Sin la cancelación, el replan choca con la FK de la asignación al borrar la parada; sin la
exclusión, una devolución ya recogida por v2 se volvería a agendar por el camino viejo.
