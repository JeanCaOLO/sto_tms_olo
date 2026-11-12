---
name: intelix-inception-iterations
description: >-
  Registra y reporta iteraciones de la fase Inception (rechazos de gate, cambios
  de alcance, hallazgos tecnicos) y el impacto posterior en Construction /
  develop, incluyendo fechas y HH estimadas. Usar cuando el usuario pida:
  cuantas iteraciones de inception, rework de alcance, impacto en HH por cambio
  de scope, reporte de vueltas de inception, ledger de inception, SCOPE-RW,
  INC-ITER, cuanto costo el cambio de alcance.
---

# Skill: Control de iteraciones de Inception

Lleva el **conteo auditable** de vueltas en Inception y de cambios de alcance que
pegan a Construction. No reemplaza Gate 0 ni el task-tracker: los complementa.

## Motor (determinista)

```bash
python .intelix/scripts/inception_iterations.py <comando>
```

| Comando | Uso |
|---------|-----|
| `add` | Registrar `INC-ITER-*` o `SCOPE-RW-*` |
| `list` | Listar ledger |
| `status` | Contadores + HH |
| `report` | Generar `.aidlc/audit/inception-report.md|.html` |
| `sync-state` | Actualizar contadores en `.aidlc/aidlc-state.md` |
| `simulate` | Demo multi-dev local (escribe bajo `.aidlc/audit/examples/`; no viaja en init) |

## Cuando registrar

1. **Gate de Inception rechazado** → `--phase inception --kind gate_rejected`
2. **Cambio de alcance en Inception** (antes de aprobar) → `--phase inception --kind po_scope_change`
3. **Hallazgo tecnico** que obliga a rediseñar → `--phase inception --kind tech_discovery`
4. **Cambio post-aprobacion** que reabre Construction → `--phase construction_impact`

## HH de impacto

Prioridad al calcular HH del evento:

1. `--hh-delta N` (manual, prevalece)
2. Suma de HH del plan para `tasks_reopened` + `tasks_added` − `tasks_skipped`
   (desde `PLAN-ESTIMACION-*-FINAL.xlsx` si hay `openpyxl`, o `.aidlc/audit/hh-catalog.json`)

## Flujo tipico del agente

1. Confirmar con el humano: fase, disparador, resumen, fechas, evidencia (issue/MR).
2. Si hay impacto Construction: pedir devs, ramas `feature/*`, efecto en `develop`, IDs de tareas.
3. Ejecutar `add ... --sync-state`.
4. Ejecutar `report` y mostrar KPI (iteraciones, HH Inception, HH Construction).
5. Enlazar guia: `docs/guides/inception-iterations.md`.

## Ejemplo Inception

```bash
python .intelix/scripts/inception_iterations.py add \
  --phase inception \
  --kind gate_rejected \
  --summary "Faltan historias medibles en auth" \
  --opened-at 2026-02-10 --closed-at 2026-02-12 \
  --hh-delta 6 \
  --requested-by "Arquitecto" --issue "#12" \
  --sync-state
```

## Ejemplo impacto Construction multi-dev

```bash
python .intelix/scripts/inception_iterations.py add \
  --phase construction_impact \
  --kind po_scope_change \
  --summary "MFA obligatorio post-Inception" \
  --developers "Desarrollador 1,Desarrollador 2" \
  --branches "feature/auth-login,feature/auth-session" \
  --tasks-reopened "U1-T2,U1-T4" --tasks-added "U1-T7" \
  --develop-effect "Rebase auth en develop; U1-T2/T4 reabiertas" \
  --issue "#33" --mr "!41" \
  --sync-state
```

## Reglas

- Una vuelta = un evento con evidencia. No inventar contadores.
- No pisar el ledger a mano salvo correccion acordada.
- El % oficial de avance sigue saliendo solo de `develop` (`intelix-consolidado-avance`).
- Issue GitLab: plantilla *Inception Iteration or Scope Change*.
