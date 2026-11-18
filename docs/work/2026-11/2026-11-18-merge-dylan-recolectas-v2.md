# 2026-11-18 — Merge de dylan-tarifas y consumidor de recolectas v2

## Merge
- `github/dylan-tarifas` (b2b09fb) mergeada en `planificacion-2` (216e636). Único conflicto:
  `.agents/CANAL.md`, se dejaron ambas entradas en orden cronológico.
- Migraciones 75/76/77 ya aplicadas por Dylan en Aurora (verificado).

## Integración (Planificación)
- `backend/planning/src/recolectas.py`: asignación v2 desde `vw_return_collection_candidates` con
  `assign_return_collection_v2` en SAVEPOINT; evaluaciones `no_candidate`/`failed` idempotentes;
  exclusión de devoluciones de `tbl_return_collection_results` en el camino histórico.
- `backend/planning/src/viajes_liberados.py`: cancela asignaciones `planned` antes de borrar viajes.
- `backend/planning/src/bandeja.py`: misma exclusión en los pickups.
- `plan_builder.py`: pasa `created_by` como actor.

## Verificación
- 6 tests nuevos en `backend/tests/test_recolectas.py`; suite backend 972 passed, 3 skipped.
- `tsc --noEmit` limpio tras el merge.
- Aurora: SQL nuevo ejecutado en un ciclo real de un día (2026-11-19) dentro de una transacción
  con ROLLBACK: 0 candidatas v2, 0 asignaciones, sin errores.
- No corrida la batería `tests/postgres` (Docker apagado).

Pendientes: `docs/planificacion/pendientes/08-recolectas-contrato-v2.md`.
