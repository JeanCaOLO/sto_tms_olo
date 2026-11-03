# 2026-11-03 — Replan automático cada hora + el replan no toca viajes liberados

## What changed

- `backend/planning/template.yaml`: Scheduler `ReplanHorario`, `cron(0 5-16 ? * MON-FRI *)`
  hora CR (cada hora de 05:00 a 16:00, días hábiles). Timeout de la Lambda de 30 a 120 s.
  Parámetro `ReplanAppUserId` (opcional) → env `REPLAN_APP_USER_ID`.
- `backend/planning/src/app.py`: `handler` distingue el evento del Scheduler
  (`{"accion": "replan_programado"}`) de las rutas HTTP.
- `backend/planning/src/replan.py`: `replanificar_programado()` ingesta eFlow y corre
  `replanificar_todo` en cada almacén con cola DISP/DISP.
- `backend/planning/src/viajes_liberados.py` (nuevo): un viaje con algún pedido ya
  liberado a eFlow (`orders.oms_processed_at` sellado, ADR-013) queda CONGELADO. El
  replan borra y re-arma solo lo no liberado, reusa el plan del día y numera a
  continuación del último nº de viaje (no reusa un nº que eFlow ya conoce).
- `backend/planning/src/plan_builder.py`: usa lo anterior en lugar de `_borrar_plan_del_dia`.

## Why

Pedido de Chus: replan cada hora de 5am a 5pm. Antes de programarlo se revisó qué
pasa con lo que el OMS ya mandó a eFlow: el replan borraba TODOS los viajes del día
y ponía en NULL `numero_viaje`/`dispatch_date` de todos sus pedidos, también de los
liberados, y renumeraba desde `-001`. Un replan con algo ya liberado dejaba esos
pedidos sin viaje en el TMS y reusaba números que eFlow ya tenía. Con 697 de los pedidos
de Aurora ya liberados, corriéndolo cada hora pasaría siempre.

## How

Última corrida a las 16:00 y no a las 17:00: `infra/horarios` apaga Aurora a las 17:00.
Verificación en Aurora dentro de una transacción con ROLLBACK (sin cambios en datos):
viaje EPA `20261106-001` con 3 pedidos marcados liberados y 1 sacado del viaje →
tras `handler({"accion": "replan_programado"})` el `001` quedó intacto (3 paradas, misma
`dispatch_date`), el suelto fue a un viaje nuevo `002` del mismo plan, sin viajes vacíos.
`pytest backend/tests` → 530 passed; `sam validate --lint` OK.

## Promoted knowledge

- `route_plans.created_by` es NOT NULL y no existe un app_user "Sistema": la corrida
  programada firma con `REPLAN_APP_USER_ID` o, si está vacío, con el app_user activo
  más antiguo de la org.
- La marca de "ya enviado a eFlow" es `orders.oms_processed_at` (+ `wms_situation = 'GENE'`).

## Follow-ups

- Crear un app_user "Sistema" y pasarlo en `ReplanAppUserId` para que los planes
  automáticos no queden firmados por una persona.
- Un pedido liberado cuyo pedido cambia después en eFlow (fecha/dirección) sigue en su
  viaje congelado: el replan no lo mueve. Si hace falta reabrirlo, es decisión del OMS.
- Desplegar `planning` a OLO para que el horario exista en AWS.
