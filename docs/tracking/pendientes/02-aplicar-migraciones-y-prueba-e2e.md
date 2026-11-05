# 02 — Aplicar migraciones m06 / m07 y prueba de punta a punta

**Estado:** parcialmente hecho (2026-11-05). `m06` y `m07` **ya se aplicaron en la BD de desarrollo** (la de `.env.local`) y el detalle del viaje en `/tracking` funciona con ellas. Falta aplicarlas en los demás ambientes (los despliega Intelix) y la prueba de punta a punta con un recorrido simulado.

> **Convención de la BD:** en Aurora `tms_olo` las tablas reales se llaman `tbl_*` y los nombres antiguos (`routes`, `organizations`…) son **vistas**; no se puede poner una FK a una vista. `m06` y `m07` se reescribieron así: tabla `tbl_tracking_stop_visits` / `tbl_tracking_client_access`, FK a `tbl_*`, restricciones `pk_/fk_/ck_/idx_`, vista con el nombre antiguo y `grant` a `tms_app`. Las migraciones `m01`–`m05` del repo siguen con los nombres antiguos (la BD ya está renombrada por fuera del repo): conviene confirmar con Intelix cuál es el estado oficial de cada ambiente antes de aplicar en otro. Si un ambiente aún no tiene el renombre, `m06`/`m07` fallan en la FK a `tbl_organizations`.

## Verificado contra Aurora (2026-11-05, dentro de una transacción revertida: no quedó nada)
Con el viaje demo `VJ-DEMO-REC-20261102-W12`: `record_visits` leyó las 3 paradas, registró llegada a 60 m y salida a 400 m con **permanencia de 1500 s (25 min)** y `arrival_distance_m = 60`; reenviar el lote no duplicó (el `ON CONFLICT (guide_id)` funciona sobre la vista); `GUIDES_SQL` (web) devolvió `site_arrived_at` y `dwell_seconds` de esa parada; y `CLIENT_GUIDES_SQL`, con un vínculo de prueba en `tracking_client_access`, devolvió solo las paradas 2 y 3 del cliente destino (FERRETERIA VENECIA). Después del `ROLLBACK`, `tracking_stop_visits` y `tracking_client_access` quedaron con 0 filas.

## Prueba por el API con un chofer demo (2026-11-05, **sí persistió**)
`simular_recorrido.py` con el chofer demo `chofer.drv-eflow-12@demo.tms.local` (viaje `VJ-DEMO-REC-20261102-W12`) contra una instancia local del API móvil con el código nuevo: 4 lotes de 5 posiciones aceptados, el reenvío del último lote quedó como duplicado (idempotente) y la parada 3 registró **llegada con la hora de la posición** (14:31 UTC, a 0 m) sin salida. La pantalla `/tracking` mostró "En sitio desde las 08:31 (5 min)". **Quedaron en la BD** 100 posiciones nuevas de ese viaje demo y la visita abierta de la parada 3. Para limpiar: `scripts/limpiar-tracking-prueba.mjs` o borrar de `tbl_tracking_stop_visits` y `tbl_tracking_positions` por `route_id`.

> El servidor local del API móvil (`backend/mobile/local/serve.py`, puerto 4100) **carga el código al arrancar**: hay que reiniciarlo para que use `record_visits`. Lo mismo vale para `backend/local/serve.py` (puerto 4000, API web).

## Qué falta
1. Aplicar en los demás ambientes, en este orden y **antes** de desplegar el backend de tracking (en desarrollo ya están):
   - `backend/mobile/sql/m06_stop_visits.sql` (tabla `tracking_stop_visits`).
   - `backend/mobile/sql/m07_tracking_client_access.sql` (tabla `tracking_client_access`).

   Con `python scripts/migrate.py <archivo>` (dry-run por defecto; `--execute` aplica). Los despliega Intelix. Rollback en el encabezado de cada archivo.
2. Si el backend de tracking se despliega antes que `m06`, el detalle del viaje falla (`GUIDES_SQL` hace `LEFT JOIN tracking_stop_visits`).
3. `CLIENT_GUIDES_SQL` y `CLIENT_PLANNED_SQL` (`backend/tracking/src/tracking_sql.py`) **ya se ejecutaron contra Aurora** (consulta de solo lectura, sin errores). Falta verlas con datos: crear una fila en `tracking_client_access` para un usuario `Cliente` demo y abrir `/tracking` con ese usuario (escribe en la BD compartida: pedir confirmación).
4. Probar la **salida** de una parada por el API (la simulación termina dentro del radio): enviar después puntos a más de 200 m y comprobar `departed_at` y `dwell_seconds`; la lógica y el SQL ya están probados con datos reales dentro de una transacción revertida.
5. Abrir `/tracking` con un usuario `Cliente` real vinculado en `tracking_client_access` (persiste una fila en la BD compartida: pedir confirmación) y ver la tarjeta de su entrega.

## Notas
- Aurora solo está disponible de lunes a viernes, 5:00 a 17:00 (hora de Costa Rica).
- Las pruebas escriben filas reales: usar solo choferes demo.
- El muestreo del GPS es de 30 s en movimiento y 180 s detenido: la llegada puede tener hasta ~30 s de error.
