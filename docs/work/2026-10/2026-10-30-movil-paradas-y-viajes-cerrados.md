# Backend móvil · paradas que no se ocultan y viajes cerrados por Planificación

Fecha: 2026-10-30. Continuación de `2026-10-30-tracking-paradas-no-visibles-y-rendimiento.md`: se revisó `backend/mobile` por el mismo patrón de `JOIN` interno y por la regla de cierre de viaje que ya usa Tracking.

## 1. `LEFT JOIN` en `mi-viaje`
- **Problema.** `GUIDES_BY_ROUTES_SQL` (`JOIN orders`) y `MY_ROUTES_SQL` (`JOIN stores`) descartaban guías sin pedido y viajes sin tienda de origen. El chofer veía menos paradas que la barra del TMS.
- **Arreglo.** Ambos pasan a `LEFT JOIN`. El código ya tolera nulos: `origin_coords` cae a la sede del cliente o del país, y los campos del pedido salen `null`.
- **Datos reales.** Hoy no hay casos (las 5 guías de la BD tienen pedido); el cambio es defensivo.
- **Se dejó igual.** `MY_PLANNED_STOPS_SQL` conserva `JOIN orders`: en viajes planificados el id de la parada es `orders.id`, y sin pedido no habría id con que operarla.

## 2. Viajes cerrados por Planificación
- **Problema.** Tracking trata `plan_trips.status IN ('completed','cancelled')` como viaje cerrado (`OPEN_IN_PLAN`), pero el backend móvil solo miraba `routes.status`. Si Planificación cerraba el viaje y `routes` seguía "En tránsito": (a) `mi-viaje` lo seguía mostrando activo; (b) `UNFINISHED_ROUTE_SQL` lo contaba como viaje con paradas pendientes y el chofer recibía `trip_in_progress` al intentar iniciar el siguiente.
- **Arreglo.** `MY_ROUTES_SQL` y `UNFINISHED_ROUTE_SQL` excluyen viajes con `pt.status IN ('completed','cancelled')` (este último con `LEFT JOIN plan_trips`). Viajes sin `plan_trip_id` no cambian.

## Pruebas
`backend/mobile/tests`: 135 pasan, 24 omitidas. Nuevas: `test_mi_viaje_keeps_guides_and_trips_whose_order_or_store_is_missing` y `test_mi_viaje_and_unfinished_check_ignore_trips_closed_by_planning`; se ajustaron los matchers de SQL de `test_driver_api.py` y `test_start_trip.py`.

## Sin migración
Solo consultas de lectura; no hay cambios de esquema ni de índices.
