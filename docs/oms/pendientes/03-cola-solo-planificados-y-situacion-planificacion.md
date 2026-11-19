# 03 — Cola solo planificados + situación pisada por Planificación

**Estado:** cambio del OMS HECHO (2026-11-13); corrección de Planificación PENDIENTE (de ellos).

## Contexto (Excel cola 2026-11-13)

La cola mostraba 64 pedidos en prioridad 0, **todos de EPA** (compañía `0029`, tiendas
T00x) — es el pass-through de eFlow (EPA `priorizar=false` conserva la prioridad de eFlow,
incluido 0), **no** Cofersa sin liberar (Cofersa `0109` estaba todo en prioridad 2). Además
eran vencidos, sin `dispatch_date`, nunca liberados.

Diagnóstico contra Aurora: **el 100% de los vencidos no liberados tienen `planning_run_id
IS NULL`** (nunca planificados) → el barrido ni los ve (`cola_candidatos` exige
`planning_run_id IS NOT NULL`). No es bug del barrido; es que **no se planificaron**.

Parte de esos pedidos aparecían con situación `TERM`/`EXPA` (no `DISP`). Causa:
`backend/planning/src/salientes.py` — en cada corrida, Planificación toma los `DISP/DISP`
de Aurora que ya no están en la cola de eFlow, los consulta en eFlow y **copia
`TPEXES/TPEXSI` → `wms_status`/`wms_situation`** en `orders`. Eso mete situaciones de eFlow
en una columna que es del OMS.

## Lo que hicimos (OMS) — HECHO 2026-11-13

`src/pages/oms/api/omsApi.ts` → `getQueue` (CR) ahora filtra **`planning_run_id != null`**
tras el fetch. Así la cola de la UI = la del barrido (`cola_candidatos`):

- Lo **no planificado** no se muestra ni se puede procesar (barrido y liberación manual ya
  exigían `planning_run_id`; solo faltaba alinear la UI).
- **Inmune** al bug de situación de Planificación: no filtramos por `wms_situation`, así que
  da igual si lo pisan. El ruido `TERM`/`EXPA` está siempre en pedidos sin `planning_run_id`,
  así que se va con este filtro.
- Se actualizó el comentario de `esCola` en `useColaController.ts` (ya no asume DISP/DISP).

Se eligió filtrar por `planning_run_id` y **no** por `wms_situation='DISP'` justamente para
no depender de una columna que Planificación corrompe. El operador `IS NOT NULL` no existe en
la API de datos genérica (`select_query.py` solo soporta `is null`) ni en el `QueryBuilder`
del cliente; por eso el filtro va post-fetch en `getQueue` (no requiere deploy de backend).

## Pendiente (Planificación) — NO corregido en `planificacion-2`

Verificado en `github/planificacion-2` HEAD `849417f` (2026-11-13): `salientes.py` **sigue
copiando** `TPEXES/TPEXSI` → `wms_status/wms_situation`. Lo único que agregaron
(`61518f0`, `849417f`) es `AND oms_processed_at IS NULL`, que solo protege lo **ya liberado**
por el OMS. Para los no liberados, sigue pisando la situación.

Pedir a Planificación: que `salientes` saque pedidos de su bandeja por `FECHACIERRE`/viaje
**sin escribir `wms_situation`** en la columna que lee el OMS (o que lo escriba en una
columna espejo aparte). Con nuestro filtro ya no nos bloquea, pero sigue corrompiendo una
columna del OMS y podría morder otra vista.

## Pendiente de raíz (Planificación) — EPA/Cofersa sin planificar

Transversal: vencidos sin planificar — 67 EPA, **251 Cofersa**, y **718 sin `customer_id`
mapeado** (probable data mock/legacy que no cruza con `tbl_customers`). Ver pendiente 02.
Mientras no se planifiquen, no entran a la cola ni se liberan (correcto, pero hay que
planificarlos upstream).
