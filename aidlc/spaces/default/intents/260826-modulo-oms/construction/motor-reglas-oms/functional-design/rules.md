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
      La prioridad es numérica invertida (menor = más urgente), sin niveles
      nombrados. El score ponderado (submódulo puro score.py) se calcula siempre y
      se guarda en oms_score; el NÚMERO lo produce la estrategia del scope (BR3.3).
      Con escala_lineal (default) el score se mapea a [1, escala_prioridad].
      Umbral de inyección corta por capacidad.
    traces_to: [FR3, US10, US11b]
  - id: BR3.2
    name: Escala por días hasta la salida (0..n), piso de cola 1, 0 = liberado
    statement: >
      Estrategia dias_hasta_salida (Cofersa, v4.2 2026-10-29): prioridad =
      max(prioridad_piso, días entre hoy y la fecha ancla). Ancla 'alistado'
      (default) = delivery_date − lead_time_days (regla_fecha.fecha_alistado_objetivo);
      ancla 'entrega' = delivery_date cruda (regla_fecha.fecha_entrega). Cliente-
      retira → prioridad_piso. Fecha centinela/default (ancla None) → prioridad_piso.
      prioridad_piso default = 1, así que la cola nunca muestra 0; el 0 se reserva
      para el pedido ya liberado (que la liberación escriba 0 al WMS es follow-up).
      Se recalcula en cada barrido, así que baja sola conforme se acerca la fecha.
      Supera, solo para Cofersa, el DECIDED 2026-09-02 "2 prioridades" (EPA
      mantiene 1 y 2). Ancla fina vs. ventana de liberación ADR-013 abierta
      (OQ-PRIO-C); peso de otras reglas dentro del día aparcado (OQ-PRIO-A). El
      "0 = liberado" es convención de esta estrategia (piso de cola 1), no un
      invariante global de orders.priority. EPA usa 1 y 2 (nunca 0), así que no
      hay roce (BR4.1).
    traces_to: [FR3, US10, US11, US13]
  - id: BR3.3
    name: Estrategia de numeración por scope, configurable
    statement: >
      El número de prioridad lo calcula la estrategia que nombra
      ConfiguracionReglas.estrategia (columna oms_rule_configs.estrategia, resuelta
      por scope CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL). Estrategias registradas en
      estrategias_prioridad.py: escala_lineal (default, comportamiento previo) y
      dias_hasta_salida (Cofersa, apuntada por sql/55). Parámetros de
      dias_hasta_salida: ancla_fecha ('alistado' default | 'entrega') y
      prioridad_piso (default 1, ≥ 0; un 0 explícito se respeta). resolver(nombre)
      con nombre desconocido o None cae a escala_lineal. La lógica vive en código;
      la config solo elige estrategia y parámetros (no hay constructor dinámico).
    traces_to: [FR3, FR5, US10, US10b]
  - id: BR4.1
    name: EPA cortocircuita el score
    statement: >
      Para EPA (customer_type=TIENDA) el OMS no recalcula: toma la prioridad
      pre-asignada por EPRAC (1 o 2; nunca 0; no cambia) y libera el pedido en
      GENE con esa prioridad. Sin cambio en v4.2 (priorizar=false; no usa BR3.2).
      OQ-EPA-VAL — CERRADA 2026-10-30: EPA = 1 y 2 (confirmado por Eduardo; fuente
      2026-09-01). "0 = liberado" es convención de la estrategia dias_hasta_salida
      de Cofersa (piso de cola 1), no un invariante global de orders.priority. EPA
      usa 1 y 2 (nunca 0), así que no hay roce.
    traces_to: [FR6b, US-EPA]
  - id: BR5.1
    name: Cliente retira por zona
    statement: >
      El cliente-retira se identifica por delivery_zone (no por observaciones ni
      IA); recibe la prioridad máxima DE LA COLA = piso de cola: con
      dias_hasta_salida, prioridad_piso (1 por defecto, nunca 0); con escala_lineal,
      prioridad_cliente_retira acotado a [1, escala_prioridad].
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
- `docs/work/2026-10/2026-10-29-prioridad-cofersa-dias-hasta-salida.md` (BR3.2,
  BR3.3, ajuste de BR3.1/BR4.1/BR5.1; ADR-014). Código:
  `backend/oms/src/estrategias_prioridad.py`, `sql/55_oms_rule_configs_estrategia_prioridad.sql`.
