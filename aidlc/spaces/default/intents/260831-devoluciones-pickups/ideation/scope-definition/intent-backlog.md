# Intent Backlog — Devoluciones/Pickups (FR16)

Proto-unidades priorizadas para esta iniciativa. Deriva de `scope-document.md`,
`../intent-capture/intent-statement.md` y
`../feasibility/feasibility-assessment.md`. Priorización dependency-first con
riesgo diferido (WSJF cualitativo: valor visible / esfuerzo / bloqueos).

## Backlog priorizado

| # | Ítem | FR | Valor | Esfuerzo | Bloqueos | Notas |
|---|------|----|-------|----------|----------|-------|
| 1 | Distinción visual de paradas de devolución (lista + mapa) | FR16.2 | Medio-alto (visible de inmediato) | Bajo | Ninguno | Cambio de UI acotado en `ParadaCard`/`PedidoCard` y render de mapa; precedente en el marcado de "fuera de ventana" y "excepción". |
| 2 | Devolución conocida en el cálculo de capacidad | FR16.3 | Alto | Bajo-medio | Ninguno | El bin-packing (`capacity-fit.ts`/FR2) ya trata peso y volumen por pedido; la devolución entra igual. |
| 3 | Ingesta de la recolección conocida como parada en la secuencia | FR16.1 | Alto (corazón del requerimiento) | Medio | Forma mínima del dato (parcial OQ-4) | Se diseña tras fijar en `requirements-analysis` qué campos trae una recolección. |

## Fuera de este backlog

| Ítem | FR | Motivo |
|------|----|--------|
| Recolección "al pie de camión" — insertar parada y recalcular en vivo | FR16.4 | Viabilidad MEDIA (`../feasibility/feasibility-assessment.md`); depende de OQ-4 y de la regla de "cabe". Ciclo separado. |

## Mapa de valor

`Recolección conocida (WMS/Iflow)` → **FR16.1** la incorpora a la secuencia →
**FR16.2** la hace reconocible para el planificador → **FR16.3** la vuelve real
para la capacidad del vehículo → ruta ejecutable sin coordinación externa
(outcome de `../intent-capture/intent-statement.md`).

## Assumptions & Open Questions

- [assumption] Los tres ítems se pueden entregar de forma incremental sin
  reordenar el resto del módulo (`../feasibility/constraint-register.md` CT-2).
- Open question: si `requirements-analysis` revela que FR16.1 necesita más de
  "tipo + peso + volumen", el orden 1→2→3 se mantiene pero el ítem 3 crece.
