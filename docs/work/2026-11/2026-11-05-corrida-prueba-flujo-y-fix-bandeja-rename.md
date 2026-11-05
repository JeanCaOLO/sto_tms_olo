# 2026-11-05 — Corrida de prueba del flujo OMS + fix de bandeja (rename de columna)

> **NOTA (SUPERSEDED en el merge con `main`):** la reconciliación del contador que se
> describe abajo (renombrar a `delivery_date_changes` vía `sql/58_orders_rename_...`)
> quedó REVERTIDA al mergear `main`. `main` (commit 6551778, Planificación) ya había
> unificado el contador en **`delivery_date_change_count`** (eliminando el duplicado
> `delivery_date_changes`) con su `sql/58_orders_unificar_contador_cambio_fecha.sql`.
> En el merge cedimos a ese nombre: se descartó nuestro `sql/58_rename`, `omsApi.ts`/
> `types.ts` volvieron a `delivery_date_change_count`, y bandeja/cambio_fecha son los de
> main. PENDIENTE: reconciliar la Aurora del sandbox (hoy tiene `delivery_date_changes`
> por nuestro rename ya aplicado) de vuelta a `delivery_date_change_count`.

## Corrida de prueba end-to-end (en vivo, Aurora por el túnel)

`scripts/prueba_flujo_oms.py todo` con `hoy=2026-11-04`:
- **ingest** EFLOW→orders: 165 leídos, 164 upserted (1 saltado: ANCORA NI), 165 espejados.
- **plan** ventana (hoy, hoy+3]: planificó Cofersa entrega 11-05 y 11-06.
- **barrido**: total 111, priorizados 111, liberados 111, 0 pendientes, **0 sincronizados**.

Verificado en BD:
- **Punto 3 OK end-to-end**: 111 Cofersa liberados con `orders.priority = 0` y en el espejo
  `sim_expedicionescabecera` → `TPEXSI=GENE` + `PRIORIDAD=0`. EPA conserva su prioridad.
  `ck_order_priority (>= 0)` aguanta los ceros.
- **Sync (pasada 1b) NO se ejercitó**: todos los planificados se liberaron el mismo día
  (`dias_prep_picking=1`, dispatch 11-04/11-05 dentro de la ventana). Queda cubierto por
  tests. Insight: la cola de priorización se vacía rápido; las prioridades intermedias
  (2,3) y el sync solo aparecen con pedidos planificados ≥2 días antes de su salida.

Clasificación final (todas las compañías): 817 liberados, **0 en cola de priorización**,
67 en bandeja = 13 vencidos (11-02) + 23 entrega hoy (11-04, "hoy no se planifica") + 31
futuros >3 días (11-08/09/10). Los 36 primeros son material del punto 4 (auditoría).

Por qué se liberó 11-06 estando a 11-04: `dispatch_date = entrega − lead_time` (lead 1–3)
→ salida 11-03/04/05; la ventana abre `salida − 1`, así que hoy ya la cruzaron. Correcto.

## Fix de bandeja vacía — rename de columna (reconciliación entre ramas)

**Síntoma:** la Bandeja de Pedidos salía vacía.
**Causa:** choque de nombres entre ramas para el contador de cambios de fecha de entrega:
- Planificación (dueña del cambio de fecha: `bandeja.py`, `cambio_fecha.py`) usa
  `delivery_date_changes` (su `sql/57_orders_cambio_fecha_entrega.sql`).
- El refactor a `tbl_orders` dejó el contador con el nombre de `sql/56`
  (`delivery_date_change_count`). → el `SELECT` de la bandeja apuntaba a una columna
  inexistente → el endpoint fallaba → bandeja vacía (y rompía "cambiar fecha" también).

**Decisión (usuario):** unificar en el nombre de Planificación (`delivery_date_changes`),
dejar su código intacto y adaptar lo nuestro (panel del OMS).

**Aplicado:**
- `sql/58_orders_rename_delivery_date_changes.sql` (aplicada a la Aurora del túnel):
  `drop view orders` → `rename column delivery_date_change_count → delivery_date_changes`
  + rename del CHECK a `ck_order_delivery_date_changes` → **recrea la vista** `orders`
  (57 columnas, misma proyección) → restituye owner `olo_db` + grants `tms_app`.
  Verificado: vista auto-actualizable (YES/YES), bandeja `_DELIVERY` ahora devuelve 67.
- `src/pages/oms/api/omsApi.ts` + `types.ts`: el panel lee `delivery_date_changes`.
- `sql/56` marcada SUPERSEDED (no correr en entornos nuevos).
- Código de Planificación: **sin tocar** (su `delivery_date_changes` ya existe).

**Pendiente de Intelix:**
- Aplicar `sql/58` a qa/prod (en la Aurora del túnel/sandbox ya está).
- Deploy del frontend del OMS (panel con `delivery_date_changes`).
- La bandeja desplegada de Planificación se arregla sola con la migración (lee por `pg`
  directo, sin caché de esquema). La capa de datos del OMS (`backend/data`) sí cachea
  esquema → cold-start/redeploy para ver la columna renombrada. En local, reiniciar
  `npm run server` tras la migración.
