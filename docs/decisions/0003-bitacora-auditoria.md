# 0003 — Bitácora de auditoría: triggers de BD + actor por request

- **Status**: Accepted
- **Date**: 2026-09-24
- **Owner role**: system-architect
- **Affects**: Aurora `tms_olo` (esquema `audit`, `sql/16`), `backend/common-services/layers/tms_common` (`audit.py`, `handler.py`, `pg.py`), `backend/auth`, `backend/admin`, scripts de `backend/local` y `scripts/run-migration.mjs`

## Context

El usuario pidió (2026-09-24) registrar, para control y auditoría, **cada acción que un usuario hace en el sistema y también lo que el sistema hace de forma automática**, con fecha y hora. Hoy las escrituras entran por varios caminos: la API genérica (`/api/data/{table}`), endpoints atómicos (`/api/v1/delivery-points`, `/api/v1/admin/*`), scripts de ingesta (`backend/local/*`), migraciones (`sql/NN`) y, además, **otras ramas del equipo escriben en la misma Aurora** (ver memoria `aurora-compartida-migraciones`). Hay acciones que no tocan filas: login, logout, exportar, abrir un módulo.

## Decision

Dos caminos complementarios que escriben en una sola tabla `audit.events`:

1. **Cambios de filas → trigger de BD.** Un trigger `AFTER INSERT/UPDATE/DELETE FOR EACH ROW` (`audit.capture_row_change()`) en cada tabla registrada en `audit.tracked_tables` (42 hoy). Guarda el `after` en altas, el `before` en bajas y solo las columnas que cambiaron (`changes: {col: [antes, después]}`) en ediciones. Ignora ediciones que no cambian nada relevante (solo `updated_at`). Las columnas sensibles (`auth_credentials.password_hash`) se registran como `[oculto]`: se sabe que cambió, no su valor.
2. **Quién lo hizo → actor por request.** `tms_handler` fija `tms.audit_actor` (JSON: usuario, email, request id, IP, user agent, `Lambda + ruta`) en la conexión antes de cada ruta que escribe (POST/PATCH/PUT/DELETE) y lo limpia al terminar, también si falla. El trigger lo lee y resuelve `app_user_id` y rol. **Sin actor = `system`**, con el `application_name` como origen (`tms-api`, `run-migration <archivo>`, `ingest_delivery_points <cliente>`, o el usuario de BD si es otra rama).
3. **Eventos que no son filas → `audit.record`.** Login (`login`, `login_failed`, `login_blocked`), `logout`, y las acciones del navegador (`view`, `export`, `print`, `download`) vía `POST /api/v1/audit/events`.

`audit.events` es **de solo inserción**: un trigger rechaza `UPDATE`, `DELETE` y `TRUNCATE`. Se consulta con `GET /api/v1/admin/audit` (filtros por fecha, usuario, acción, módulo, tabla, entidad; paginación por cursor `before_id`) y `GET /api/v1/admin/audit/{id}` (detalle con antes/después), exigiendo `auditoria.view` de la matriz de permisos (`sql/15`).

## Considered alternatives

- **Solo logging en el backend (sin triggers)**: rechazado. No ve lo que escriben scripts, migraciones ni otras ramas, y cada endpoint nuevo tendría que acordarse de registrar: la auditoría quedaría incompleta por diseño.
- **Solo triggers (sin actor)**: rechazado. Todo quedaría como "usuario de BD `olo_db`" porque la API usa un único usuario de BD; no sabríamos qué persona hizo el cambio.
- **CloudWatch Logs / CloudTrail**: rechazado como fuente principal. No da antes/después por fila, no se consulta desde la app y CloudTrail no ve SQL. Sigue sirviendo para diagnóstico técnico.
- **Extensión `pgaudit`**: rechazado. Registra sentencias SQL en logs del motor, no eventos de negocio consultables, y requiere cambiar el parameter group de Aurora (Intelix).

## Consequences

- **Positive**: ninguna escritura se escapa, venga de donde venga; la persona queda identificada cuando la acción viene de la app; lo automático queda marcado como `system` con su origen; la bitácora no se puede alterar desde la aplicación.
- **Negative**: una fila extra de auditoría por fila escrita (una ingesta de 1576 puntos = 1576 eventos) y dos consultas extra (`set_config`) por request que escribe.
- **Neutral**: una tabla nueva **no se audita sola**: hay que registrarla en `audit.tracked_tables` y volver a correr el bloque que crea los triggers (está al final de `sql/16`).

## Migration notes

- Las lecturas (GET) no se registran como filas. "Abrir un módulo" lo registra el frontend con `POST /api/v1/audit/events` (`action: view`).
- Las escrituras que pasan por el Express legado (`server/`) quedan como `system` (no fija actor). Motivo más para retirarlo.
- Los scripts nuevos que escriban en Aurora deben fijar su origen: `SELECT set_config('tms.audit_actor', '{"type":"system","source":"<script>"}', false)`.

## Retención y rendimiento (sql/17, 2026-09-24)

Decisión del usuario: **la bitácora crece sin límite (no se borra nada), con acceso rápido a por lo menos los últimos 3 meses.**

- `audit.events` está **particionada por mes** (`audit.events_YYYY_MM`, rango sobre `occurred_at`). Una consulta con rango de fechas solo lee esos meses, y cada mes tiene sus propios índices chicos.
- `GET /api/v1/admin/audit` **sin `from` mira los últimos 3 meses**; para ir más atrás hay que pedir `from` (sigue todo disponible, solo lee más particiones).
- Particiones creadas hasta 2027-12. `audit.ensure_partitions(meses)` crea las que falten; la Lambda `AuditMaintenanceFunction` (stack `admin`) la corre el día 1 de cada mes. Si no corriera, nada se pierde: las filas caen en `audit.events_default`.
- Si algún día el volumen lo pide, los meses viejos se pueden **desadjuntar y archivar** (`DETACH PARTITION`, p. ej. a S3) sin tocar los recientes. Hoy no se archiva nada.

## Rol de la aplicación (sql/18, 2026-09-24)

La app debe conectarse como **`tms_app`**, no como el dueño `olo_db`: `tms_app` lee y escribe datos en `public` (también en tablas futuras), en `audit.events` solo puede **leer e insertar**, no es dueño de nada (no puede hacer DDL ni deshabilitar triggers) y ejecuta `audit.ensure_partitions` (SECURITY DEFINER). Las migraciones siguen con el dueño (`TMS_DB_ADMIN_*` en `.env.local`, que `scripts/run-migration.mjs` usa si existen).

**Activado (2026-09-24):** `backend/local/activar_rol_tms_app.py` generó la contraseña, la guardó en Secrets Manager (`/dev/tms/db-app`, us-east-2), se la asignó a `tms_app` y dejó `.env.local` con `TMS_DB_USER=tms_app` y `TMS_DB_ADMIN_*` = dueño. Verificado: `tms_app` lee/escribe y queda auditado, y no puede `ALTER`/`TRUNCATE`/`DELETE` sobre `audit.events` ni crear tablas. Re-correr el script rota la contraseña. Al desplegar, el secreto `/<env>/tms/db` de `backend/secrets` debe llevar esta credencial (`username: tms_app`), no la del dueño.

## Open coordination points

- **Privilegios**: resuelto y activo con `tms_app` (sql/18). Falta que Intelix, al desplegar, cargue esa credencial en `/<env>/tms/db`.
