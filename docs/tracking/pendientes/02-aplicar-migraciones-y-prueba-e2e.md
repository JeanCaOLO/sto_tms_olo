# 02 — Aplicar migraciones m06 / m07 y prueba de punta a punta

**Estado:** parcialmente hecho (2026-11-05). `m06` y `m07` **ya se aplicaron en la BD de desarrollo** (la de `.env.local`) y el detalle del viaje en `/tracking` funciona con ellas. Falta aplicarlas en los demás ambientes (los despliega Intelix) y la prueba de punta a punta con un recorrido simulado.

> **Convención de la BD:** en Aurora `tms_olo` las tablas reales se llaman `tbl_*` y los nombres antiguos (`routes`, `organizations`…) son **vistas**; no se puede poner una FK a una vista. `m06` y `m07` se reescribieron así: tabla `tbl_tracking_stop_visits` / `tbl_tracking_client_access`, FK a `tbl_*`, restricciones `pk_/fk_/ck_/idx_`, vista con el nombre antiguo y `grant` a `tms_app`. Las migraciones `m01`–`m05` del repo siguen con los nombres antiguos (la BD ya está renombrada por fuera del repo): conviene confirmar con Intelix cuál es el estado oficial de cada ambiente antes de aplicar en otro. Si un ambiente aún no tiene el renombre, `m06`/`m07` fallan en la FK a `tbl_organizations`.

## Qué falta
1. Aplicar en los demás ambientes, en este orden y **antes** de desplegar el backend de tracking (en desarrollo ya están):
   - `backend/mobile/sql/m06_stop_visits.sql` (tabla `tracking_stop_visits`).
   - `backend/mobile/sql/m07_tracking_client_access.sql` (tabla `tracking_client_access`).

   Con `python scripts/migrate.py <archivo>` (dry-run por defecto; `--execute` aplica). Los despliega Intelix. Rollback en el encabezado de cada archivo.
2. Si el backend de tracking se despliega antes que `m06`, el detalle del viaje falla (`GUIDES_SQL` hace `LEFT JOIN tracking_stop_visits`).
3. `CLIENT_GUIDES_SQL` y `CLIENT_PLANNED_SQL` (`backend/tracking/src/tracking_sql.py`) **ya se ejecutaron contra Aurora** (consulta de solo lectura, sin errores). Falta verlas con datos: crear una fila en `tracking_client_access` para un usuario `Cliente` demo y abrir `/tracking` con ese usuario (escribe en la BD compartida: pedir confirmación).
4. Correr `backend/mobile/scripts/simular_recorrido.py` (la tabla de visitas hoy está vacía) con un chofer demo y comprobar que `tracking_stop_visits` queda con llegada, salida y permanencia coherentes, y que la pantalla las muestra.

## Notas
- Aurora solo está disponible de lunes a viernes, 5:00 a 17:00 (hora de Costa Rica).
- Las pruebas escriben filas reales: usar solo choferes demo.
- El muestreo del GPS es de 30 s en movimiento y 180 s detenido: la llegada puede tener hasta ~30 s de error.
