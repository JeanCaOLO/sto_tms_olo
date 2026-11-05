# 08 — Mejoras posibles (planes, sin decidir)

**Estado:** ideas, no comprometidas.

- **ETA más realista:** hoy es línea recta × 1,35 a 30 km/h (`logic.stop_metrics`). Se puede usar OSRM (ya se usa en `route-osrm.ts`) o un proveedor con tráfico (ver `docs/tracking/alternativas-mapas.md`).
- **Eventos de geocerca:** registrar `stop_arrived` / `stop_departed` en `tracking_events` además de `tracking_stop_visits`, si se quiere auditoría o disparadores. No mezclar con el `geofence_out` actual (entrega fuera del radio).
- **Cierre de visita abierta:** hoy una visita abierta se cierra con la primera posición posterior fuera de 200 m (con gracia de 2 h tras cerrar el viaje). Evaluar cerrarla con la última posición dentro del radio si el celular se apaga.
- **Umbrales configurables:** `GEOFENCE_M` (150), `VISIT_EXIT_M` (200) y `MIN_VISIT_SECONDS` (60) están en `backend/mobile/src/mobile_api/logic.py`; podrían ser por compañía.
- **Reporte de permanencias:** promedio de tiempo en parada por punto, cliente o chofer (sale de `tracking_stop_visits`).
- **Vista del cliente:** historial de entregas pasadas, varias entregas del mismo viaje agrupadas, y "ver como Cliente" para administradores.
- **Notificaciones push** a la app del chofer o al cliente, además del correo.
