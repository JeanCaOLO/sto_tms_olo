# 2026-10-21 — Docs épicos de Planificación (handoff OMS) y verificación de store_id

## What changed
Se documentó al estilo AI-DLC la comunicación Planificación → OMS: historia de usuario 008
(entregar el plan al OMS: estampado + limpieza al re-planificar), requerimiento 007 (contrato
de columnas en `orders`), un plan de pruebas de la comunicación Planif↔OMS (T1–T12 + mapa a
las 6 APIs de Iflow), el tope de 16 pedidos en el requerimiento 001, y la limpieza en la
historia 002. Se reflejó lo mismo en `requirements.md` y `technical-design.md` del intent de
planificación. En paralelo se verificó contra Aurora la pregunta del OMS sobre `orders.store_id`.

## Why
Jean pidió dejar avance documentado para la reunión con Carlos (viernes). La reunión del
2026-10-21 cerró el flujo Planif↔OMS (las 6 APIs de Iflow solicitadas a IPRA) y Eduardo+Chus
van a probar la comunicación end-to-end entre 21-22 oct, así que los épicos de planificación
tenían que reflejar el handoff real. El OMS además preguntó si podía borrar los `orders` con
`store_id` para no arrastrar datos muertos.

## How
Docs a mano (sin correr el workflow AI-DLC): nuevas 008/007 calcando el formato de las
historias/requerimientos existentes; índices actualizados; el contrato verificado leyendo el
código real (`STAMP_ORDERS_SQL`/`CLEANUP_ORDERS_SQL` en TMS-Backend, `plan_builder.py`), no de
memoria. Para `store_id`: query a Aurora (`scratchpad/verif_store_id.py`) — 1249 filas con
`store_id` son demo viejas (`DEMO-*`, sin eflow_id ni planning_run_id), las 402 con NULL son
las de eFlow que se planifican; se enumeraron las tablas hijas que colgarían de un borrado.
Solo se commitearon docs de planificación; los `.snap` de tarifas/compañías quedaron fuera.

## Promoted knowledge
- `docs/stories/planificacion/008-*` y `docs/requirements/planificacion/007-*` (living docs del handoff).
- `docs/planificacion/2026-10-21-plan-pruebas-planif-oms.md` (plan de pruebas de la comunicación).
- Memoria: `reu-21oct-iflow-apis-oms-writeback` (las 6 APIs de Iflow + store_id resuelto).

## Follow-ups
- [ ] Ejecutar el plan de pruebas Planif↔OMS con Eduardo (21-22 oct); opcional convertir T1–T12 en scripts `verif_*.py`.
- [ ] El OMS: borrar los `orders` con `store_id` NOT NULL limpiando primero sus hijas (order_items 2526, dispatch_guides 71, plan_stops 5).
- [ ] Definir en qué módulo (TMS u OMS) entran los POST de "bajada" y "división de mercadería" de Iflow.
- [ ] ¿La re-planificación re-dispara el procesamiento del OMS para los que siguen? (pendiente con OMS)
