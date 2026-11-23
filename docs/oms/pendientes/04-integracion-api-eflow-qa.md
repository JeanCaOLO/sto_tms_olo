# 04 — Integración con el API REST de eFlow QA

**Estado:** implementada; **verificada contra QA el 2026-11-23** (ciclo completo con `VAS001031-M`, ver
`docs/wms-eflow/pruebas-api-eprac-qa.md`). Queda **pendiente por implementar** el número de viaje (punto 2b).

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
1. ~~Verificar contra QA real~~ **Hecho 2026-11-23**: lectura, prioridad (incl. 0) y GenerarAcciones funcionan.
2. ~~GenerarAcciones deja `SOAC`~~ **Resuelto**: el monitor de eFlow lo pasa solo a `GENE` en ~2 min.
2b. **`AsignarNumeroViajeWMH` falla** (`ERROR_PROCESAMIENTO`, también con un número chico): el viaje parece tener
    que existir antes en WMH. Jean dijo "WMH desaparece": confirmar si se deja de enviar; si es así, quitar
    `plan_builder._enviar_viajes_a_eflow` (hoy solo deja un warning en el log).
3. **El API no trae peso, volumen, líneas, dirección, coordenadas ni ruta.** Jean (2026-11-23): no hacen falta para
   planificar; el motor usa el tope de 16 paradas por camión (`motor_ruteo.MAX_PARADAS`). Sin coordenadas, el orden
   de paradas y la zona no se calculan bien: revisar cuando haya más pedidos de QA.
4. **Sin refresco de "salientes" ni líneas (`order_items`) en `qa`**: no hay lectura por llave. Pendiente de endpoint.
5. **Bajada**: `eflow_api.asignar_bajada` existe pero nadie la llama aún; no se probó contra QA.
6. Reintento de `marcar_generada` (disparo_pendiente) vuelve a llamar GenerarAcciones: podría duplicar acciones si el primer intento sí pasó.
