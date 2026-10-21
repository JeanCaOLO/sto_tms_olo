# Reglas de negocio — U1 `motor-reglas-oms`

> Intent: `260826-modulo-oms`. Functional Design (Construction), unidad U1.
> As-built (rama `oms`). Reglas con ID `BRx.y` para trazabilidad.

```yaml
rules:
  - id: BR1.1
    name: Activación por polling de columna
    statement: >
      La cola del OMS se resuelve leyendo public.orders con
      planning_run_id IS NOT NULL AND oms_processed_at IS NULL. La columna es la
      única fuente de verdad (activación v1 = polling; EventBridge futuro).
    traces_to: [FR0, FR1, US0, US1]
  - id: BR1.2
    name: Idempotencia por oms_processed_at
    statement: >
      El OMS estampa oms_processed_at = now() al completar el handoff de cada
      pedido, lo que lo saca de la cola. Re-correr no re-prioriza (idempotencia
      natural por la columna).
    traces_to: [FR0, FR8, US0, US9]
  - id: BR2.1
    name: Regla de fecha generalizada (T − duración)
    statement: >
      fecha_listo = delivery_date − lead_time_days. lead_time_days es dinámico (lo
      entrega Planificación por pedido); si viene NULL, default 1 día (Cofersa). El
      OMS no modifica fechas. No aplica a EPA.
    traces_to: [FR2, US7, US8]
  - id: BR3.1
    name: Prioridad numérica invertida con score ponderado
    statement: >
      La prioridad es numérica invertida (menor = más urgente), resultado del score
      ponderado (submódulo puro). Umbral de inyección corta por capacidad.
    traces_to: [FR3, US10, US11b]
  - id: BR4.1
    name: EPA cortocircuita el score
    statement: >
      Para EPA (customer_type=TIENDA) el OMS no recalcula: toma la prioridad
      pre-asignada por EPRAC (guion-0=0, guion-1=1) y libera ambas expediciones
      juntas en GENE.
    traces_to: [FR6b, US-EPA]
  - id: BR5.1
    name: Cliente retira por zona
    statement: >
      El cliente-retira se identifica por delivery_zone (no por observaciones ni
      IA); recibe prioridad máxima.
    traces_to: [FR6, US13]
  - id: BR6.1
    name: Handoff — escritura 1 a public.orders
    statement: >
      UPDATE a public.orders por la llave EFLOW con priority, oms_score,
      wms_situation='GENE', handoff_status, prioritization_run_id, oms_processed_at.
      Atómica (nunca GENE sin prioridad).
    traces_to: [FR8, US9]
  - id: BR6.2
    name: Handoff — escritura 2 por costura, eFlow read-only
    statement: >
      La escritura 2 (TPEXSI='GENE' + PRIORIDAD) va por la interface
      EscritorSituacion. Hoy escribe a sim_expedicionescabecera; mañana al endpoint
      EPRAC, sin tocar el motor. El OMS nunca escribe directo a eFlow (read-only).
      GENE lo pone solo el OMS; no escribe numero_viaje.
    traces_to: [FR8, US9]
```

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/decisions.md` (ADR-007..011).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/contract-design/contract-summary.md`.
- Código as-built: `backend/oms/src/*.py`.
