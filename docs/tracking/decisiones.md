# Decisiones de Tracking (y por qué)

## 1. Posiciones por POST en lotes + web con polling (no WebSocket) — DECIDIDO 2026-10-17

**Decisión:** se mantiene el POST (app → backend) y la consulta periódica (web). El WebSocket queda descartado mientras la escala sea la actual.

Hay **dos tramos**, y conviene no mezclarlos:

| Tramo | Cómo es hoy | ¿WebSocket? |
|---|---|---|
| App del chofer → backend | `POST /posiciones` en lotes (cada 20 puntos o 60 s), con cola offline idempotente (`client_id`) | **No.** Un socket necesita conexión estable; con cobertura irregular se cae, hay que reconectar y lo enviado durante el corte se pierde o se duplica. El POST por lotes con reintento es lo correcto para zonas sin señal. **No se cambia.** |
| Backend → pantalla web | La web consulta cada 15 s (1 llamada lista + KPIs; +1 si hay un viaje abierto) | Evaluado y **descartado por ahora** (abajo). |

**Por qué el polling de la web es la mejor opción hoy:**
- **Frescura:** el camión manda su posición cada 30–60 s. Consultar cada 15 s suma ~7 s de demora en promedio. Un WebSocket empujaría el dato al instante, pero el dato ya tiene hasta 60 s: la mejora real es mínima (objetivo del blueprint: ≤ 15 s).
- **Costo:** el polling depende de **cuántas pantallas** hay abiertas, no de cuántos camiones. Con 10 supervisores son ~40–80 invocaciones/min (≈ 1,3 M/mes en horario laboral): centavos en Lambda. Un WebSocket depende de **camiones × supervisores**: 200 camiones con lote/min × 10 pantallas ≈ 2 000 mensajes/min (≈ 30 M/mes), más la Lambda que reparte y las lecturas de conexiones en DynamoDB. A esta escala, el WebSocket es más caro y más complejo.
- **Robustez:** si una consulta falla, la siguiente se recupera sola (con espera creciente). Un socket caído deja la pantalla congelada hasta reconectar y obliga a re-sincronizar.
- **Simplicidad:** un solo contrato (GET) para web, mock y pruebas.

**Cuándo convendría el WebSocket (`dev-tms-realtime` ya existe para Planificación):** muchas pantallas abiertas a la vez (decenas), o necesidad de reacción inmediata (p. ej. una alerta de pánico). Aun así, la forma recomendada sería **híbrida**: el WebSocket solo avisa "hay datos nuevos de tal viaje" y la web hace el mismo GET de siempre. Así no se duplica la lógica y, sin avisos, no se consulta en vano. No se implementa mientras no haga falta.

## 2. Agrupar camiones en el mapa (clustering) — HECHO 2026-10-17

Con muchos camiones cerca (p. ej. todos en el GAM) y el mapa alejado, los íconos se **encimen** y no se pueden distinguir ni hacer clic. El clustering los reemplaza por una burbuja con el número ("12") que se separa al acercar el mapa o al hacer clic (librería `leaflet.markercluster`). **Implementado sin dependencias nuevas** (`components/map/cluster.ts` + `FlotaCamiones.tsx`): solo agrupa los íconos que en pantalla quedarían a menos de ~36 px; con la flota separada no cambia nada. La burbuja lleva borde rojo si algún camión del grupo tiene alerta; clic = acerca hasta separarlos; desde zoom 16 nunca agrupa; el camión elegido nunca se agrupa.

## 3. Cierre de viajes — DECIDIDO 2026-10-17

- Tracking solo monitorea: `POST /viajes/{id}/completar` y `/revisar` se eliminaron (detalle en [contrato-api-v2.md](./contrato-api-v2.md#retirado-en-v2)). `tracking_reviews` se conserva sin uso.
- El viaje se **cierra solo** cuando la app cierra su última parada.
- **Si se cierra en Planificación, se cierra en todo:** completar o cancelar un viaje (`/planificacion/viajes/{tripId}/completar|cancelar`) o el plan entero (`/planificacion/planes/{id}/completar|cancelar`) cierra también la ruta de Tracking ligada (`routes.plan_trip_id` → `Completada` / `Cancelada`), en la misma transacción y sin pisar un cierre previo. Reabrir en Planificación no reabre la ruta. Código: `backend-planif/src/adapters/outbound/aurora/plan_repo.py`; pruebas: `backend/tests/test_planif_cierre_tracking.py`.

## 4. OSRM y proveedor de mapas — DECIDIDO 2026-10-17: se mantienen como están

**Decisión:** no se tocan; los servicios públicos actuales (OSRM demo y tiles de OpenStreetMap) funcionan para el uso actual. Lo de abajo queda como referencia por si en el futuro hubiera límites o caídas.

Son dos servicios externos distintos que hoy usamos en su versión **pública y gratuita**:

| | Qué hace | Qué usamos hoy | Problema | Qué resuelve tener uno propio |
|---|---|---|---|---|
| **OSRM** (motor de rutas) | Calcula el camino por calles entre puntos: la línea de la ruta en Tracking, los camiones del mock y las distancias reales de Planificación | `router.project-osrm.org` (demo público) | Sin SLA (nadie garantiza que esté arriba), ~1 petición/s, puede bloquearnos o caerse; además mandamos coordenadas de clientes a un tercero | Disponibilidad y velocidad bajo nuestro control, sin límite de peticiones, los datos no salen de AWS. Ya está preparado: `infra/osrm/` (Docker, se arma solo con el mapa de Costa Rica; agregar Venezuela). Se publica en AWS (ECS/EC2) y se apunta con `VITE_OSRM_URL`. Costo: el servidor (sin licencia). |
| **Tiles** (el dibujo del mapa) | Las imágenes de fondo con calles y nombres que se ven en Leaflet | `tile.openstreetmap.org` | Su política prohíbe uso intensivo/comercial: con muchos usuarios pueden limitarnos o bloquearnos, y el mapa quedaría en gris | Un proveedor con contrato y SLA (MapTiler, Stadia, Mapbox o **Amazon Location Service**, que encaja con el estándar AWS de Intelix). Se cambia solo `VITE_MAP_TILES_URL` (y la llave del proveedor). Costo por cantidad de mapas cargados; hay capas gratuitas para volúmenes bajos. |

Si algún día aparecen bloqueos o lentitud, la salida está documentada arriba; mientras tanto no hay acción.
