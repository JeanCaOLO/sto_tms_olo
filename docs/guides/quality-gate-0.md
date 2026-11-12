# Quality Gate 0 — Discovery Handoff

Filtro entre negocio (Discovery/Ideation) e Inception tecnica.

## Bloqueantes

| Artefacto | Elemento |
|-----------|----------|
| vision-document.md | Problema / casos de uso |
| vision-document.md | KPIs cuantificables |
| technical-environment.md | Integraciones |
| technical-environment.md | Cumplimiento / datos sensibles |
| open-questions.md | Archivo presente |
| HANDOFF_PROMPT.md | Obligatorio en with-discovery |

## Comando

```bash
python .intelix/scripts/validate_discovery_gate.py --mode with-discovery
```

El reporte queda en `.aidlc/audit/gate0-latest.md`.

Tras Gate 0, las vueltas de Inception y el rework de alcance se controlan con
[inception-iterations.md](inception-iterations.md).

## Prompt de auditoria (Dev → IA)

```text
Actua como arquitecto Intelix bajo AI-DLC.
Analiza Product-Definition/ contra Gate 0 y contra docs/estandares/.
Devuelve: Estado (Aprobado / Requiere ajustes / Incompleto), brechas bloqueantes,
y 3 a 5 preguntas para el PO. Respeta seguridad-baseline (no pidas secretos).
```
