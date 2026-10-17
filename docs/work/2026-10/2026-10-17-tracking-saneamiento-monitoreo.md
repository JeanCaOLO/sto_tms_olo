# Tracking · Saneamiento: solo monitoreo, modo API + mock, KISS

Fecha: 2026-10-17. Base: auditoría del módulo con `.test/blueprint/mobile-tracking-tms` (fuente que manda: "la web solo monitorea"), `.test/tracking_nuevo/` y el flujo del TMS (Planificación FR7 es dueña de crear/asignar/cancelar/completar).

## Decisiones
- **Tracking solo monitorea.** Fuera de la web: Completar viaje, Marcar revisado, chip/semáforo "Por revisar", reprogramar/reasignar/cancelar (se revirtió lo agregado en la sesión anterior), "Detalle avanzado" (eventos) y enlaces Maps/Waze.
- **Evidencias = foto de la factura firmada + firma digital.** Se retiraron novedades, recolectas, devoluciones y `photo_other` (front, back, demo y contrato móvil).
- **KPIs por viaje** (5): En ruta, A tiempo, Retrasados, Sin señal, Completados hoy. Clic = filtra lista y mapa.
- **Modo API siempre; mock con backend simulado** (patrón del tarifador): `api.ts` habla el contrato real; con `VITE_MOCK_AUTH=true` en DEV, `mock/installTrackingMock.ts` cambia el transporte por `mock/fakeTrackingBackend.ts` (mismo sobre `{data}/{error}` y códigos). Solo en mock se ven simulación e "Iniciar viaje (pruebas)". No entra en un build desplegado.
- **Mapa**: ruta por calles con OSRM (sede → paradas en secuencia; tramos hechos sólidos, pendientes punteados), sin líneas rectas de respaldo; paradas grandes (✓ / ✕ / número, anillo en la siguiente) y sede. El rastro GPS solo en el replay.

## Contrato v2 (`/api/v1/tracking`)
- `GET /viajes?activos=1&q=&limit=&cursor=&pais=CR&include=summary` → `{items, next_cursor, summary?}`. `pais` se intersecta con los países del rol. `summary` = `{active, on_time, late, no_signal, completed_today}` (hoy en la zona del país). Viaje trae `country` y `timezone`; sin `review`, `incidents`, `status_raw`, `carrier_name`, etc.
- `GET /viajes/{id}` → viaje + `origin`, `next_stop_id` (siguiente por secuencia), `departed_at` (columna), `stops` con solo `photo_invoice`/`signature`. Sin `events` ni `trail`.
- `GET /viajes/{id}/recorrido` (nuevo, bajo demanda para el replay): rastro completo, sin puntos mock/imprecisos, Douglas-Peucker 15 m, tope 2000.
- `GET /planificados?pais=` y `POST /viajes/{id}/iniciar`: sin cambio de forma (la web solo los usa en mock).
- Retirados: `POST /paradas/{id}/novedades`, `POST /paradas/{id}/devoluciones`. `/resumen` queda deprecado (devuelve la forma nueva).

## Rendimiento, costo y robustez
- Por tick: de 3 Lambdas (lista + resumen + detalle) a 2 (lista con KPIs + detalle solo con panel abierto); intervalo de 10 s a 15 s. Detalle sin 200 eventos, 100 puntos de rastro ni el escaneo `FIRST_POSITIONS`.
- URLs firmadas estables (caché por llave S3, TTL 1 h, se re-firma con < 10 min): el navegador reutiliza las fotos en vez de bajarlas cada refresco.
- Gzip en las respuestas del stack tracking (> 1 KB y `Accept-Encoding: gzip`); `serve.py` lo decodifica en local.
- Polling: una consulta en vuelo (no se acumulan ni se descartan todas), timeout 15 s con abort, backoff x2 hasta 60 s, limpia el dato al cambiar de viaje.
- Ingesta sin perder datos: acepta posiciones hasta 2 h después de cerrar el viaje (se guardan, no mueven la última posición); inserción + última posición en una transacción con upsert por lote; puntos `is_mock` o con precisión > 200 m se guardan marcados y no mueven el camión; fija `routes.departed_at` una vez.
- Una sola regla de alertas (backend): `late` contra la siguiente parada por secuencia (igual en lista y detalle), `stopped` también en la lista (ventana de 60 min por lote), `no_signal` solo si hubo señal y caducó. El front ya no tiene umbrales propios.
- `iniciar` concurrente devuelve `created:false` en vez de 500.
- `sql/44_tracking_rendimiento.sql` (NO aplicada): `routes.departed_at`, índice `lower(status)`, índice de orden/cursor, trigramas `pg_trgm` para la búsqueda, `tracking_events(route_id, event_time desc)`.

## Bugs de frontend corregidos
Panel con el detalle del viaje anterior; `GET /viajes/null` al refrescar sin selección; país ignorado en API; íconos Leaflet recreados en cada render (y 20/s en el replay); replay que saltaba con el poll; mapa sin reencuadrar al deseleccionar/filtrar y capas recortadas al abrir el panel (`invalidateSize`); umbrales duplicados; dos criterios de "siguiente parada"; "hace X" congelado si falla el poll (+ aviso de datos desactualizados); horas en la zona del navegador (ahora la del país); errores del backend en español con la UI en inglés (ahora claves i18n por código); `simPlanned` rompía con país; tiles configurables (`VITE_MAP_TILES_URL`).

## Desvíos respecto al plan
- La geometría OSRM no se movió a `src/lib/geo`: Tracking tiene su propio `route-osrm.ts` (sin respaldo recto) y reutiliza `OSRM_BASE_URL` de Planificación, para no tocar ese módulo.
- "Cargar más" amplía el `limit` del poll (máx. 100) en vez de paginar con cursor: así todos los camiones visibles siguen actualizándose. El cursor sigue disponible en el contrato.
- En mock, el viaje se cierra solo al entregar la última parada (en real lo reporta la app / Planificación).

## Verificación
- Front: `tsc` sin errores en tracking, ESLint limpio, `vitest run src/pages/tracking src/pages/planificacion` 112 pasan (tracking 41).
- Back: `pytest backend/tests/test_tracking.py` 97 pasan; suite sin `test_realtime` 385 pasan + 10 errores preexistentes (boto3/mailer).
- Navegador (mock, Playwright): lista, KPIs, detalle, evidencias, ruta OSRM, replay y filtro por KPI sin errores de página.

## Pendientes
Detalle y pasos para cada uno en `docs/tracking/pendientes-tunel.md` (lo que requiere túnel/AWS) y `docs/tracking/README.md`.

1. Aplicar `sql/44` (requiere privilegio para `create extension pg_trgm`) — con el túnel: dry-run y `--execute`.
2. Desplegar el stack `tracking` (Intelix) y probar contra Aurora/API Gateway: gzip, URLs firmadas y `serve.py` solo probados con fakes.
3. App móvil: el contrato cambió (sin novedades/devoluciones/`photo_other`); ver `.test/blueprint/mobile-tracking-tms/01` y `04`.
4. OSRM y tiles propios para producción (`VITE_OSRM_URL`, `VITE_MAP_TILES_URL`); los públicos no tienen SLA.
5. Decidir si `POST /completar` y `/revisar` siguen en el backend (la web ya no los usa).
6. Retención/partición de `tracking_positions` y caché de permisos en `tms_common` (propuestas, sin hacer).

## Continuación (mismo día): mock más fiel y documentación de pendientes
- Mock: los camiones siguen las calles (OSRM, peticiones en cola de a una; si OSRM falla, línea recta) y el tramo ya recorrido de cada escenario se rehace por calles, así el replay no muestra rectas. Nuevo escenario VJ-DEMO-CR-07 (por salir sin GPS: señal `none`, sin alerta). El backend simulado valida `pais` (400) y manda KPIs solo en la primera página, como el real.
- Replay: encuadra el recorrido al cargar; trazos más visibles.
- Scripts para cuando haya túnel: `scripts/tracking-contract-check.mjs` (verifica el contrato v2 contra el backend real y mide tiempos/tamaños) y `scripts/simular-posiciones.mjs --por-calles` (usa la sede del viaje y OSRM).
- `GET /planificados` del backend ahora filtra por `pais` (el mock ya lo hacía).
- Hallazgo: `npm run api:local` (`backend-planif/serve.py`) no sirve el stack `tracking`; con túnel usar `npm run api:local:base`.
- Documentación del módulo en `docs/tracking/` (README, contrato v2, modo mock, pendientes con túnel paso a paso).
- Eliminados `POST /viajes/{id}/completar` y `/revisar` (backend, template, tests; documentados en `docs/tracking/contrato-api-v2.md`). Para que los viajes no queden "En tránsito" para siempre, `POST /paradas/{id}/transicion` completa el viaje solo al cerrar la última parada (idempotente, `actual_end_time` = hora del cierre, evento `route_completed`). `tracking_reviews` se conserva sin uso.
- `docs/tracking/decisiones.md`: por qué POST + polling y no WebSocket, clustering, OSRM y tiles propios.
- Decisiones del usuario (ver `docs/tracking/decisiones.md`): se mantiene POST + polling; agrupación de camiones en el mapa (hecha, sin dependencias: `components/map/cluster.ts`, `FlotaCamiones.tsx`); "si se cierra en Planificación se cierra en todo" (completar/cancelar viaje o plan en `backend-planif` cierra la ruta de Tracking ligada, misma transacción, con guarda si el esquema de Tracking no existe; pruebas `backend/tests/test_planif_cierre_tracking.py`); los mapas (OSRM y tiles públicos) se dejan como están.
