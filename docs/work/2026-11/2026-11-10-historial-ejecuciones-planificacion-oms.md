# 2026-11-10 — Historial de ejecuciones compartido Planificación + OMS en el Panel del OMS

## What changed

- `backend/planning/src/bitacora.py` (nuevo): Planificación escribe una fila por corrida en
  `tbl_oms_logs` (misma forma que el OMS), con `action` `planif_replan_programado`,
  `planif_replan_manual` o `planif_plan_dia`. Resumen: días planificados, bloqueados, pedidos leídos
  de eFlow, salidos de la cola; `warn` + el error real si eFlow no estuvo disponible.
- `replan.py` / `app.py`: las tres copias del try/except de la ingesta pasan a `bitacora.ingestar`,
  que además loguea la excepción completa (antes se tragaba).
- Panel del OMS: "Historial OMS" → "Historial de ejecuciones", columna **Tipo** (Planificación/OMS,
  deducido del prefijo `planif_`), etiquetas de las acciones nuevas y el resumen bajo la acción.
- `backend/tests/test_bitacora_planificacion.py`: 3 pruebas.

## Why

Pedido de Jesús: ver en un solo historial las ejecuciones de Planificación y del OMS.

## How

- Sin migración: el tipo sale de `action` y el resumen va en `detail` (jsonb), como ya hace el OMS.
- Verificado en Aurora: replan programado corrido desde local → fila `planif_replan_programado`
  ("3 día(s) planificado(s), 157 pedidos leídos de eFlow, 5 salieron de la cola") junto a los
  `barrido` del OMS. Backend 626 en verde; tsc y pruebas del OMS en verde.

## Follow-ups

- La tabla se llama `oms_logs` pero ya es compartida: renombrar a una bitácora general si se suma
  otro módulo (avisar a Eduardo, es su tabla).
- Requiere deploy del stack de planning y del frontend.
