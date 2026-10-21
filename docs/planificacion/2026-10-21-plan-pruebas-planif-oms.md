# Plan de pruebas — Comunicación Planificación ↔ OMS

**Fecha:** 2026-10-21 · **Autores:** Chus (Planificación) + Eduardo (OMS) · **Estado:** para ejecutar (21–22 oct)

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
- La **cola del OMS** y su procesamiento (prioridad + `situacion='generada'` + marca de
  procesado).
- **Re-planificación** y limpieza de pedidos que se caen del plan.
- Write-back del nº de viaje a eFlow **simulado** (tabla espejo).

**Fuera (hoy):**
- Las **6 APIs reales de Iflow** (no entregadas; §7 mapea cada una a su simulación).
- La **escritura 2 del OMS al WMS real** (`EXPEDICIONESCABECERA.TPEXSI='GENE'`): hoy es
  stub (`OMS_SOURCE=live` la deja pendiente). Se simula contra el espejo.
- eFlow **real es solo lectura**: jamás se escribe contra `10.17.224.20`.

## 3. Ambiente de prueba

| Pieza | Cómo |
|---|---|
| Base | Aurora `tms_olo` vía túnel SSM `localhost:15432` (`scripts/tunel-aurora.ps1`, `AWS_PROFILE=ext-claude`) |
| eFlow | Lectura real (`EFLOW_SIM_MODE=live`) o espejo `sim_expedicionescabecera` en Aurora |
| OMS | `OMS_SOURCE=mock` (no toca DB, estado observable) o `live` (escritura 1 a `oms.pedidos`; escritura 2 al WMS = stub) |
| Scripts planif | `backend/planning/src/`: `ingest_orders.py`, `plan_builder.py`, `replan.py` |
| Verificación | scripts pg8000 contra Aurora (patrón de `scratchpad/verif_*.py`) |

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
- **OMS escritura 1** → tabla propia `oms.pedidos` (UPSERT por PK `id_almacen+id_compania+id_sucursal+id_expedicion`):
  `prioridad`, `status='priorizado'`, `situacion='generada'`, `estado_handoff`, `corrida`.
- **OMS escritura 2** → WMS `EXPEDICIONESCABECERA`: `TPEXSI='GENE'` (dispara picking),
  `TPEXES` queda `'DISP'`. `estado_handoff`: `disparo_pendiente` → `completado`.

## 5. Precondiciones / datos de prueba

- Túnel arriba y `orders` accesible.
- **`store_id` ya limpio** (Eduardo borró los `DEMO-*` viejos; los vivos son los de
  `store_id = NULL`, que vienen de eFlow).
- Elegir un **cliente + almacén + día de entrega** con pedidos `DISP` y `fecha_de_cierre
  IS NULL` en eFlow (p. ej. CR / Cofersa / día D).
- Incluir a propósito: un viaje con **>16 pedidos**, un pedido **sin coordenadas**, y al
  menos un pedido **"cliente retira"** (por observaciones).

## 6. Casos de prueba

> Cada caso: **precondición → pasos → esperado**. "Verificar" = query a `orders`/`oms.pedidos`.

### T1 — Ingesta eFlow → orders
- **Pasos:** correr `ingest_orders.ingest_cr()`.
- **Esperado:** los pedidos `DISP` del día llegan a `orders` con `eflow_id_*`,
  `store_id = NULL`, `status='pending'`. Correrlo **dos veces no duplica** (ON CONFLICT por
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

### T7 — OMS procesa (escritura 1)
- **Pasos:** correr el OMS sobre la cola (`OMS_SOURCE=live`).
- **Esperado:** `oms.pedidos` tiene un UPSERT por pedido con `prioridad`,
  `status='priorizado'`, `situacion='generada'`, `estado_handoff`, `corrida`; el OMS marca
  `oms_processed_at` en `orders` (cierra la cola). Planificación **no** modificó esas
  columnas.

### T8 — OMS escritura 2 (GENE)
- **Esperado (live real, futuro):** `EXPEDICIONESCABECERA.TPEXSI='GENE'`, `TPEXES='DISP'`,
  `estado_handoff='completado'`. **Hoy:** es stub → se simula contra el espejo y se verifica
  que `estado_handoff` quede `disparo_pendiente` (reconciliable), sin error.

### T9 — Idempotencia del OMS
- **Esperado:** re-correr el OMS **no duplica** `oms.pedidos` (UPSERT por PK); un pedido ya
  `completado` no se re-dispara (salvo criterio de re-proceso a definir).

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
| OMS pasa `DISP`→`GENE` | escritura 2 stub / espejo | **POST situación** |
| OMS fija prioridad | `oms.pedidos` + espejo | **POST prioridad** |
| Asignación de viaje | `numero_viaje` en `orders` + espejo | **POST viaje** |
| Bajada del viaje | — (CR lo hace Torre Control) | **POST bajada** (ubicar en flujo) |
| División de mercadería | — (Torre Control) | **POST división** (ubicar en flujo) |

## 8. Criterios de aceptación

- El loop **ingesta → planificación → cola → OMS → GENE** corre sin errores con datos reales
  de un día.
- El contrato de columnas se respeta en ambos sentidos (Planif no pisa OMS y viceversa).
- La re-planificación limpia correctamente a los que se caen.
- Nada se escribe contra el eFlow real.

## 9. Riesgos / pendientes

- **Sin las APIs de Iflow**, las escrituras al WMS son stub/simuladas: el loop se valida
  contra Aurora, no contra el WMS productivo.
- **Sin 2PC** entre escritura 1 y 2 del OMS: la consistencia depende del orden fijo +
  idempotencia + reconciliación de `estado_handoff` (probar el caso "escritura 2 falla").
- Falta definir en qué módulo (TMS u OMS) entran **bajada** y **división de mercadería**.
