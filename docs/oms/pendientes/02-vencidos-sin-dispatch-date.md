# 02 — Pedidos vencidos sin liberar (vencidos NO planificados)

**Estado:** diagnosticado 2026-11-10 — causa upstream (Planificación). Pendiente que Planning
planifique los vencidos; re-auditar después.

## Hallazgo (2026-11-10, Aurora `tms_olo`)

La UI mostró ~11 pedidos de EPA del 2026-11-05 sin liberar. Al auditar, el conjunto real de
**vencidos no liberados** (no cerrados, `wms_situation='DISP'`, `oms_processed_at IS NULL`,
`delivery_date < hoy`) era **72**: **58 Cofersa + 14 EPA** (entregas del 02 al 05-nov).

**TODOS tienen `planning_run_id IS NULL`** (nunca planificados), y por tanto `dispatch_date`,
`numero_viaje` y `prioritization_run_id` también NULL. Como `cola_candidatos` exige
`planning_run_id IS NOT NULL`, el OMS **ni los ve**: ni el barrido ni la liberación manual los
tocan (ambos leen la misma cola). Se quedan `DISP`.

**No es bug del OMS.** La causa es upstream: Planificación no planificó esos pedidos. Acción:
Planning debe planificarlos (les pone `planning_run_id` + `dispatch_date`); con la fecha
vencida, el barrido los libera de inmediato (ancla < hoy ⇒ siempre en ventana). Coincide con
el punto 1 del mensaje a Planificación del 2026-11-10.

## Importante sobre la consulta

El conjunto "atascado" visible en la UI es **más amplio** que la cola del barrido: la UI filtra
solo `closed_at IS NULL`, mientras el barrido exige `planning_run_id IS NOT NULL`. Por eso la
consulta buena para "vencidos atascados" NO debe filtrar por la cola del barrido — ver abajo.

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

## Qué es "vencido atascado" aquí

Un pedido **no cerrado** (`closed_at IS NULL`), **no liberado** (`wms_situation='DISP'` y
`oms_processed_at IS NULL`), con **entrega anterior a hoy** (`delivery_date < current_date`).
Se desglosa por si está planificado o no, porque esa es la causa.

## Consulta de diagnóstico (solo lectura)

Correr contra Aurora `tms_olo` por el túnel (localhost:15432):

```sql
-- Vencidos atascados, desglosados por si Planificación los corrió (planning_run_id).
SELECT cu.name AS cliente,
       (o.planning_run_id IS NOT NULL) AS planificado,
       count(*)::int AS n,
       min(o.delivery_date::date) AS entrega_min,
       max(o.delivery_date::date) AS entrega_max
FROM public.tbl_orders o
LEFT JOIN public.tbl_customers cu ON cu.id = o.customer_id
WHERE o.closed_at IS NULL
  AND o.oms_processed_at IS NULL
  AND o.wms_situation = 'DISP'
  AND o.delivery_date::date < current_date
GROUP BY 1, 2 ORDER BY n DESC;
```

## Cómo interpretar

- `planificado = false` (el caso del 2026-11-10) → **nunca se planificaron**; el OMS no los ve.
  Acción: Planning los planifica (`planning_run_id` + `dispatch_date`). No es del OMS.
- `planificado = true` y están atascados → ahí sí mirar `dispatch_date`: si es NULL, el barrido
  cae al ancla `delivery_date` (que existe), así que deberían liberar; si no liberan con
  `dispatch_date` presente y ancla < hoy, es un bug del barrido a investigar. También se pueden
  sacar con la liberación manual (`POST /api/v1/oms/pedidos/liberar`).

## Nota

Es diagnóstico, no cambia nada. Si el conteo sale alto y es recurrente, evaluar si el OMS
debe tener una regla explícita para vencidos (p. ej. liberar de inmediato los de la cola con
ancla < hoy), pero eso es decisión de producto — no se asume aquí.
