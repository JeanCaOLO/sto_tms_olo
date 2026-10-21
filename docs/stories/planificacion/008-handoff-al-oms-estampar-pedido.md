# 008 — Entregar el plan al OMS (estampar el pedido y limpiar al re-planificar)

- **Status:** Delivered
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-21
- **Branch:** planificacion-2
- **Depends on:** 001, 002

## Narrative

Como planificador, quiero que al armar el plan cada pedido quede **marcado con su viaje y
su fecha de despacho**, para que el OMS sepa qué alistar y cuándo sin que yo le mande nada a
mano; y que si un pedido **se cae del plan** al re-planificar, deje de aparecerle al OMS.

La frontera con el OMS es un **contrato de columnas en `orders`**, no una llamada entre
módulos: Planificación estampa unas columnas, el OMS lee esa cola y pone prioridad/estado.
(El detalle técnico vive en requirement [007](../../requirements/planificacion/007-handoff-oms-contrato-orders.md).)

## Acceptance criteria

1. Al persistir el plan, cada pedido que quedó en él recibe: **`numero_viaje`**
   (`AAAAMMDD-seq`), **`lead_time_days`**, **`dispatch_date`** y **`planning_run_id`**.
2. `dispatch_date = delivery_date − lead_time_days` (igual para todo el viaje); si el viaje
   no tiene coordenadas y no hay `lead_time_days`, `dispatch_date` queda vacío.
3. Planificación **no** escribe la prioridad ni el estado del OMS (`priority`, `oms_score`,
   `wms_situation`, `oms_processed_at`): esas son del OMS.
4. El OMS ve como pendientes solo los pedidos **planificados y no procesados**
   (`planning_run_id` con valor y `oms_processed_at` vacío).
5. Al re-planificar un día, los pedidos que **ya no quedan** en el plan vuelven a quedar sin
   marca (`numero_viaje`/`lead_time_days`/`dispatch_date`/`planning_run_id` vacíos) y
   desaparecen de la cola del OMS; los que siguen se re-estampan con la **nueva** corrida.

## Edge cases

- Viaje sin coordenadas → `dispatch_date` vacío (no se inventa fecha); el OMS aplica su
  default.
- Pedido que cambia de día de entrega → sale del plan del día viejo (queda sin marca) y
  entra al del día nuevo.
- Re-planificar dos veces seguidas sin cambios → mismo resultado, pero `planning_run_id`
  cambia en cada corrida (es por-corrida, no estable).

## Test scenarios

- **El pedido queda listo para el OMS**
  - **Steps:** generar el plan de un día con pedidos reales → consultar `orders`.
  - **Expected result:** cada pedido del plan tiene `numero_viaje`, `lead_time_days`,
    `dispatch_date = delivery_date − lead_time_days` y `planning_run_id`; `oms_processed_at`
    sigue vacío.
- **El pedido que se cae sale de la cola del OMS**
  - **Steps:** sacar un pedido del plan (excluirlo o moverlo de día) → re-planificar el día.
  - **Expected result:** el pedido caído queda sin marca y no aparece en
    `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`; los demás se re-estampan.

Ambos verificados contra Aurora el 2026-10-20 (277 pedidos estampados; caso de caída → marca
en NULL; al restaurar, re-estampado). Ver `scratchpad/verif_limpieza2.py` y el
[plan de pruebas Planif↔OMS](../../planificacion/2026-10-21-plan-pruebas-planif-oms.md).

## Out of scope

- La prioridad y el paso `DISP`→`GENE`: los hace el **OMS**, no Planificación.
- El write-back del `numero_viaje` al WMS/eFlow (hoy **simulado** en la tabla espejo; el
  eFlow real es solo lectura).

## Open questions

- ¿La re-planificación debe re-disparar el procesamiento del OMS para los que siguen, o solo
  para los que cambiaron? (pendiente de definir con el OMS)

## Changes

- (vacío)

## Validation

- Verificado 2026-10-20 contra Aurora `tms_olo`: estampado correcto y limpieza al caerse del
  plan (atiende la "Alerta 2" que levantó el OMS).
