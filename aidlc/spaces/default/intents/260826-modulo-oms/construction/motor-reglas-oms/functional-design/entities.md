# Entidades — U1 `motor-reglas-oms`

> Intent: `260826-modulo-oms`. Functional Design (Construction), unidad U1.
> As-built (rama `oms`). Nomenclatura EFLOW/EPRAC. Esquema único `public`.

> **Nota de infraestructura de datos (v4.3, 2026-11-04)**: tras un refactor de
> esquema, la **tabla real** es `public.tbl_orders` y **`public.orders` es una VISTA**
> auto-actualizable sobre ella (convención `tbl_`). La lógica del OMS **no cambia**:
> lectura y escritura siguen por la **vista `orders`**; solo el DDL (p. ej. el `CHECK`
> de `sql/57`) va a `tbl_orders`. Donde abajo se dice `orders`/`public.orders` se
> entiende la vista.

## `PedidoCandidato` (proyección de lectura de `public.orders`)

Lo que `cola_candidatos.py` devuelve por polling. No es tabla propia; es la lectura
de `public.orders` (vista sobre `tbl_orders`) filtrada por
`planning_run_id IS NOT NULL AND oms_processed_at IS NULL`.

| Campo | Origen (`orders`) | Nota |
|---|---|---|
| eflow_id_almacen / compania / sucursal / expedicion | llave EFLOW (texto) | identidad / idempotencia |
| delivery_date | date | fecha de entrega del cliente (insumo; no se modifica) |
| lead_time_days | integer, nullable | duración logística dinámica (Planificación); NULL → default 1 |
| numero_viaje | text (YYYYMMDD-NNN) | lo escribe Planificación; el OMS NO lo escribe |
| planning_run_id | text | marcador de lote de Planificación (parte del filtro de cola) |
| oms_processed_at | timestamptz, nullable | NULL = pendiente; el OMS estampa now() al completar |
| observaciones | text | contexto (la IA de observaciones está diferida, D11) |
| delivery_zone | text | base de cliente-retira (por zona) |
| customer_type | TIENDA \| MAYOREO | separa EPA (TIENDA) de Cofersa/mayoreo |
| priority / oms_score / wms_situation / handoff_status | — | resultado que el OMS escribe (ver RegistroPrioridad/handoff) |

## `RegistroPrioridad` (resultado en memoria del motor)

| Campo | Nota |
|---|---|
| llave EFLOW | identidad |
| prioridad | numérica invertida (menor = más urgente), producida por la estrategia del scope (v4.2): Cofersa = días hasta la salida, ≥ piso de cola (1); EPA pre-asignada (1 o 2; nunca 0; OQ-EPA-VAL — CERRADA 2026-10-30: EPA = 1 y 2) |
| score | ponderado (submódulo puro); n/a para EPA (cortocircuito) |
| cliente_retira | detectado por `delivery_zone` |
| es_epa | si `customer_type=TIENDA` → rama ReglaEPA |

## `ConfiguracionReglas` / `oms_rule_configs` — estrategia de prioridad (v4.2, ADR-014)

Columnas nuevas de `oms_rule_configs` (`sql/55_oms_rule_configs_estrategia_prioridad.sql`,
retrocompatibles) y su campo en `ConfiguracionReglas` (`models.py`):

| Columna | Tipo / default | Check | Nota |
|---|---|---|---|
| `estrategia` | `text not null default 'escala_lineal'` | `ck_oms_rule_config_estrategia`: `in ('escala_lineal', 'dias_hasta_salida')` | esquema de numeración del scope; `sql/55` apunta la fila CUSTOMER de Cofersa (`customers.code = 'COFERSA'`) a `dias_hasta_salida` |
| `ancla_fecha` | `text not null default 'alistado'` | `ck_oms_rule_config_ancla`: `in ('alistado', 'entrega')` | solo para `dias_hasta_salida`: `alistado` = entrega − lead_time_days; `entrega` = fecha cruda |
| `prioridad_piso` | `integer not null default 1` | `ck_oms_rule_config_piso`: `>= 0` | solo para `dias_hasta_salida`: mínimo de la cola; 0 se reserva para el liberado |

`escala_prioridad` (default 100) se mantiene y solo la usa `escala_lineal`.

Constantes en `models.py` (fuente única de los literales; el `CHECK` de `sql/55` es
el único espejo SQL):

| Constante | Valor |
|---|---|
| `ESTRATEGIA_ESCALA_LINEAL` | `"escala_lineal"` |
| `ESTRATEGIA_DIAS_HASTA_SALIDA` | `"dias_hasta_salida"` |
| `ESTRATEGIAS_VALIDAS` | `(ESTRATEGIA_ESCALA_LINEAL, ESTRATEGIA_DIAS_HASTA_SALIDA)` |
| `ANCLA_ALISTADO` | `"alistado"` |
| `ANCLA_ENTREGA` | `"entrega"` |
| `ANCLAS_VALIDAS` | `(ANCLA_ALISTADO, ANCLA_ENTREGA)` |
| `PRIORIDAD_PISO_DEFECTO` | `1` |

Campos de `ConfiguracionReglas`: `estrategia: str = ESTRATEGIA_ESCALA_LINEAL`,
`ancla_fecha: str = ANCLA_ALISTADO`, `prioridad_piso: int = PRIORIDAD_PISO_DEFECTO`.

## `ContextoPrioridad` (entrada en memoria de la estrategia, v4.2)

| Campo | Nota |
|---|---|
| pedido | `PedidoCandidato` |
| hoy | `date` del barrido |
| score | score ponderado ya calculado |
| cliente_retira | detectado por `delivery_zone` |
| config | `ConfiguracionReglas` del scope resuelto |

## Escritura (as-built)

- **`public.orders`** (priorización): `priority`, `oms_score`,
  `handoff_status='priorizado'`, `prioritization_run_id`; `wms_situation` queda
  `DISP`, sin `oms_processed_at`.
- **`public.orders`** (liberación, escritura 1): `wms_situation='GENE'`,
  `handoff_status`, `oms_processed_at=now()` y el número de `priority` que va a eFlow
  **según la compañía** (v4.3, as-built `app._liberar`): **Cofersa** (priorizada)
  → `priority = 0` y ese 0 es el número que se manda
  (`LIBERAR_PEDIDO_CON_PRIORIDAD_SQL`); **EPA** (pass-through) → **no toca
  `priority`** (conserva su número de origen, 1 o 2; `prioridad_liberacion=None`
  cuando `priorizar=false`), ese mismo número se devuelve a eFlow y **EPA nunca pasa
  por 0**.
- **`sim_expedicionescabecera`** (escritura 2, vía costura `EscritorSituacion`, DOS
  verbos): `actualizar_prioridad` → **solo `PRIORIDAD`**, `TPEXSI` queda `DISP`
  (`SIM_PRIORIDAD_SQL`; pasada 1b de sync, v4.3, SOLO Cofersa); `marcar_generada` →
  `TPEXSI='GENE'` + `PRIORIDAD` (`SIM_SITUACION_SQL`; liberación). Temporal: reemplaza
  a los endpoints EPRAC futuros. eFlow real NO se toca.

## Sources

- `backend/oms/src/models.py`, `backend/oms/src/cola_candidatos.py`, `backend/oms/src/handoff_pedidos.py`, `backend/oms/src/app.py`.
- `docs/reference/mapeo-pedidos-eflow-orders.md`.
- `sql/57_orders_priority_allow_zero.sql` (CHECK priority>=0; `tbl_orders` + vista `orders`).
- `docs/work/2026-11/2026-11-04-sync-prioridad-eflow-y-liberacion-manual.md` (v4.3: dos verbos de la costura, prioridad 0 al liberar, vista/`tbl_orders`).
- `docs/work/2026-10/2026-10-29-prioridad-cofersa-dias-hasta-salida.md` (v4.2);
  `backend/oms/src/estrategias_prioridad.py`, `backend/oms/src/reglas_config.py`,
  `sql/55_oms_rule_configs_estrategia_prioridad.sql`.
