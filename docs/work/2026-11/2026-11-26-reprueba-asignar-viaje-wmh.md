# 2026-11-26 — Nueva prueba de `AsignarNumeroViajeWMH` en QA

## Qué cambió

- Se volvió a probar `AsignarNumeroViajeWMH` en eFlow QA, solo por el API.
- El resultado se agregó a `docs/wms-eflow/pruebas-api-eprac-qa.md`, en la sección 6.

## Por qué

Jean preguntó cómo iban las pruebas si se deja de lado la asignación de viaje. Antes de responderle había que confirmar si ePRAC ya había corregido el endpoint.

## Cómo

Se usó `tms_common.eflow_api.asignar_viaje` con `EFLOW_API_MODE=qa` y `EFLOW_API_WRITE=on`.

- `VAS001031-M` (en GENE) con los viajes nuevos `202611260109017` y `900018`: ❌ `ERROR_PROCESAMIENTO`.
- `5600001759-002` (EPA, en DISP/DISP, sin viaje) con el viaje nuevo `202611260109017`: ❌ `ERROR_PROCESAMIENTO`.
- El mismo pedido con el viaje existente `8213`: ✅.

Conclusión: el endpoint sigue sin crear viajes y solo asigna los que ya existen en WMH. El estado del pedido no influye.

## Conocimiento promovido

Ninguno nuevo. Confirma lo que ya estaba registrado el 23-nov.

## Pendientes

- `5600001759-002` quedó en QA con el viaje `8213`. El API no permite quitarlo, así que si molesta hay que pedírselo a ePRAC.
- Sigue abierta la pregunta a ePRAC: ¿hay que seguir enviando el número de viaje? Es el punto B1 de `docs/wms-eflow/solicitud-eprac-api-v1-faltantes.md`.
