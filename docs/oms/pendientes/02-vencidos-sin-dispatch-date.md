# 02 — Auditar pedidos vencidos sin `dispatch_date`

**Estado:** pendiente por verificar (consulta de diagnóstico, solo lectura).

## Por qué

El barrido del OMS libera cuando `now() >= dispatch_date − dias_anticipo`
(`handoff_pedidos.en_ventana_liberacion`). Un pedido **vencido** (fecha anterior a hoy)
*siempre* cae en esa ventana... **pero solo si tiene `dispatch_date`**. Si `dispatch_date`
es NULL, el barrido cae al ancla `delivery_date`; y si TAMBIÉN falta `delivery_date`, el
pedido **no se libera por barrido** — queda colgado (solo saldría por liberación manual).

El riesgo concreto apareció con el handoff de zonas: Planificación debe seguir calculando
`dispatch_date` (por coordenadas / lead time) **incluso para los pedidos sin zona TMS**
(265/1100, rutas 17–39). Esta auditoría mide si hay vencidos en la cola que se quedarían sin
liberar. Relacionado con el mensaje a Planificación del 2026-11-10 (puntos 1 y 2).

## Qué es "vencido" aquí

Un pedido de la **cola del OMS** (`planning_run_id IS NOT NULL AND oms_processed_at IS NULL`)
cuyo ancla de liberación (`COALESCE(dispatch_date, delivery_date)`) es **anterior a hoy**.

## Consulta de diagnóstico (solo lectura)

Correr contra Aurora `tms_olo` por el túnel (localhost:15432). Ejemplo con `psql`:

```sql
-- Resumen: cuántos pedidos EN COLA están vencidos y cuántos de esos NO tienen dispatch_date.
SELECT
  count(*) FILTER (
    WHERE COALESCE(dispatch_date, delivery_date) < current_date
  )                                                                       AS vencidos_en_cola,
  count(*) FILTER (
    WHERE COALESCE(dispatch_date, delivery_date) < current_date
      AND dispatch_date IS NULL
  )                                                                       AS vencidos_sin_dispatch,
  count(*) FILTER (
    WHERE dispatch_date IS NULL AND delivery_date IS NULL
  )                                                                       AS sin_ninguna_fecha
FROM public.tbl_orders
WHERE planning_run_id IS NOT NULL
  AND oms_processed_at IS NULL;
```

```sql
-- Detalle de los casos de riesgo (vencido y sin dispatch_date): ver si tienen zona o no.
SELECT o.eflow_id_expedicion, o.numero_viaje, o.delivery_date, o.dispatch_date,
       o.tms_zone_id, o.delivery_zone, o.warehouse_id
FROM public.tbl_orders o
WHERE o.planning_run_id IS NOT NULL
  AND o.oms_processed_at IS NULL
  AND o.dispatch_date IS NULL
  AND (o.delivery_date IS NULL OR o.delivery_date < current_date)
ORDER BY o.delivery_date NULLS FIRST
LIMIT 100;
```

## Cómo interpretar

- `vencidos_sin_dispatch = 0` y `sin_ninguna_fecha = 0` → no hay colgados; el barrido
  liberaría todos los vencidos. Nada que hacer.
- `vencidos_sin_dispatch > 0` → son pedidos que el barrido NO libera por falta de
  `dispatch_date`. Confirmar con Planificación que les asignen `dispatch_date` (punto 2 del
  mensaje del 2026-11-10). Mientras tanto, se pueden sacar con la liberación manual
  (`POST /api/v1/oms/pedidos/liberar`).
- `sin_ninguna_fecha > 0` → además sin `delivery_date`: caso más grave (ni ancla manual por
  fecha); revisar origen del pedido.

## Nota

Es diagnóstico, no cambia nada. Si el conteo sale alto y es recurrente, evaluar si el OMS
debe tener una regla explícita para vencidos (p. ej. liberar de inmediato los de la cola con
ancla < hoy), pero eso es decisión de producto — no se asume aquí.
