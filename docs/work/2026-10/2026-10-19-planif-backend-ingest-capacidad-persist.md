# 2026-10-19 — Planificación backend: ingest eFlow→orders, planificador por capacidad y persistencia

## What changed
Se construyó el flujo productivo de planificación (opción A: los pedidos nacen en eFlow y se planifica SOBRE `orders`), todo verificado contra Aurora:

- **Ingest `eFlow → orders`** (`backend/planning/src/ingest_orders.py`): lee la cola DISP/DISP de eFlow CR (read-only) y hace UPSERT idempotente en `orders` por la clave única de eFlow, resolviendo los FKs reales (organización, almacén, customer por compañía, `final_customer` por IDCLIENTE, branch por sucursal). Coacciona `priority 0→NULL` y `coord 0→NULL`.
- **Planificador por capacidad** (`backend/planning/src/plan_builder.py`): agrupa `orders` por zona y empaca por **peso/volumen reales** (margen 85%/95%, flota propia de `vehicles`), rotando la flota global entre viajes. Reemplaza el agrupamiento fijo de demo. Idempotente: replan borra y reconstruye el día; no persiste planes vacíos.
- **Persistencia + lectura** (`plans_read.py`): persiste en `route_plans/plan_trips/plan_stops` con FKs reales y los ensambla de vuelta en el shape `RoutePlan` del frontend.
- **Endpoints** (`app.py`): `GET /api/v1/planificacion/planes` (lista), `.../{id}` (detalle), `POST .../planes` (replan: **ingesta eFlow + reconstruye** el día, best-effort).

## Why
El usuario pidió llevar la planificación a producción (sin seed ni cap de 3 de demo): traer solo DISP/DISP, guardar las planificaciones en la BD, re-planificar lo nuevo en cada corrida, y armar los viajes por capacidad real del camión. Las tablas de planes ya existían en Aurora con FKs a `orders`/`vehicles`, pero los pedidos de eFlow no vivían en `orders` — de ahí el ingest como fundación.

## How
- Verificado contra Aurora: 101 pedidos reales ingestados (96 con coords/peso + 5 EPA); 55 pedidos del 2026-10-20 → 7 viajes por capacidad (uno por zona, camiones distintos); planes persistidos para 16/20/21/22/23 oct.
- `tms_common.pg` (pg8000) para Aurora, `tms_common.eflow_db` (pytds) para eFlow. `ruff` + `py_compile` limpios.

## Promoted knowledge
- `orders` es el surface de planificación: tiene columnas puente `eflow_id_*`, `wms_status/wms_situation`, `final_customer_id`. Cola = `wms_status='DISP' AND wms_situation='DISP'`. Ver memoria [[planif-ingest-eflow-a-orders]].
- Flota propia CR = `vehicles` con `carrier_id IS NULL`; capacidades en `capacity_weight/capacity_volume`.
- `orders.priority` tiene CHECK `>= 1` (o NULL); eFlow manda 0 cuando no hay prioridad.

## Follow-ups
- Frontend (delegado a subagente, en curso): calendario leyendo los planes de Aurora, quitar el seed/eFlow-sim, "Planificaciones" como vista tabla con filtro.
- Write-back del nº de viaje a eFlow: sigue simulado (eFlow real es read-only).
- Scheduler ~1x/hora que dispare el replan (hoy se dispara por POST /planes).
- Purgar (si el usuario confirma) los planes prototipo viejos en Aurora (`order_number = SEED-...`).
