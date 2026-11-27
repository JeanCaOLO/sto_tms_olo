# TMS-QA-007: contrato de inicio de viaje

Prioridad P1. Reproducción del probador el 27/11/2026. SQLSTATE 42703: `column a.route_id does not exist`.

## Contrato comprobado

- `public.tbl_return_collection_assignments` contiene id, allocation_id, request_item_id, attempt_id, quantity, event_id y created_at. No tiene route_id.
- `public.vw_return_collection_assignments` expone esos campos y request_id, plan_trip_id, plan_stop_id, route_id, dispatch_guide_id y allocation_state desde allocations.
- `mobile_api.sql.UNFINISHED_ROUTE_SQL` consulta la tabla física y usa una columna que solo expone la vista. `mobile_api.start.start_trip` ejecuta esa consulta antes de insertar ruta/guías.

Fragmento defectuoso vigente:

```sql
OR EXISTS(SELECT 1 FROM tbl_return_collection_assignments a
  JOIN tbl_return_collection_results cr ON cr.attempt_id=a.attempt_id
  WHERE a.route_id=r.id AND cr.quantity>0 AND cr.delivered_event_id IS NULL)
```

## Reproducción segura independiente

Ejecutar la constante original `UNFINISHED_ROUTE_SQL` con parámetros de organización y chofer UUID cero y la lista actual `logic.ACTIVE_STATUS_SQL_VALUES`, dentro de una transacción `SET TRANSACTION READ ONLY`. No invocar el endpoint de inicio contra datos reales. El probe del probador hizo exactamente eso y guardó el error 42703 y las columnas en `.test/pruebasGenerales/qa-v2-start-contract-probe.json`, salida 1.

El mismo fallo ocurrió en PostgreSQL/PostGIS local después de crear una solicitud completa y asignarla mediante `recolectas.agendar`. Pasaron fixtures, creación/replay, snapshot completo y asignación V2. El viaje todavía no se pudo iniciar. El contenedor local del probador es exclusivo y no contiene registros reales; no operarlo desde otra sesión.

## Entrega al corrector

Reclamar este ID en ESTADO_AGENTE antes de editar. Corregir en el backend móvil, manteniendo la condición que bloquea otro viaje mientras hay mercancía recogida sin entregar. Revisar consultas hermanas para detectar el mismo contrato roto. No duplicar route_id en la tabla mediante migración para adaptar el esquema a una consulta obsoleta.

Entregar un artefacto reproducible en QA_CAMBIOS con el diff y base de código identificables, y la prueba de regresión/ejecución. El código fuera de esta carpeta no tiene autorización de push. El probador extraerá el artefacto para aplicarlo localmente y repetir el flujo. No declarar cerrado por un test de fake_db que no valida columnas reales.

Retest mínimo: SELECT con esquema PostgreSQL vigente; inicio sin recolecta; inicio con recolecta asignada; viaje anterior con mercancía pendiente bloquea; replay del mismo inicio no duplica; luego continuar recogida, entrega al almacén y recepción V2.
