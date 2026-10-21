# U1 `motor-reglas-oms` — reconciliación de código al contrato v4

**Fecha:** 2026-10-16
**Intent AI-DLC:** `260826-modulo-oms`
**Tipo:** iteración de implementación (Construction — reconciliación de U1)
**Rama:** `oms`

> Complementa el hito de diseño `2026-10-16-recorrida-v4-inversion-flujo-oms.md`
> (que cubre requirements/user-stories/domain-design/units/contract/delivery, sin
> estimación por ser diseño). Esta entrada documenta la **iteración de código** que
> aquel hito no cubre.

## Qué se hizo

Reconciliación del esqueleto del motor de reglas del OMS (U1) al **contrato de
integración OMS↔Planificación/EPRAC cerrado el 2026-10-16** (confirmado con la IA
de Planificación + negocio Antonio/Eduardo). Proyecto brownfield: solo se cambió lo
que el contrato nuevo exige, sin reescribir lo que funcionaba.

## Cambios de código (`backend/oms/src/`)

- **`cola_candidatos.py`** — la cola se resuelve por **polling de columna** sobre
  `public.orders`: `WHERE planning_run_id IS NOT NULL AND oms_processed_at IS NULL`.
  Se eliminó el filtro viejo (`EXPEDICIONESCABECERA` con `TPEXES/TPEXSI='DISP'` y
  `NUMEROVIAJEWMH`/`wms_trip_number`). Expone `numero_viaje`, `lead_time_days`,
  `delivery_date`, `observaciones`, `delivery_zone`, `customer_type`,
  `planning_run_id` y la llave EFLOW.
- **`handoff_pedidos.py`** — escritura 1 = UPDATE a `public.orders` (priority,
  oms_score, `wms_situation='GENE'`, handoff_status, prioritization_run_id) +
  **`oms_processed_at = now()`** al completar (saca el pedido de la cola). Escritura
  2 **detrás de una interface `EscritorSituacion`** (costura): la implementación de
  hoy escribe a **`sim_expedicionescabecera`** (`TPEXSI='GENE'` + `PRIORIDAD`);
  mañana se intercambia por el endpoint real de EPRAC **sin tocar el motor**. **eFlow
  real NO se toca** (read-only). `GENE` lo pone solo el OMS.
- **`regla_fecha.py` / `models.py`** — la duración logística se lee de
  `lead_time_days` por pedido (**dinámico**; default 1 día si viene NULL). El modelo
  `PedidoCandidato` usa `numero_viaje`/`planning_run_id`/`oms_processed_at`; se quitó
  `wms_trip_number` (quedan solo comentarios de deprecación, ADR-0004 de Planificación).
- **`motor_reglas.py`** — ajustes de orquestación coherentes con lo anterior.

## Migración / SQL (`sql/`)

- **`sql/46_orders_drop_wms_trip_number.sql`** (NUEVO, idempotente):
  `ALTER TABLE orders DROP COLUMN IF EXISTS wms_trip_number;`. El número de viaje
  real es `orders.numero_viaje`. **No** se tocó `sql/19` (ahí vive
  `order_items.guia_fiscal`, que se conserva).
- **`sql/43_orders_expedicionescabecera.sql`**: corregido el comentario equivocado
  que daba `wms_trip_number` por "retirada en sql/20"; ahora refleja que `sql/19` la
  agregó y `sql/46` la dropea.

## Tests

- `backend/tests/test_oms.py` actualizado al modelo v4 (cola por polling,
  `numero_viaje`, `lead_time_days` dinámico con default, escritura 2 contra la
  costura/`sim_expedicionescabecera` verificando que NO toca eFlow real,
  `oms_processed_at` estampado). El cálculo de score (`score.py`) sigue siendo
  submódulo puro testeable.
- **Resultado (verificado): suite completa del backend 275 passed, 24 de ellos del
  OMS, 0 fallos.** venv/.pytest_cache temporales eliminados (no quedan en el working
  tree).

## Estimación

**No se capturaron datos de estimación para esta iteración** (esfuerzo/puntos/
tiempo). No se reconstruyen ni se inventan. Si el proceso del equipo exige
estimación para iteraciones de implementación, queda pendiente de añadir con cifras
reales.

## Pendiente externo (no bloqueante)

- **Endpoint real de EPRAC** detrás de la costura `EscritorSituacion`. Hoy la
  escritura 2 se simula en `sim_expedicionescabecera`; cuando EPRAC provea el
  endpoint, se cambia la implementación de la interface sin tocar el motor.
- **U2 `backorder-inventario-oms`**: bloqueado por OQ-BO1/BO2/BO3 (tabla/estado de
  acciones omitidas en EFLOW, fuente de inventario, disparador) — próxima reunión.

## Fuentes

- Contrato: `aidlc/.../inception/contract-design/contract-summary.md` (C1, C2) y
  `decisions.md` (ADR-007 polling, ADR-008 eFlow read-only + costura).
- Código: `backend/oms/src/*.py`, `backend/tests/test_oms.py`.
- SQL: `sql/46_orders_drop_wms_trip_number.sql`, `sql/43_orders_expedicionescabecera.sql`.
- Coordinación: `.agents/CANAL.md` (mensaje a Claude sobre el drop + sim).
