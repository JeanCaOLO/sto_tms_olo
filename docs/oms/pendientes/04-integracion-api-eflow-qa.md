# 04 — Integración con el API REST de eFlow QA

**Estado:** implementada 2026-11-19 (local); **pendiente por verificar** contra el API real (el host no respondía).

## Qué hay
- Flag **`EFLOW_API_MODE`** (`.env.local`): `mock` (default, comportamiento anterior) | `qa`.
  `EFLOW_API_WRITE=off` en modo `qa` = solo lectura (las escrituras se registran en el log y no se envían).
- Cliente: `backend/common-services/layers/tms_common/tms_common/eflow_api.py` (JWT con caché, paginación, lotes de 100).
- Lectura: `ingest_orders._eflow_api_disp_disp` (ObtenerExpediciones DISP/DISP, ventana `EFLOW_API_DIAS_ATRAS/ADELANTE`).
- OMS: `handoff_pedidos.EflowApiWriter` — `actualizar_prioridad` → CambiarPrioridadExpedicion;
  `marcar_generada` → CambiarPrioridadExpedicion + GenerarAcciones.
- Planificación: `plan_builder._enviar_viajes_a_eflow` → AsignarNumeroViajeWMH tras confirmar el plan (best-effort).
- Tests: `backend/tests/test_eflow_api.py` (servidor falso con el contrato del PDF).

## Qué falta / dudas
1. **Verificar contra QA real**: `10.17.224.20:87` rechazaba la conexión el 2026-11-19 (ping ok, puerto 87 cerrado). Revisar VPN/puerto.
2. **GenerarAcciones deja la situación en `SOAC`, no `GENE`.** Hoy el OMS marca `GENE` local en `orders.wms_situation`. Confirmar con ePRAC que GenerarAcciones es el equivalente de "generada" para disparar el picking.
3. **El API no trae peso, volumen, líneas, dirección, coordenadas ni ruta.** En `qa` se conservan los de pedidos ya cargados (COALESCE); los nuevos quedan sin peso/coords y Planificación no los podrá rutear bien. Pedir a ePRAC esos campos (o un endpoint de detalle).
4. **Sin refresco de "salientes" ni líneas (`order_items`) en `qa`**: no hay lectura por llave. Pendiente de endpoint.
5. **Bajada**: `eflow_api.asignar_bajada` existe pero nadie la llama aún.
6. Reintento de `marcar_generada` (disparo_pendiente) vuelve a llamar GenerarAcciones: podría duplicar acciones si el primer intento sí pasó.
