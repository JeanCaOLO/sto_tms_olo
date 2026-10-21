# Plan de pruebas — Comunicación Planificación ↔ OMS

**Fecha:** 2026-10-21 · **Autores:** Chus (Planificación) + Eduardo (OMS) · **Estado:** para ejecutar (21–22 oct)
**Rev 2026-10-21:** lado OMS alineado a **ADR-013** (sin tabla propia; dos pasadas priorizar/liberar; ventana de preparación; barrido + "Procesar a Eflow"; `handoff_status`). `store_id` eliminado.

## 1. Objetivo

Simular y validar **end-to-end la comunicación entre Planificación y el OMS** sobre Aurora
(`tms_olo`), **antes** de que estén las 6 APIs reales de Iflow (solicitadas a IPRA el
20-oct). La frontera entre los dos módulos es un **contrato de columnas en la tabla
`orders`**, no una llamada de código: Planificación estampa, el OMS consume y marca. Este
plan prueba ese contrato en ambos sentidos y la limpieza al re-planificar.

## 2. Alcance

**Dentro:**
- Ingesta eFlow → `orders`.
- Planificación: bin-packing (tope 16 + márgenes 85/95), secuencia, apertura de viajes y
  **estampado del handoff** en `orders`.
- La **cola del OMS** y su procesamiento en dos pasadas: **priorizar** (deja `DISP`) y
  **liberar** dentro de ventana (`wms_situation='GENE'` + `oms_processed_at`).
- **Re-planificación** y limpieza de pedidos que se caen del plan.
- Write-back del nº de viaje a eFlow **simulado** (tabla espejo).

**Fuera (hoy):**
- Las **6 APIs reales de Iflow** (no entregadas; §7 mapea cada una a su simulación).
- El **WMS/eFlow real**: es **solo lectura**, jamás se escribe contra `10.17.224.20`. La
  "escritura 2" del OMS se simula contra la tabla espejo `sim_expedicionescabecera` en Aurora
  (deja `handoff_status='completado'`; solo si la costura falla queda `disparo_pendiente`).

## 3. Ambiente de prueba

| Pieza | Cómo |
|---|---|
| Base | Aurora `tms_olo` vía túnel SSM `localhost:15432`. **Chus:** `scripts/tunel-aurora.ps1` con `AWS_PROFILE=ext-claude`. **Eduardo:** otro perfil, mismo puerto 15432 — ⚠️ **acordar** puerto/perfil distinto para no leer la Aurora del otro sin darse cuenta |
| eFlow | Lectura real (`EFLOW_SIM_MODE=live`) o espejo `sim_expedicionescabecera` en Aurora |
| OMS | `OMS_SOURCE=mock` (no toca DB, estado observable) o `live` (escritura 1 a `public.orders`; escritura 2 al espejo `sim_expedicionescabecera`) |
| Scripts planif | `backend/planning/src/`: `ingest_orders.py`, `plan_builder.py`, `replan.py` |
| Verificación | Planif: scripts pg8000 (patrón `scratchpad/verif_*.py`). OMS: `backend/oms/pruebas/verif_oms.py` (invariantes sobre `orders` + `sim_expedicionescabecera`) |

## 4. El contrato (la frontera Planif ↔ OMS)

Todo pasa por `orders` en Aurora. Quién escribe qué:

| Columna en `orders` | La escribe | Significado |
|---|---|---|
| `numero_viaje` | **Planificación** | viaje asignado (`<AAAAMMDD>-<seq>`) |
| `lead_time_days` | **Planificación** | días de tránsito (haversine al depósito CR) |
| `dispatch_date` | **Planificación** | `delivery_date − lead_time_days` (NULL si no hay lead) |
| `planning_run_id` | **Planificación** | uuid de la corrida (cliente-día) |
| `delivery_zone` | **Planificación** | zona de entrega |
| `priority`, `oms_score`, `wms_situation`, `oms_processed_at` | **OMS** | Planificación **NO** las toca |

- **Cola del OMS** = planificado y no procesado:
  `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`.

> **ADR-013 — el OMS NO tiene tabla propia.** Escribe sobre `public.orders` (+ la costura en
> `sim_expedicionescabecera`), y desacopla en **dos pasadas**:
>
> - **Priorizar:** escribe `priority` + `oms_score` (y `prioritization_run_id`) y deja
>   `wms_situation='DISP'`. **No** pone `GENE` ni `oms_processed_at`. `handoff_status='priorizado'`.
> - **Liberar:** solo para los pedidos **dentro de la ventana** `dispatch_date −
>   dias_prep_picking` (default 1 día). Pone `wms_situation='GENE'` + `oms_processed_at` (cierra
>   la cola), `handoff_status` → `disparo_pendiente` → `completado`. Los pedidos **fuera de
>   ventana** quedan **priorizados-no-liberados** (`DISP`, con prioridad, sin `oms_processed_at`).
> - **Costura (escritura 2)** → `sim_expedicionescabecera` (espejo del WMS; el eFlow real es
>   solo lectura): `TPEXSI='GENE'`, `TPEXES` queda `'DISP'`. Si la costura **falla**,
>   `handoff_status` queda en `disparo_pendiente` (reconciliable); si va bien, `completado`.
> - **Barrido** 5×/día (en dev cada 15 min) que libera lo que va entrando en ventana; y acción
>   manual **"Procesar a Eflow"** que libera un viaje **ignorando la ventana**.
> - Estados reales: `handoff_status` (`priorizado`→`disparo_pendiente`→`completado`) y
>   `wms_situation` (`DISP`/`GENE`). No existen `status='priorizado'` ni `situacion='generada'`.

## 5. Precondiciones / datos de prueba

- Túnel arriba y `orders` accesible.
- **`store_id` ya no existe** como columna (Eduardo dropeó la columna y borró los `DEMO-*`
  viejos). Los pedidos vivos (402) son los de **llave EFLOW** (`eflow_id_*`); el criterio
  "`store_id = NULL`" ya **no aplica**.
- Elegir un **cliente + almacén + día de entrega** con pedidos `DISP` y `fecha_de_cierre
  IS NULL` en eFlow (p. ej. CR / Cofersa / día D).
- Incluir a propósito: un viaje con **>16 pedidos**, un pedido **sin coordenadas**, y al
  menos un pedido **"cliente retira"** (por observaciones).

## 6. Casos de prueba

> Cada caso: **precondición → pasos → esperado**. "Verificar" = query a `orders` /
> `sim_expedicionescabecera` (p. ej. `backend/oms/pruebas/verif_oms.py`).

### T1 — Ingesta eFlow → orders
- **Pasos:** correr `ingest_orders.ingest_cr()`.
- **Esperado:** los pedidos `DISP` del día llegan a `orders` con `eflow_id_*` y
  `status='pending'`. Correrlo **dos veces no duplica** (ON CONFLICT por
  `eflow_id_almacen+compania+sucursal+expedicion`).

### T2 — Planificación estampa el handoff
- **Pasos:** `plan_builder.construir_y_persistir(org, country, wh, customer, dia, user)`.
- **Esperado:** cada pedido planificado queda con `numero_viaje` (`AAAAMMDD-seq`),
  `lead_time_days`, `planning_run_id` (uuid), `dispatch_date`, `delivery_zone`; y
  `oms_processed_at`/`priority` **sin tocar**. Se crean `route_plans→plan_trips→plan_stops`.

### T3 — dispatch_date correcto
- **Esperado:** `dispatch_date = delivery_date − lead_time_days` para todo el viaje; un
  viaje **sin coordenadas** → `lead_time_days` NULL → `dispatch_date` NULL.

### T4 — Tope de 16 y capacidad
- **Precondición:** viaje con >16 pedidos que caben por peso/volumen.
- **Esperado:** se abre **más de un** `numero_viaje`; **ningún viaje supera 16 pedidos**; se
  respetan los márgenes 85 % peso / 95 % volumen.

### T5 — Cliente retira aparte
- **Esperado:** los pedidos "cliente retira" **no entran al ruteo** (sin camión), van en su
  propio grupo/prioridad; el resto se rutea normal.

### T6 — La cola del OMS
- **Pasos:** `SELECT count(*) FROM orders WHERE planning_run_id IS NOT NULL AND oms_processed_at IS NULL`.
- **Esperado:** devuelve **exactamente** los pedidos recién planificados en T2 (ni más ni menos).

### T7 — OMS prioriza (pasada 1, deja DISP)
- **Pasos:** correr la priorización del OMS sobre la cola (`OMS_SOURCE=live`).
- **Esperado:** cada pedido de la cola queda con `priority` + `oms_score`
  (+ `prioritization_run_id`) y `handoff_status='priorizado'`; `wms_situation` sigue en
  `'DISP'` y **`oms_processed_at` sigue vacío** (priorizar NO libera). Planificación no tocó
  esas columnas.

### T8 — OMS libera dentro de ventana (pasada 2, GENE)
- **Precondición:** pedidos ya priorizados (T7), unos **dentro** de la ventana
  `dispatch_date − dias_prep_picking` (default 1) y otros **fuera**.
- **Esperado:** solo los **dentro de ventana** pasan a `wms_situation='GENE'` + `oms_processed_at`
  (salen de la cola), `handoff_status`→`completado`; la costura escribe
  `sim_expedicionescabecera` (`TPEXSI='GENE'`, `TPEXES='DISP'`). Los **fuera de ventana** quedan
  priorizados-no-liberados (`DISP`, con prioridad, **sin** `oms_processed_at`). **Nunca** se
  escribe contra el eFlow real.

### T8b — La costura falla → disparo_pendiente
- **Pasos:** forzar fallo de la escritura 2 (espejo no disponible) al liberar un viaje.
- **Esperado:** el pedido queda `handoff_status='disparo_pendiente'` (reconciliable), sin dejar
  estado inconsistente ni abortar el resto; el barrido/reintento lo retoma.

### T9 — Idempotencia del OMS
- **Esperado:** re-correr priorizar/liberar **no duplica** ni corrompe (UPSERT sobre `orders`
  por su llave); un pedido ya `completado` no se re-libera (salvo criterio de re-proceso a
  definir).

### T9b — Barrido y acción manual "Procesar a Eflow"
- **Esperado (barrido):** el barrido (5×/día; dev cada 15 min) libera los que **entraron** en
  ventana desde la última corrida, sin tocar los que siguen fuera.
- **Esperado (manual):** "Procesar a Eflow" sobre un viaje lo libera **ignorando la ventana**
  (fuerza `GENE` + `oms_processed_at` aunque falte para la fecha).

### T10 — Re-planificación / pedido que se cae
- **Pasos:** sacar un pedido del plan (excluirlo o moverlo de día) y re-planificar el día.
- **Esperado:** el pedido caído queda con `numero_viaje`/`lead_time_days`/`planning_run_id`/
  `dispatch_date` en **NULL** → **sale de la cola del OMS**; los que siguen se re-estampan con
  un `planning_run_id` **nuevo**. (`oms_processed_at` no se toca en la limpieza.)

### T11 — Write-back del nº de viaje (simulado)
- **Esperado:** el `numero_viaje` se escribe en la tabla espejo `sim_expedicionescabecera`,
  **nunca** contra el eFlow real.

### T12 — Trazabilidad
- **Esperado:** la vista de logs/bitácora del OMS (en construcción) registra cada acción y
  decisión (automático/manual) para auditar el flujo después.

## 7. Mapa a las 6 APIs de Iflow (cuando lleguen)

Hoy cada paso se simula contra Aurora/espejo; al llegar las APIs, se reemplaza la
simulación por la llamada real:

| Acción del flujo | Simulación hoy | API Iflow (futura) |
|---|---|---|
| Jalar pedidos `DISP` | lectura eFlow / espejo | **GET pedidos** (×2) |
| OMS pasa `DISP`→`GENE` (al liberar) | costura a `sim_expedicionescabecera` | **POST situación** |
| OMS fija prioridad | `priority`/`oms_score` en `orders` | **POST prioridad** |
| Asignación de viaje | `numero_viaje` en `orders` + espejo | **POST viaje** |
| Bajada del viaje | — (CR lo hace Torre Control) | **POST bajada** (ubicar en flujo) |
| División de mercadería | — (Torre Control) | **POST división** (ubicar en flujo) |

## 8. Criterios de aceptación

- El loop **ingesta → planificación → cola → priorizar → liberar (en ventana) → GENE** corre
  sin errores con datos reales de un día.
- El contrato de columnas se respeta en ambos sentidos (Planif no pisa OMS y viceversa).
- Priorizar deja `DISP` sin `oms_processed_at`; solo liberar (dentro de ventana, barrido o
  manual) pone `GENE` + `oms_processed_at`.
- La re-planificación limpia correctamente a los que se caen.
- Nada se escribe contra el eFlow real (la costura va al espejo `sim_expedicionescabecera`).

## 9. Riesgos / pendientes

- **Sin las APIs de Iflow**, las escrituras al WMS son stub/simuladas: el loop se valida
  contra Aurora, no contra el WMS productivo.
- **Sin 2PC** entre la liberación (`orders`: `GENE`+`oms_processed_at`) y la costura al espejo:
  la consistencia depende del orden fijo + idempotencia + reconciliación de `handoff_status`
  (T8b cubre el caso "costura falla → `disparo_pendiente`").
- El valor de `dias_prep_picking` (ventana, default 1) y la cadencia del barrido (5×/día)
  deben confirmarse por compañía — hoy son defaults de dev.
- Falta definir en qué módulo (TMS u OMS) entran **bajada** y **división de mercadería**.
