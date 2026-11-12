---
inclusion: always
---

# AI-DLC + Discovery INTELIX (Kiro)

Harness del motor: `.kiro/`. Gate 0 / entry_mode: `.aidlc/` (fuera del harness; no lo pisa AI-DLC).

1. Leer `.intelix/project-profile.json` y respetar tipo de solucion, baseline e infraestructura.
2. Leer `.intelix/applicability-policy.json` y no convertir perfiles `reference-only` en requisitos.
3. Leer `.aidlc/aidlc-state.md` (entry_mode, gate_status, clasificacion, contadores de Inception).
4. Priorizar `Product-Definition/` si hay Discovery.
5. No avanzar a Inception/Construction si Gate 0 esta pending o rejected.
6. Registrar vueltas de Inception / rework de alcance con
   `python .intelix/scripts/inception_iterations.py` (guia: `docs/guides/inception-iterations.md`).
7. Aplicar según la politica `docs/estandares/estandares-desarrollo-intelix.md` o
   `docs/estandares/estandares-mobile-kmp-intelix.md`, junto con `seguridad-baseline.md`.
8. Antes de codificar (Intermedio/Mayor): gate de diseno `intelix-arquitectura-gate`.
   En Construction: `intelix-seguridad-linter` sobre el diff y `intelix-qa-gate` para cerrar la unidad.
9. Practices del space: `aidlc/spaces/default/memory/project.md`.
10. Pin de runtime: `aidlcVersion` en `.intelix/config.json` (no usar latest ni rama v2).
11. Tras refresh de AI-DLC: `intelix-cli sync` repone este steering automaticamente.

Arranque: contenido de `Product-Definition/HANDOFF_PROMPT.md`.
Guia de equipo: `docs/guides/gobierno-iadlc-intelix.md`.
Prompts por fase (anti-alucinacion): `docs/guides/prompting-por-fase-aidlc.md`.
