# Dependencias entre unidades — Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Units Generation (re-corrida acotada,
> 2026-10-01). Topología (DAG) de las 2 unidades de la rebanada. Describe qué
> puede depender de qué; NO decide el orden económico (eso es Delivery Planning).

## DAG (prosa)

- **U2 — `esquema-pedidos-oms`** (spec): sin dependencias. Es el contrato de datos
  base (tabla propia del OMS).
- **U1 — `motor-reglas-oms`** (service): depende de **U2** — el `HandoffPedidosOMS`
  (escritura 1) persiste en la tabla cuyo esquema define U2.

Grafo acíclico. Solo dos unidades, una arista: `U1 → U2`.

## Puntos de integración

- **U1 ↔ EFLOW/WMS** (externo): `ColaCandidatos` lee `EXPEDICIONESCABECERA`
  (TPEXES/TPEXSI, FECHAEXPEDICIONPLANIFICADA, OBSERVACIONESEXPEDICION) y
  `HandoffPedidosOMS` escribe `TPEXSI='GENE'`. Hoy mock (OQ-2).
- **U1 ↔ U2** (interno): `HandoffPedidosOMS` escribe `PedidosOMS` (esquema de U2).
- **U1 ↔ Amazon Bedrock** (externo): `AnalizadorObservaciones` (a construir).
- **U1 ↔ ConfiguracionReglas por scope** (externo/parámetros): pesos, umbral,
  parámetros de ruta estimados por scope CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL.
- **U2 → Planificación** (externo, consumidor): Planificación lee la tabla del OMS
  (handoff). Planificación es otro intent (`260825-route-planning-reqs`), fuera de
  esta rebanada.

## Oportunidades de paralelismo

El esquema (U2) puede materializarse en paralelo con el arranque del esqueleto de
U1; U1 solo necesita U2 cuando implementa la escritura 1 del handoff.

## Bloque de dependencias (machine-readable)

```yaml
units:
  - name: esquema-pedidos-oms
    kind: spec
    depends_on: []
  - name: motor-reglas-oms
    kind: service
    depends_on: [esquema-pedidos-oms]
```

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md`.

## Assumptions & Open Questions

- Topología mínima (2 units, 1 arista). Al ampliar el alcance surgirán más units y
  aristas en corridas posteriores.
