# Overlay Intelix — Gate 0 / entry mode

`.aidlc/` en esta plantilla guarda **entry_mode y Gate 0** para GitLab y el equipo.

## Cursor y Kiro (recomendado en Intelix)

| Agente | Harness del motor AI-DLC | Gate 0 (este overlay) |
|--------|--------------------------|------------------------|
| Cursor | `.cursor/` | `.aidlc/` (fuera del harness: **sin colision**) |
| Kiro CLI / Kiro IDE | `.kiro/` | `.aidlc/` (fuera del harness: **sin colision**) |

Reglas del agente (siempre repuestas por `intelix-cli sync`):

- Cursor: `.cursor/rules/intelix-aidlc.mdc`
- Kiro: `.kiro/steering/aidlc-project.md` y `seguridad-baseline.md`

El estado del proyecto (sign-off) vive en `.aidlc/aidlc-state.md` y **no se regenera**
en sync aunque uses `--force`. Tampoco se pisa el ledger
`.aidlc/audit/inception-iterations.jsonl` (vueltas de Inception / impacto Construction).

## opencode / GitHub Copilot

Su harness del motor **tambien** es `.aidlc/`. Ahi conviven skills/engine de AI-DLC y este
overlay. `intelix-cli sync` solo agrega/repara README de Gate 0; no pisa `aidlc-state.md`.
Tras un `aidlc config` a mano, corre `intelix-cli sync` (con `--force` si faltan skills).

## No mezclar

El estado de cada pieza de trabajo del motor AI-DLC vive en `aidlc/spaces/<space>/intents/`.
Eso es distinto de este overlay.
