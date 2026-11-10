# 2026-11-05 — Datos: pedidos EPA amarrados a la tienda correcta, re-liberación del viaje EPA del 06-nov y rol admin

## What changed

Operaciones sobre los datos de Aurora `tms_olo`. No hay cambio de código.

- **28 pedidos de EPA reasignados** al cliente destino correcto. Por el error de la ingesta (corregido
  en PR #37) estaban amarrados a la copia de la tienda que pertenece a Cofersa (mismo código
  `005`/`006`/`008`). Quedan 0 pedidos amarrados a un cliente de otra compañía.
- **El viaje EPA del 06-nov se volvió a armar.** Mezclaba T005, T006 y T008 y ya estaba liberado. Se
  desmarcaron sus 4 pedidos (`wms_situation = DISP`, `oms_processed_at = NULL`,
  `handoff_status = priorizado`; en el espejo, `TPEXSI = DISP`), se corrió el replan desplegado y
  después el barrido del OMS. Resultado: `20261106-0029-001` (T005, 2 pedidos), `-002` (T006) y
  `-003` (T008), liberados de nuevo (4 liberados) con `NUMEROVIAJEWMH` nuevo.
- **Rol:** `jaraujo@intelix.biz` (creado por el login con Google) recibió `SuperAdministrador`.

## Why

- El viaje del 06-nov era el que mostraba el problema de EPA (reunión del 2026-11-03). Como la
  liberación es simulada (solo llega a `sim_expedicionescabecera`, todavía no al eFlow real), se pudo
  deshacer dentro del TMS sin tocar la bodega.
- El rol lo pidió Chus para ver los datos con su cuenta nueva.

## How

- Cada cambio se hizo en una transacción con asserts de cantidad (4 pedidos y 4 filas del espejo).
- La auditoría por trigger registró los UPDATE.
- Se verificó en la base: 3 viajes, uno por tienda; `20261106-001` queda solo para Cofersa.

## Follow-ups

- Los 32 pedidos de octubre que el Panel del OMS cuenta como "planificados sin fecha de salida" son
  viajes armados antes de que existiera `dispatch_date` y que nunca se cerraron (el TMS no recibe el
  cierre de eFlow). Ver OQ-4 de los requerimientos: rellenar `dispatch_date` o sincronizar el cierre.
