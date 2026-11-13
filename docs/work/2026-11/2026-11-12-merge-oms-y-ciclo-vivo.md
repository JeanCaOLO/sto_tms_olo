# 2026-11-12 — Merge de la rama oms (Eduardo) a planificacion-2 y ciclo vivo

## Merge
- `github/oms` (ea25d2c..2fda1fb) → `planificacion-2`, sin conflictos: liberación manual por
  pedido (POST /api/v1/oms/pedidos/liberar), días de anticipo por zona (sql/65, ya aplicada en
  Aurora), barrido dev cada 3 h.
- Backend 636 → 637 tests verde; `tsc --noEmit` sin errores.

## Ciclo vivo (Aurora sandbox + eFlow CR real, desde la PC)
1. Ingesta: 194 leídos, 48 salieron de la cola, 986 líneas.
2. Replan programado: 2026-11-13 y 2026-11-14 planificados; 47 pedidos con viaje (27 con zona TMS).
3. Barrido OMS live (`verif_oms.py --barrido`): 47 priorizados, 47 liberados.
   Resultado: 47 en `DISP/GENE`, prioridad 0, con `prioritization_run_id`, espejo `GENE`.
4. Segunda ingesta: `tbl_orders` intacto (fix 61518f0 OK), pero el espejo volvió a `DISP` en 34.

## Fix
- `backend/planning/src/sim_eflow_sync.py`: el upsert del espejo no pisa filas con
  `TPEXSI='GENE'` (mismo problema que la ingesta: eFlow real sigue DISP/DISP). Test agregado.
- Reparado el espejo: 526 filas de liberados en GENE en `tbl_orders` → `TPEXSI='GENE'`,
  `PRIORIDAD=orders.priority`. Llaves en `2026-11-12-espejo-gene-reparado-llaves.json`.
  Rollback: `UPDATE sim_expedicionescabecera SET "TPEXSI"='DISP'` sobre esas llaves (la
  PRIORIDAD previa no se guardó; era la de eFlow y la repone el siguiente sync).
- Tercera ingesta: los 47 siguen GENE en orders y en el espejo.

## verif_oms.py tras el fix (fallas restantes, todas históricas)
- 8 priorizados-no-liberados fuera de DISP: movidos en eFlow el 2026-11-10 (pendiente 03).
- 15 liberados sin `prioritization_run_id`: liberados entre 2026-10-26 y 2026-11-09.
- 146 liberados sin GENE / sin espejo GENE: estado real de eFlow copiado antes del fix 61518f0.
- Nota: `verif_oms.py --barrido` revienta al imprimir `→` en consola cp1252 (el barrido sí corre);
  usar `PYTHONIOENCODING=utf-8`.

## Pendientes
- 05 nuevo: prioridad del OMS pisada por la ingesta entre barridos (por verificar con Eduardo).
