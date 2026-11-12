# 2026-10-20 — dispatch_date para el OMS, tope de 16 paradas, Nº de viaje en guías y tuteo

## What changed
Se añadió `orders.dispatch_date` (migración `sql/42`) y el planificador ahora la
estampa como `delivery_date − lead_time_days` al persistir cada pedido. Se bajó el
tope de paradas por viaje de 25 a 16. Se agregó la columna "Nº de Viaje" en Guías de
Despacho (con fix de `plans_read` para devolver el `numero_viaje` real en vez del
`sequence_order`). Se renombró "Rutas"→"Paradas" en planificación y se completó el
tuteo de la copia en español (i18n + textos hardcodeados en `PlanEditor`/`PlanAutomatico`).

## Why
El OMS necesita soltar cada pedido a alistar un día antes de que SALGA el viaje, no de
golpe (reuniones 2026-10-19/20 con Antonio/Eduardo). Para eso pidió denormalizar la
fecha de salida en el pedido. El tope de 25 producía viajes de hasta 24 paradas, contra
el acuerdo de ~16/camión (reunión 2026-10-13). El Nº de viaje en guías y el renombre a
Paradas/tuteo son pedidos directos del usuario.

## How
- `sql/42_orders_dispatch_date.sql`: columna `date` + índice parcial; DDL aplicado en
  Aurora con el usuario admin `olo_db` vía túnel SSM.
- `plan_builder.py`: `_UPD_ORDER` calcula `dispatch_date` en SQL desde `delivery_date`
  (ya en la fila) menos `lead_time_days` con `make_interval`; sin lead (sin coordenadas)
  queda `NULL` y el OMS aplica su default. `MAX_PARADAS = 16`.
- `plans_read.py` + `guias/*`: expone y muestra `numero_viaje` con fallback a `sequence_order`.
- Verificado en los días replanificados (20–25 oct): 277 pedidos con dispatch_date, 0 mal
  calculados, 15 en NULL por coordenadas faltantes (correcto por diseño).

## Promoted knowledge
- Memoria de proyecto `zona-cerca-lejos-oms-envio-dia-antes` (reuniones 19–20 oct:
  envío un día antes + maestro de zonas cerca/lejos). La semántica canónica de
  `dispatch_date` vive en el comentario de `sql/42` y en `plan_builder.py`.

## Follow-ups
- [ ] Maestro de zonas: agregar categorización cerca/lejos (días de preparación) como
      insumo del T-n por geocerca (reuniones 19–20 oct). Hoy `lead_time_days` sale de
      distancia al depósito; falta aterrizar la fuente zona→días.
- [ ] Confirmar con Ana/Eduardo que el OMS lee `dispatch_date` y aplica su offset −1.
- [ ] Re-estampar `dispatch_date` en planes de días pasados si alguna vista los necesita
      (el replan solo toca de hoy en adelante).
