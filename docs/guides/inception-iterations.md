# Iteraciones de Inception y cambios de alcance

Controla **cuantas vueltas** hubo en Inception, **que cambios de alcance**
afectaron Construction / `develop`, con **fechas** e **impacto en HH**.

Skill del agente: `intelix-inception-iterations`.

## Modelo

| Concepto | Prefijo ID | Cuando |
|----------|------------|--------|
| Iteracion de Inception | `INC-ITER-NN` | Antes de aprobar el gate de Inception |
| Cambio con impacto Construction | `SCOPE-RW-NN` | Tras Gate 0 / Inception aprobada |

**Fuente de verdad:** `.aidlc/audit/inception-iterations.jsonl` (append-only, protegido en sync).

**Resumen:** contadores + `hh_impact_total` en `.aidlc/aidlc-state.md`.

**Reporte:** `.aidlc/audit/inception-report.md` + `.html` — incluye contexto del
proyecto (entry mode, Gate 0, clasificacion, pin AI-DLC), elementos destacados
de la plantilla (develop oficial, REWORK real vs 5%, rigor proporcional, R1–R14),
taxonomia de disparadores y cruce con skills relacionados.

## HH de impacto

```text
HH_evento = --hh-delta (si se pasa)
         o Σ HH_plan(tasks_reopened + tasks_added) − Σ HH_plan(tasks_skipped)
```

Fuentes del plan (en orden):

1. `--hh-catalog path.json` o `.aidlc/audit/hh-catalog.json`
2. `PLAN-ESTIMACION-*-FINAL.xlsx` (hoja Plan, columnas Duracion + ID Tracker) si hay `openpyxl`

Comparar al cierre con el `REWORK_FACTOR` (~5%) de `intelix-estimacion`: ese es margen
**planificado**; el ledger mide rework **real**.

## Comandos

```bash
python .intelix/scripts/inception_iterations.py add --phase inception --kind gate_rejected \
  --summary "..." --hh-delta 6 --sync-state

python .intelix/scripts/inception_iterations.py add --phase construction_impact \
  --kind po_scope_change --developers "Desarrollador 1,Desarrollador 2" \
  --branches "feature/auth-login,feature/auth-session" \
  --tasks-reopened "U1-T2,U1-T4" --tasks-added "U1-T7" \
  --develop-effect "..." --sync-state

python .intelix/scripts/inception_iterations.py list --phase inception
python .intelix/scripts/inception_iterations.py status
python .intelix/scripts/inception_iterations.py report
python .intelix/scripts/inception_iterations.py simulate
```

Demo local (genera `.aidlc/audit/examples/simulacion-inception/`; no se incluye
en la plantilla para no contaminar proyectos nuevos):

```bash
python .intelix/scripts/inception_iterations.py simulate
```

## Reglas

1. Cada rejected del gate de Inception → `INC-ITER-*`.
2. Cambio de alcance firmado que toque vision/historias/diseno → evento en ledger.
3. Si ya hay Construction: `construction_impact` + devs + ramas + efecto en `develop`.
4. Avance oficial del % sigue midiendo solo `develop` (`intelix-consolidado-avance`).
5. Issue GitLab: *Inception Iteration or Scope Change*.

## Relacion con otros artefactos

| Artefacto | Rol |
|-----------|-----|
| Gate 0 / `Product-Definition/` | Entrada a Inception |
| `intelix-estimacion` | HH baseline y `REWORK_FACTOR` |
| `intelix-task-tracker` | IDs de tareas reabiertas/nuevas |
| `intelix-consolidado-avance` | % oficial en develop vs consolidado |
