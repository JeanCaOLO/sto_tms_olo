# Asignación de Bolts a mobs — Módulo OMS (v4)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (re-corrida v4, 2026-10-16).
> Consume: unit-of-work.md, bolt-plan.md.
>
> Un **mob** es el equipo que posee la construcción de un Bolt. En scope `classic`
> no corrió team-formation (1.5 SKIP): no hay equipos humanos declarados y los Bolts
> los ejecuta el agente de desarrollo de la framework.

## Asignación

| Bolt | Unidad | Mob | Tipo | Estado |
|---|---|---|---|---|
| Bolt 1 | U1 `motor-reglas-oms` | `aidlc-developer-agent` | AI (default) | Listo para construir |
| Bolt 2 | U2 `backorder-inventario-oms` | `aidlc-developer-agent` | AI (default) | **BLOQUEADO** (OQ-BO1/BO2/BO3) |

## Notas

- **Program Board**: no aplica (un solo mob, un solo Bolt construible).
- **Sin equipos humanos**: team-formation (1.5) SKIP en scope `classic` → default
  `aidlc-developer-agent`.
- **Backend compartido**: la construcción de Bolt 1 toca `backend/` (terreno del
  dueño de backend en el canal `.agents/CANAL.md`). Aplica la excepción "hacé todo"
  acordada; se anota la tarea en el canal antes de tocar `backend/`.
- **Bolt 2 bloqueado**: no se asigna trabajo de construcción hasta resolver
  OQ-BO1/BO2/BO3 (próxima reunión).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/delivery-planning/bolt-plan.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/aidlc-state.md` (scope `classic`, 1.5 SKIP).

## Assumptions & Open Questions

- Si una iteración futura incorpora equipos humanos, esta asignación se re-evalúa.
