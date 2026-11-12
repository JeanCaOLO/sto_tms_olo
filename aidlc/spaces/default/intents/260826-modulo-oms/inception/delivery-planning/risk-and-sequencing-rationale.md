# Racional de riesgo y secuenciación — Módulo OMS (v4)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (re-corrida v4, 2026-10-16).
> Explica el porqué del orden de los Bolts. Consume: unit-of-work-dependency.md
> (DAG U2→U1), bolt-plan.md, contract-summary.md.

## Heurística: walking-skeleton-first + bloqueo por integración

No se aplicó WSJF formal: con 2 unidades y una de ellas bloqueada por
integraciones abiertas, no hay backlog que puntuar y re-ordenar. El orden es:
**Bolt 1 = U1 (walking skeleton) primero; Bolt 2 = U2 bloqueado hasta resolver sus
OQ.**

## Respeto del DAG

El DAG es `U2 → U1` (U2 reutiliza el borde de escritura de U1). Construir U1 primero
y U2 después respeta la arista sin desviación. Además U2 está bloqueado por
integración, lo que refuerza el orden.

## Riesgos y cómo los ataca el orden

1. **Flujo invertido correcto (riesgo principal del rediseño)**: la inversión (D7)
   cambió quién dispara y de dónde lee el OMS. Bolt 1 (walking skeleton) valida de
   punta a punta el contrato **C1** (señal + pull por columna `oms_processed_at`,
   barrido como red de seguridad, batching por compañía) y **C2** (dos escrituras:
   `orders` + EFLOW, sin número de viaje, idempotencia por llave + columna). Al ser
   el primer Bolt, el punto más incierto se construye y prueba primero.
   `ponytail:` dos escrituras sin 2PC — techo = orden + reintento idempotente;
   upgrade = outbox/reconciliación.
2. **Idempotencia del pull por columna**: `oms_processed_at` es la red de seguridad
   ante señal perdida/duplicada. Bolt 1 prueba que re-correr (señal duplicada o
   barrido) no re-prioriza.
3. **EPA cortocircuita el score (D9)**: Bolt 1 prueba que EPA no pasa por
   fecha/score (prioridad pre-asignada por EPRAC), un camino distinto al de
   Cofersa/mayoreo.
4. **Duración por `lead_time_days` (D10)**: Bolt 1 cubre Cofersa (=1) y el mecanismo
   de lectura por columna; el cálculo dinámico de VE es futuro (no bloquea).
5. **Backorder bloqueado (D13)**: U2 depende de OQ-BO1/BO2/BO3 (integraciones no
   resueltas). Construirlo ahora sería sobre supuestos; por eso se **bloquea** hasta
   la próxima reunión en vez de adivinar el contrato.

## Por qué U2 no entra ahora

Construir el backorder sin saber de dónde lee las acciones omitidas (OQ-BO1), qué
fuente de inventario consulta (OQ-BO2) ni cuál es su disparador (OQ-BO3) produciría
código sobre supuestos que la próxima reunión puede invalidar. Se registra como
Bolt 2 bloqueado para no perderlo, pero no se construye.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work-dependency.md` (DAG U2→U1).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/delivery-planning/bolt-plan.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/contract-design/contract-summary.md` (C1, C2).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/decisions.md` (ADR-007..012).

## Assumptions & Open Questions

- Bolt 2 permanece bloqueado hasta cerrar OQ-BO1/BO2/BO3; su contrato se formaliza
  entonces.
