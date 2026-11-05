# 02 — Aplicar migraciones m06 / m07 y prueba de punta a punta

**Estado:** pendiente por verificar. Todo se probó con una BD simulada (fakes); ningún SQL nuevo se ejecutó contra Aurora.

## Qué falta
1. Aplicar, en este orden y **antes** de desplegar el backend de tracking:
   - `backend/mobile/sql/m06_stop_visits.sql` (tabla `tracking_stop_visits`).
   - `backend/mobile/sql/m07_tracking_client_access.sql` (tabla `tracking_client_access`).

   Con `python scripts/migrate.py <archivo>` (dry-run por defecto; `--execute` aplica). Los despliega Intelix. Rollback en el encabezado de cada archivo.
2. Si el backend de tracking se despliega antes que `m06`, el detalle del viaje falla (`GUIDES_SQL` hace `LEFT JOIN tracking_stop_visits`).
3. Revisar contra datos reales la consulta `CLIENT_GUIDES_SQL` (`backend/tracking/src/tracking_sql.py`).
4. Correr `backend/mobile/scripts/simular_recorrido.py` con un chofer demo y comprobar que `tracking_stop_visits` queda con llegada, salida y permanencia coherentes, y que la pantalla las muestra.

## Notas
- Aurora solo está disponible de lunes a viernes, 5:00 a 17:00 (hora de Costa Rica).
- Las pruebas escriben filas reales: usar solo choferes demo.
- El muestreo del GPS es de 30 s en movimiento y 180 s detenido: la llegada puede tener hasta ~30 s de error.
