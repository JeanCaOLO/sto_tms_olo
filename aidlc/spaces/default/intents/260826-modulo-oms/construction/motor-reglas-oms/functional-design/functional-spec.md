# Functional Design — U1 `motor-reglas-oms`

> Intent: `260826-modulo-oms`. Fase: Construction. Unidad: U1 `motor-reglas-oms`
> (service, Lambda Python). 2026-10-16. **As-built**: el código ya está construido
> y verde (rama `oms`, 24 tests OMS / 275 suite); este diseño funcional documenta
> las firmas/contratos de los módulos para el registro de auditoría, coherente con
> el contrato cerrado (ADR-007 polling, ADR-008 eFlow read-only + costura).
> Nomenclatura EFLOW/EPRAC.

## Módulos de la unidad (7) y sus contratos

| Módulo | Responsabilidad | Contrato (entrada → salida) |
|---|---|---|
| `app.py` (handler) | Entrypoint Lambda + orquestación de la corrida | evento → ejecuta corrida (polling) |
| `cola_candidatos.py` | LECTURA de `public.orders` por polling | filtro `planning_run_id IS NOT NULL AND oms_processed_at IS NULL` → lista de `PedidoCandidato` |
| `motor_reglas.py` | Orquesta: deriva EPA, invoca reglas, score, umbral, batching por compañía | `PedidoCandidato[]` → `RegistroPrioridad[]` |
| `score.py` | **Submódulo PURO** de score ponderado → prioridad numérica invertida | pesos + señales → `(score, prioridad)` sin I/O |
| `regla_fecha.py` | `fecha_listo = delivery_date − lead_time_days` (dinámico; default 1) | pedido + `lead_time_days` → contribución de score |
| `analizador_observaciones.py` | **DIFERIDO (D11)** — cliente-retira es zona, no IA | n/a en esta rebanada |
| `handoff_pedidos.py` | ESCRITURA: UPDATE orders + escritura 2 por costura | `RegistroPrioridad` → orders + `sim_expedicionescabecera` |

> Nota: la detección de cliente-retira se hace por `delivery_zone` dentro del flujo
> (ReglaClienteRetiraZona del domain-design); EPA se cortocircuita (ReglaEPA). El
> `analizador_observaciones.py` queda diferido (D11).

## Firmas clave (Python, as-built)

### Lectura — `cola_candidatos.py`
- Consulta de polling: `SELECT ... FROM orders WHERE planning_run_id IS NOT NULL
  AND oms_processed_at IS NULL` (vía `tms_common.pg.query`). Devuelve
  `list[PedidoCandidato]`. El OMS ordena/batcha por compañía.

### Regla de fecha — `regla_fecha.py`
- `fecha_listo = delivery_date − lead_time_days`. `lead_time_days` viene por pedido
  (dinámico, de Planificación); si es NULL → default 1 día (Cofersa). No modifica
  fechas. EPA no pasa por aquí.

### Score — `score.py` (submódulo puro)
- `score_ponderado(señales, pesos) -> float`; `score_a_prioridad(score, ...) -> int`
  (invertida: menor = más urgente). Sin I/O; testeable aislado (Testing Posture).

### Handoff — `handoff_pedidos.py`
- **Escritura 1**: `UPDATE orders SET priority, oms_score, wms_situation='GENE',
  handoff_status, prioritization_run_id, oms_processed_at = now() WHERE <llave EFLOW>`.
- **Escritura 2 (costura `EscritorSituacion`)**: interface con impl
  `SimExpedicionesWriter` (hoy → `sim_expedicionescabecera`, `TPEXSI='GENE'` +
  `PRIORIDAD`), intercambiable por `EpracEndpointWriter` (futuro) sin tocar el motor.
  eFlow real NO se toca.
- Orden 1→2, reintento idempotente, `handoff_status` `disparo_pendiente`/`completado`.

## Flujo de la corrida (as-built)

1. Polling de `orders` (cola_candidatos) → candidatos del lote pendientes.
2. Por compañía: EPA → ReglaEPA (prioridad pre-asignada); resto → ReglaFecha +
   cliente-retira-por-zona → score (puro) → umbral.
3. Handoff: escritura 1 (orders + `oms_processed_at=now()`) → escritura 2 (costura).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (v4) y `decisions.md` (ADR-007, ADR-008, ADR-009, ADR-010, ADR-011).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/contract-design/contract-summary.md` (C1, C2).
- Código as-built: `backend/oms/src/*.py`, `backend/tests/test_oms.py`.

## Assumptions & Open Questions

- As-built: el código ya existe y está verde; este diseño lo documenta, no lo
  re-abre.
- Pendiente externo (no bloquea): endpoint real de EPRAC detrás de `EscritorSituacion`.
- `analizador_observaciones.py` diferido (D11).
