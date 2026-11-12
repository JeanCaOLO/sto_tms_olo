# 01 — Replan programado sin credenciales de eFlow

**Estado:** pendiente por implementar

## Decisión (2026-11-10)

La cuenta del sandbox no es de Intelix: **no** se cargan credenciales en `/dev/tms/eflow`. La bandeja
se actualiza con un Scheduler propio cada 10 min (`ingesta_bandeja`), separado del replan horario
(que ya no ingesta). En el despliegue esa corrida **falla a propósito** y queda en el historial en
rojo; la ingesta real se corre desde una PC con `python backend/local/ingesta_bandeja.py`.

## Qué falta

El replan programado (`dev-tms-planning-replan-horario`, cada hora L-V 05:00–16:00 CR) corre, pero
**nunca ingesta de eFlow**: el secreto `/dev/tms/eflow` tiene `cr` y `ve` vacíos, así que
`tms_common.config.eflow_config` lanza "Sin credenciales EFLOW" en cada corrida (57 de 57 desde el
2026-11-03). El error se traga: el log solo dice "ingest eFlow no disponible".

## Por qué

Sin ingesta, la bandeja no recibe pedidos nuevos ni se entera de lo que eFlow despachó o cerró; solo
se actualiza cuando alguien corre la ingesta desde su máquina.

## Cómo hacerlo

1. Cargar `cr` en el secreto `/dev/tms/eflow` (host, port, user, password; `db_wmh`/`db_sap` tienen
   default). Lo hace quien administra secretos (Intelix); los valores son los mismos de la ingesta
   local.
2. Verificar red: la Lambda de planificación está en VPC; si eFlow no es alcanzable desde esas
   subnets, hace falta salida (NAT) o que eFlow permita esas IPs.
3. En `replan.replanificar_programado` y `app.replan_todo`/`build_plan`, loguear la excepción
   (`logging.exception`) en vez del warning sin detalle.
4. Si se pide cada 15 min: `ScheduleExpression` en `backend/planning/template.yaml`.
