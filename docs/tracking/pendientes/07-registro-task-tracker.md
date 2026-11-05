# 07 — Registro en el task tracker

**Estado:** pendiente. El `CLAUDE.md` de `sto_tms_olo` pide registrar el avance de las tareas en los índices `tracking/` del layout AI-DLC (`python .claude/skills/intelix-task-tracker/check_drift.py`, 🔄 al empezar y 🟡 al terminar). Estos cambios (nombre de parada, tiempos por parada, vista del cliente) se hicieron fuera del flujo AI-DLC y **no se registraron**.

> **Hallazgo (2026-11-05):** `.claude/skills/intelix-task-tracker/` **no existe** en este repo (ni `check_drift.py`), aunque el `CLAUDE.md` lo exige. Hay que traerlo con `intelix-cli sync --force` antes de poder registrar nada.

## Qué falta
- Ejecutar `check_drift.py` y registrar las tareas con su fecha real (no se fabrican timestamps; un hueco se anota con `note`).
- Que un humano conceda el ✅ tras verificar (ver [02](./02-aplicar-migraciones-y-prueba-e2e.md)).
