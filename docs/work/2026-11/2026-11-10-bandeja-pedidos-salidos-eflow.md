# 2026-11-10 — Bandeja con pedidos viejos: ingesta refleja los que salieron de eFlow

## What changed

- `backend/planning/src/salientes.py` (nuevo) + llamada en `ingest_orders.ingest_cr`: los pedidos
  DISP/DISP de Aurora que ya no vienen en la cola de eFlow se consultan en
  `EXPEDICIONESCABECERA` por llave (expedición + compañía) y se les copia `TPEXES`/`TPEXSI` →
  `wms_status`/`wms_situation`. Los que siguen DISP/DISP en eFlow no se tocan.
- `backend/tests/test_salientes.py`: 2 pruebas (cambia el que salió, no toca el que sigue en eFlow
  ni la misma expedición de otra compañía).
- Pendientes del módulo en `docs/planificacion/pendientes/` (01 credenciales eFlow del replan, 02
  vencidos).
- Ingesta + replan corridos contra Aurora (ver How).

## Why

La bandeja tenía 85 pedidos con fecha pasada (2 al 7-nov). Contra eFlow: 70 cerrados, 4 con viaje, 4
en DEPA/EXPA y 7 todavía DISP/DISP. La ingesta solo trae la cola DISP/DISP y nunca actualizaba lo que
salía de ella. Además el replan programado de AWS no ingesta nada desde el 3-nov: el secreto
`/dev/tms/eflow` está vacío (pendiente 01).

## How

- Decisión: no se borra nada; se refleja el estado de eFlow (fuente de verdad). Los 7 vencidos reales
  quedan visibles (pendiente 02).
- Suite backend: 629 en la rama de prueba con OMS, 623 en `planificacion-2`.
- Corrida real contra Aurora (desde local, porque el replan de AWS no ingesta): bandeja 85 → 97
  (90 leídos de eFlow; 78 salidos dejaron la bandeja; quedan 7 vencidos reales). Replan armó 11, 12 y
  13-nov; la cola del OMS quedó con 78 pedidos planificados sin liberar.

## Follow-ups

- Pendiente 01: cargar `cr` en `/dev/tms/eflow` y loguear la excepción real del ingest.
- Pendiente 02: decidir quién cubre los vencidos.
- La corrida local se repite a mano hasta que el replan de AWS tenga credenciales; requiere deploy de
  `salientes.py` para que el cron también limpie.
