# Dependencias entre unidades — Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Units Generation (re-corrida v4, 2026-10-16).
> Topología (DAG) de las 2 unidades de la rebanada tras la inversión del flujo.
> Describe qué depende de qué; NO decide el orden económico (eso es Delivery
> Planning).

## DAG (prosa)

- **U1 — `motor-reglas-oms`** (service): la corrida de priorización. Depende de
  recursos **externos/existentes**, no de otra unidad del OMS: `public.orders`
  (lectura y escritura 1; ya existe en BD) y EFLOW `EXPEDICIONESCABECERA`
  (escritura 2). La **activa Planificación** (externo).
- **U2 — `backorder-inventario-oms`** (service): el loop de backorder. Depende de
  **U1** porque **reutiliza el borde de escritura** (`HandoffPedidosOMS`) para
  re-generar las acciones omitidas cuando entra stock.

Grafo acíclico. Dos unidades, una arista: **`U2 → U1`** (U2 reusa el handoff de U1).
Nota: se invierte respecto a v3 (donde `U1 → U2` por el esquema): la antigua unit
de esquema desapareció y la nueva arista es la del backorder sobre el handoff.

## Puntos de integración

- **U1 ↔ `public.orders`** (Aurora, existente): `ColaCandidatos` lee; `HandoffPedidosOMS`
  escribe (escritura 1).
- **U1 ↔ EFLOW/WMS** (externo): `HandoffPedidosOMS` escribe `TPEXSI='GENE'` +
  `PRIORIDAD` (escritura 2). Hoy mock/stub.
- **U1 ↔ Planificación** (externo): Planificación **activa** a U1 (lambda async,
  `planning_run_id` + scope).
- **U1 ↔ EPRAC** (externo): `ReglaEPA` respeta la prioridad pre-asignada.
- **U1 ↔ ConfiguracionReglas por scope** (externo/parámetros): pesos, umbral;
  duración logística llega como insumo de Planificación.
- **U2 ↔ U1** (interno): el backorder reutiliza el borde de escritura de U1.
- **U2 ↔ EFLOW (acciones omitidas) + fuente de inventario** (externo): OQ-BO1/BO2.

## Oportunidades de paralelismo

U1 es el primer entregable (esqueleto del motor). U2 (backorder) puede arrancar su
esqueleto en paralelo, pero su diseño fino depende de las OQ abiertas
(OQ-BO1/BO2/BO3) y reusa el handoff de U1, así que se construye después o junto al
cierre de U1.

## Bloque de dependencias (machine-readable)

> **U2 DIFERIDA del unit set de Construction (2026-10-19).** `backorder-inventario-oms`
> está **bloqueada** por OQ-BO1 (tabla/estado de acciones omitidas en EFLOW),
> OQ-BO2 (fuente de inventario) y OQ-BO3 (disparador del re-chequeo) — sin
> definición de negocio y sin código. Code Generation es `execution: ALWAYS` y no
> admite skip por unidad, así que se la retira del unit set de ESTA pasada de
> Construction para que la etapa se asiente solo sobre U1 (as-built). **U2 NO se
> elimina del proyecto**: sigue descrita en la prosa de este archivo y en
> `unit-of-work.md` como unidad futura.
>
> **Cómo re-agregar U2 a Construction** (cuando negocio cierre OQ-BO1/BO2/BO3):
> descomentar el bloque `backorder-inventario-oms` de abajo, correr
> `bun .kiro/tools/aidlc-runtime.ts compile` para recomputar el `bolt_dag`, y
> re-entrar a Construction por U2 (su arista `U2 → U1` sigue siendo válida: reusa
> `HandoffPedidosOMS` de U1). Reversible y trazable.

```yaml
units:
  - name: motor-reglas-oms
    kind: service
    depends_on: []
```

**U2 diferida (fuera del bloque `units` activo).** Para re-agregar
`backorder-inventario-oms` a Construction cuando negocio cierre OQ-BO1/BO2/BO3,
reinsertar esta entrada dentro del bloque `units` de arriba y recompilar el
runtime-graph:

```text
  - name: backorder-inventario-oms
    kind: service
    depends_on: [motor-reglas-oms]
```

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (v4).

## Assumptions & Open Questions

- La unit de esquema (`esquema-pedidos-oms`) de v3 se eliminó; `public.orders` ya
  existe. Por eso U1 no tiene dependencia de una unidad de esquema.
- Al ampliar el alcance (UI, catálogo, simulador, panel, auditoría, override)
  surgirán más units y aristas en corridas posteriores.
