# Asignación de Bolts a mobs — Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (2026-10-01). Consume:
> unit-of-work.md, bolt-plan.md. Deriva de las unidades de Units Generation y la
> secuencia de `bolt-plan.md`.
>
> Un **mob** es el equipo que posee la construcción de un Bolt. En este scope
> `classic` no corrió team-formation (1.5 SKIP), así que no hay equipos humanos
> declarados y todos los Bolts los ejecuta el agente de desarrollo de la framework.

## Asignación

| Bolt | Unidades | Mob | Tipo |
|---|---|---|---|
| Bolt 1 | U1 `motor-reglas-oms` + U2 `esquema-pedidos-oms` | `aidlc-developer-agent` | AI (default) |

## Notas

- **Program Board**: no aplica. El Program Board es la vista de coordinación cuando
  hay más de un equipo trabajando Bolts en paralelo; aquí hay un solo mob y un solo
  Bolt, así que no hay nada que coordinar entre equipos.
- **Sin equipos humanos**: team-formation (stage 1.5) fue SKIP en el scope
  `classic`. Por eso la asignación cae en el default de la framework:
  `aidlc-developer-agent` para todos los Bolts.
- **Backend compartido**: la construcción de Bolt 1 toca el backend (`backend/`),
  que en el reparto del canal `.agents/CANAL.md` es terreno del dueño de backend
  (Claude). Aplica la excepción acordada por el usuario ("hacé todo" para generar el
  esqueleto backend). Se anotará la tarea en la tabla *En curso* del canal antes de
  tocar `backend/` durante code-generation.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/delivery-planning/bolt-plan.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/aidlc-state.md` (scope `classic`, 1.5 SKIP).

## Assumptions & Open Questions

- Si una iteración futura amplía el alcance y se decide incorporar equipos humanos,
  esta asignación se re-evalúa en la corrida de Delivery Planning correspondiente.
