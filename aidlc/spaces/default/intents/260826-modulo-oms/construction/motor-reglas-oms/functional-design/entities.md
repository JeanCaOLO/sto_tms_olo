# Entidades — U1 `motor-reglas-oms`

> Intent: `260826-modulo-oms`. Functional Design (Construction), unidad U1.
> As-built (rama `oms`). Nomenclatura EFLOW/EPRAC. Esquema único `public`.

## `PedidoCandidato` (proyección de lectura de `public.orders`)

Lo que `cola_candidatos.py` devuelve por polling. No es tabla propia; es la lectura
de `public.orders` filtrada por `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`.

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
| prioridad | numérica invertida (menor = más urgente); EPA pre-asignada (0/1) |
| score | ponderado (submódulo puro); n/a para EPA (cortocircuito) |
| cliente_retira | detectado por `delivery_zone` |
| es_epa | si `customer_type=TIENDA` → rama ReglaEPA |

## Escritura (as-built)

- **`public.orders`** (escritura 1): `priority`, `oms_score`, `wms_situation='GENE'`,
  `handoff_status`, `prioritization_run_id`, `oms_processed_at=now()`.
- **`sim_expedicionescabecera`** (escritura 2, vía costura `EscritorSituacion`):
  `TPEXSI='GENE'` + `PRIORIDAD`. Temporal: reemplaza al endpoint EPRAC futuro. eFlow
  real NO se toca.

## Sources

- `backend/oms/src/models.py`, `backend/oms/src/cola_candidatos.py`, `backend/oms/src/handoff_pedidos.py`.
- `docs/reference/mapeo-pedidos-eflow-orders.md`.
