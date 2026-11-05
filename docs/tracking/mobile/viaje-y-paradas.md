# Tracking móvil — viaje y paradas

## Qué ve el chofer (`GET /mi-viaje`)

Un **solo** viaje a la vez (`trips._current`): el primero del día con paradas por entregar; los siguientes quedan ocultos hasta terminar el actual. Con todo hecho se muestra el resumen del último terminado.

- Si tiene un viaje **en tránsito** (sin importar la fecha en que se asignó): `kind: "route"`.
- Si no, el **plan confirmado de hoy**: `kind: "planned"`, listo para iniciar.

`phase` = `en_ruta` si ya salió de la sede (hay paradas hechas o posición a > 300 m) o `por_salir`.

## Iniciar el viaje (`POST /viajes/{id}/iniciar`)

Lo hace **el chofer** desde la app (no solo Planificación). Crea `routes` (estado `En tránsito`, número `VJ-AAAAMMDD-<id8>`), una `dispatch_guides` por parada en orden, el evento `route_started` y las horas planificadas medidas desde ahora (`logic.plan_schedule`). Es idempotente y a prueba de doble toque (índice único `uidx_routes_plan_trip`).

Condiciones (409 si no se cumplen): transportista asignado (`no_carrier`), ningún otro viaje sin terminar (`trip_in_progress`), plan `confirmed`, viaje `pending`, con paradas y con tienda de origen del país. Un plan de otro conductor/organización es 404.

Sin coordenadas de sede no hay horas planificadas (así no hay falso retraso).

## Estados de la parada

`pending` → `delivered` | `failed`. El chofer **no** deshace: `to=pending` devuelve 403 `revert_not_allowed`; solo la web de administración revierte.

## Transición (`POST /paradas/{id}/transicion`)

Orden de validación (`stops.transition_stop`):

1. `to` ∈ {`delivered`, `failed`}; `type` ∈ {`delivery`, `collection`}; `reason_code` válido.
2. `failed` exige `reason`. `reason_code="otro"` exige texto.
3. Parada **del conductor** (si no, 404). Viaje en tránsito (si no, 409; reenvío de la última parada ya registrada es 200).
4. **Geocerca** (`GEOFENCE_M = 150`): «Entregado» sin `lat`/`lng` → 400 `location_required`. Si la parada tiene coordenadas y el dispositivo está a > 150 m, exige motivo → 400 `outside_geofence`. Con motivo, el texto queda `«<motivo predefinido>: <texto>»` y se escribe además el evento `geofence_out` (el mismo que escribe la web).
5. **Evidencia requerida** (`logic.REQUIRED_EVIDENCE`, decidida por el servidor según `dispatch_guides.stop_type`):

   | Tipo | Exige |
   |---|---|
   | `delivery` | `photo_invoice` + `signature` |
   | `collection` | `photo_product` + `signature` |

   Falta alguna → 400 `evidence_required`. Solo se exige al **entregar**, no al marcar fallida.

Todo en **una transacción**: actualiza la guía, cierra la visita (`COMPLETE_VISIT_SQL`, separa «tiempo en sitio» de «tiempo hasta cerrar»), cuenta hechas/pendientes, actualiza `completed_stops` y registra `delivery_completed` o `delivery_failed` (idempotente por `client_id`).

### Cierre automático

Al registrar la última parada (entregada **o** fallida) con 0 pendientes, el viaje se cierra solo: `routes` pasa a completado, `plan_trip` se cierra y se escribe `route_completed` («Viaje cerrado automáticamente al registrar la última parada»). Pasa a Liquidaciones. La respuesta trae `route_closed:true`.

> Esto contradice [`../contrato-api-v2.md`](../contrato-api-v2.md) (74-82), que dice que Tracking no termina viajes; ver [pendientes/01](./pendientes/01-contratos-y-docs-desactualizados.md).

## Paradas de recolecta (`collection`)

Es una parada que Planificación asignó así (`dispatch_guides.stop_type = 'collection'`, migración `m05`): buscar mercancía ya entregada. No es la devolución inmediata en sitio. Cambia las evidencias que se exigen (producto en vez de factura). **La transición de recolecta no está probada en el sandbox** (`TRACKING_TMS/PENDIENTES_BACKEND.md`).

## Novedades (`POST /paradas/{id}/novedades`)

`kind` = `incident` (evento con estado `warning`) o `pickup` (`info`), con descripción obligatoria y `client_id` opcional. Solo con el viaje en tránsito.

## Artículos de la parada (`GET /paradas/{id}/articulos`)

Líneas del pedido para elegir qué se devuelve ([evidencias-y-devoluciones.md](./evidencias-y-devoluciones.md)).

## ETA y retraso por parada

`distance_m`, `eta_at`, `delay_min` por parada pendiente y `delay_min` del viaje (el de la siguiente parada); ver [gps-y-ubicacion.md](./gps-y-ubicacion.md).

## Pantallas implicadas

| Pantalla | Archivo | Qué hace |
|---|---|---|
| Agenda / viaje | `src/app/index.tsx` | Lista de paradas, iniciar viaje, aviso de llegada. |
| Parada | `src/app/parada/[id].tsx` | Entregar / no entregar, evidencias, novedad, devolución. |
| Firma | `src/app/firma.tsx` + `components/signature-pad*.tsx` | Captura de firma. |
| Devolución | `src/components/return-button.tsx`, `lib/return-form.ts` | Formulario contracamión. |
