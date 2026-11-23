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
1. ~~Verificar contra QA real~~ **Hecho 2026-11-23**: todos los endpoints probados (`docs/wms-eflow/pruebas-api-eprac-qa.md`).
2. ~~GenerarAcciones deja `SOAC`~~ **Resuelto**: el monitor de eFlow lo pasa solo a `GENE` en ~2 min.
3. ~~El API no trae peso, volumen, líneas, coordenadas ni ruta~~ **No hacen falta** (Jean, 2026-11-23): el motor usa
   el tope de 16 paradas por camión (`motor_ruteo.MAX_PARADAS`).
4. **Número de viaje:** `AsignarNumeroViajeWMH` solo acepta viajes que ya existen en WMH (con `8213` funcionó; con
   los del TMS, `ERROR_PROCESAMIENTO`). Jean: "WMH desaparece". Si se confirma, quitar
   `plan_builder._enviar_viajes_a_eflow` (hoy solo deja un warning).
5. **Bajada:** el endpoint funciona en QA, pero `eflow_api.asignar_bajada` no la llama nadie. Cablearla donde el OMS
   asigna la bajada.
6. **Liberar dos veces:** `GenerarAcciones` sobre un pedido ya `GENE` responde OK y lo vuelve a `SOAC`. El reintento
   de `marcar_generada` (disparo_pendiente) debe leer la situación antes y no llamar si ya está en `SOAC`/`GENE`.
7. **Sin refresco de "salientes" en `qa`**: no hay lectura por llave (pedida a ePRAC, A2).
