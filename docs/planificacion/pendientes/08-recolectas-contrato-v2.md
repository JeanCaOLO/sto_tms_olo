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

## Qué falta

- **Verificar con una solicitud v2 real**: hoy hay 0 candidatas en Aurora; el SQL se validó en una
  transacción con ROLLBACK, pero la asignación no se ha ejercido contra la BD.
- **Batería Postgres local** (`python tests/postgres/run_local.py`, pide Docker) con los casos
  del §9 del contrato. No corrida: Docker no estaba levantado.
- **Capacidad**: `check_return_collection_capacity_v2` rechaza el viaje si alguna parada no tiene
  peso/volumen. Las recolectas históricas se insertan con `weight/volume NULL`, así que un viaje
  que ya tenga una histórica rechaza cualquier v2 (queda `planning.failed`). Si pasa en la
  práctica: darles peso/volumen 0 explícito a las históricas o excluirlas del chequeo (de Dylan).
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
