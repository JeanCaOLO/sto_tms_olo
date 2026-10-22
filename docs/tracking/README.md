# Tracking — monitoreo de viajes

**Qué es:** la pantalla `/tracking` del TMS. **Solo monitorea** los viajes en curso: lista, mapa, avance, hacia dónde va cada camión y las evidencias de entrega. No crea, asigna, cancela, reprograma ni completa viajes: eso es de Planificación (FR7). Las posiciones y las entregas las produce la app del chofer (`.test/blueprint/mobile-tracking-tms/`).

**Evidencias de entrega:** solo **foto de la factura firmada** y **firma digital**. No hay novedades, recolectas ni devoluciones.

## Estado (2026-10-17)

| Pieza | Estado |
|---|---|
| Web (`src/pages/tracking`) | Hecha. Habla el contrato v2 del API. |
| Modo mock (sin túnel) | Hecho. Backend simulado en memoria, mismo contrato. Es como se trabaja hoy. |
| Backend (`backend/tracking`) | Contrato v2 implementado y probado con fakes (97 pruebas). **Sin probar contra Aurora ni desplegado.** |
| Migración `sql/44_tracking_rendimiento.sql` | Escrita. **No aplicada.** |
| App móvil del chofer | Contrato ajustado en `.test/blueprint/mobile-tracking-tms/`; app aparte. |

Todo lo que necesita el túnel a Aurora está en **[pendientes-tunel.md](./pendientes-tunel.md)**, con pasos para hacerlo.

## Documentos

| Archivo | Para qué |
|---|---|
| [contrato-api-v2.md](./contrato-api-v2.md) | Endpoints, campos, reglas de alertas y KPIs. Fuente única para backend, mock y app. |
| [modo-mock.md](./modo-mock.md) | Cómo correr la pantalla sin túnel, escenarios de prueba y cómo agregar otros. |
| [pendientes-tunel.md](./pendientes-tunel.md) | Lo que falta y requiere túnel/AWS, con el cómo paso a paso. |
| [alternativas-mapas.md](./alternativas-mapas.md) | 14 proveedores pagos de mapas/rutas/geocoding, costo mensual estimado y pendientes para decidir. |
| [decisiones.md](./decisiones.md) | Decisiones tomadas: POST + polling (no WebSocket), agrupación de camiones, el viaje lo termina Planificación (Tracking solo lo lee), mapas como están. |
| `docs/work/2026-10/2026-10-17-tracking-saneamiento-monitoreo.md` | Bitácora del cambio a "solo monitoreo" + optimización. |

## Cómo se ve la pantalla

- **KPIs por viaje** (clic = filtra lista y mapa): En ruta · A tiempo · Retrasados · Sin señal · Completados hoy.
- **Lista**: Activos / Todos, búsqueda (viaje, conductor, placa), tarjeta con avance, alertas y "última señal hace X".
- **Mapa**: un camión por viaje (verde con señal, ámbar señal antigua, gris sin señal, azul completado); los que se enciman se agrupan en una burbuja con el número (clic = acercar). Del viaje elegido: ruta por calles (OSRM; tramos hechos sólidos, pendientes punteados), sede y paradas destacadas (la ruta y la lista de pedidos se ordenan por cercanía a la sede: cerradas primero y pendientes por vecino más cercano; solo visual, la secuencia de Planificación, "siguiente parada" y ETA no cambian) (✓ entregada, ✕ fallida, número pendiente, anillo en la siguiente).
- **Panel** (solo lectura): conductor · placa, avance, "rumbo a la parada N" con ETA en la hora del país, pedidos con sus 2 evidencias y **Reproducir recorrido** (replay del GPS real).
- **Solo en mock**: controles de simulación (velocidad, pausa, reinicio) e "Iniciar viaje (pruebas)".

## Archivos clave

| Ruta | Rol |
|---|---|
| `src/pages/tracking/api.ts` | Cliente del contrato v2; transporte inyectable (real = `apiFetch`, mock = backend simulado). |
| `src/pages/tracking/hooks/usePolling.ts` | Refresco: una consulta en vuelo, timeout 15 s, backoff hasta 60 s, pausa con pestaña oculta. |
| `src/pages/tracking/mock/` | `sim.ts` (simulación), `fakeTrackingBackend.ts` (rutas HTTP simuladas), `installTrackingMock.ts`. |
| `src/pages/tracking/route-osrm.ts` | Ruta por calles (OSRM) con caché; sin respaldo en línea recta. |
| `backend/tracking/src/` | `app.py` (handlers), `tracking_logic.py` (reglas puras), `tracking_sql.py`. |
| `e2e/tracking.spec.ts` | Prueba de punta a punta en navegador (modo mock). |
| `scripts/tracking-contract-check.mjs` | Verifica el contrato v2 contra un backend real y mide tiempos (requiere túnel). |
| `scripts/simular-posiciones.mjs` | Simula un camión enviando GPS al backend real (`--por-calles`). |
| `scripts/seed-tracking-demo.mjs`, `scripts/limpiar-tracking-prueba.mjs` | Datos de prueba en Aurora y su limpieza. |
