# 2026-11-10 — Cron de la bandeja (cada 10 min) separado del replan

## What changed

- `replan.ingestar_programado` (nuevo): trae la cola DISP/DISP de eFlow a Aurora, deja la fila
  `planif_ingesta_bandeja` en el historial (`bitacora.registrar_ingesta`) y **lanza** si eFlow falla.
- `replan.replanificar_programado` ya no ingesta: planifica sobre lo ya ingestado.
- `app.handler`: nueva acción `ingesta_bandeja` del Scheduler.
- `backend/planning/template.yaml`: Scheduler `ingesta-bandeja` `cron(0/10 5-16 ? * MON-FRI *)` CR y
  `EventInvokeConfig.MaximumRetryAttempts: 0` (una falla no se repite 3 veces).
- `backend/local/ingesta_bandeja.py` (nuevo): el mismo cron desde la PC, cada 10 min, con las
  credenciales de `.env.local`.
- Panel del OMS: etiqueta "Actualizar bandeja" en el historial (tipo Planificación).
- Pendiente 01 actualizado con la decisión.

## Why

Pedido de Jesús: traer pedidos a la bandeja y planificarlos son cosas distintas, cada una con su
cron; la bandeja cada 10 min. El sandbox no es de Intelix: no se usa el secreto, la ingesta real
corre desde la PC, pero el cron desplegado debe existir y fallar visible en el historial.

## How

- Corrida real desde local: 278 leídos, 12 salieron de la cola, 733 líneas.
- Backend 629 en verde (3 pruebas nuevas), tsc y pruebas del OMS en verde.

## Follow-ups

- Requiere deploy del stack de planning y del frontend.
- Con el cron desplegado fallando cada 10 min, el aviso de errores recientes del Panel del OMS
  quedará encendido.
