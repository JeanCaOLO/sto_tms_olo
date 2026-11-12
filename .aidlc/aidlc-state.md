# AI-DLC State — overlay Intelix (Gate 0 / entry mode)

> No confundir con el estado por intent del runtime (`aidlc/spaces/.../intents/`).
> Este archivo gobierna el handoff Discovery → Inception y el CI de la plantilla.

## Project

- **name**: `intelix-estandar-frontend`
- **entry_mode**: `with-discovery`
- **classification**: ``  # menor | intermedio | mayor
- **gate_status**: `pending`  # pending | approved | rejected
- **updated_at**: `2026-10-28`

## Inception iterations (resumen)

> Contadores derivados del ledger `.aidlc/audit/inception-iterations.jsonl`.
> No editar a mano: correr `python .intelix/scripts/inception_iterations.py sync-state`.

- **inception_iterations**: `0`  # vueltas dentro de Inception (antes del gate de Inception)
- **construction_impacts**: `0`  # cambios que afectaron Construction / develop
- **hh_impact_total**: `0`  # HH estimadas de rework (ledger)
- **inception_gate_status**: `pending`  # pending | approved | rejected
- **first_iteration_at**: ``
- **last_iteration_at**: ``
- **ledger_updated_at**: ``

## Entry Mode Rules

### with-discovery

1. `Product-Definition/` con contenido real (no stubs).
2. `python .intelix/scripts/validate_discovery_gate.py --mode with-discovery`
3. Tras sign-off humano: `gate_status = approved`.

### no-discovery

1. Completar `Product-Definition/` en Ideation.
2. Antes de Inception: `--mode no-discovery --strict-no-discovery`.

## Feedforward

- Estandares: `docs/estandares/`
- Seguridad R1–R14: `docs/estandares/seguridad-baseline.md`
- Memory AI-DLC: `aidlc/spaces/default/memory/project.md`
- Guia equipo: `docs/guides/gobierno-iadlc-intelix.md`
- Iteraciones Inception: `docs/guides/inception-iterations.md`
