# 2026-08-24 — Editar ruta generada, mapa con OSRM/OpenStreetMap, más pedidos mock

## What changed
Cuatro mejoras al módulo de Planificación, pedidas por el usuario tras probar "Rutas Generadas":

1. **Editar ruta generada**: nuevo botón de lápiz en `RutaGeneradaCard.tsx` que abre `EditarRutaModal.tsx` — permite cambiar transportista/conductor/vehículo/fecha y quitar paradas de una ruta ya generada, sin tener que borrarla y rehacerla. `mock-store.ts` ganó `updateMockItem`, `generar-ruta-mock.ts` ganó `actualizarRutaGenerada` (recalcula peso/volumen al guardar).
2. **Fecha de creación visible**: la card ya guardaba `createdAt` pero nunca lo mostraba — se agregó `creadaHace()` ("hace 3 h", "hace 2 d") en `RutaGeneradaCard.tsx`.
3. **Más pedidos mock**: `MOCK_STOPS` pasó de 8 a 20 direcciones reales del GAM (Costa Rica); `fallback-viajes.ts` ahora arma 4 viajes de 5 pedidos cada uno (antes 3 viajes de 2-3) — el dataset anterior era demasiado chico para probar bien el bin-packing de capacidad.
4. **Mapa + distancia real gratuita**: nuevo `RutaMapaPreview.tsx` (Leaflet + tiles de OpenStreetMap, sin API key) mostrando cada ruta generada con marcadores numerados y la polyline del recorrido. `distance-matrix.ts` ahora pide la matriz N×N real al servicio `/table` de OSRM (`router.project-osrm.org`, demo público gratuito) antes de optimizar, con fallback automático a haversine si falla o no hay red (timeout 5s). `optimizarRuta` se volvió async; el botón "Optimizar paradas" muestra spinner ("Calculando distancias...") mientras espera.

## Why
El usuario notó que "Rutas Generadas" no tenía forma de editar ni ver cuándo se creó una ruta, que el dataset mock era muy chico para probar bien la planificación, y preguntó si se podía usar una alternativa gratuita a Google Maps tanto para distancias como para visualizar la ruta en un mapa ("para no usar LA CARA de Google" — el costo de la API real). OSRM + OpenStreetMap son gratis y sin llave, exactamente lo que ADR 0001 ya dejaba anotado como "línea de exploración futura" frente a Google Maps.

## How
Usé el subagente `crew:frontend-architect` (en background, en paralelo) para diseñar e implementar `RutaMapaPreview.tsx` — le di el contrato exacto (recibe `pedidos: PedidoSeleccionado[]`, filtra los sin coordenadas, usa `divIcon` en vez de los íconos PNG default de Leaflet porque rompen con Vite) y le pedí que NO tocara `RutaGeneradaCard.tsx` para evitar conflicto de edición en paralelo — yo lo integré después. Mientras tanto hice directamente: expansión del dataset mock, `updateMockItem`/modal de edición, y la integración de OSRM en `distance-matrix.ts` (llamada única al endpoint `/table`, no pairwise, para que sea viable con hasta 50 paradas por viaje).

Instalé `leaflet` + `react-leaflet` + `@types/leaflet` vía pnpm (no había ninguna librería de mapas en el proyecto). Verifiqué que OSRM responde con CORS habierto probando un `fetch` directo desde la consola del navegador (distancia real San José↔Escazú: 9.3 km). Probé todo el flujo en vivo: seleccionar viaje → optimizar (paradas se reordenan, la de excepción sin coordenadas queda última) → generar ruta → ver mapa con marcadores numerados y polyline → editar (cambiar conductor, quitar una parada, guardar) → confirmar que el resumen de peso/volumen y el mapa se actualizan solos.

`pnpm type-check` y `pnpm lint` limpios en todo lo tocado.

## Promoted knowledge
`MOCKING.md` actualizado: la fila de "Matriz de distancias N×N" ya no es 100% mock (llama a un servicio real, aunque gratuito y sin SLA) — se documentó la distinción y la condición de reemplazo. Nueva fila para el dataset ampliado de pedidos.

## Follow-ups
- [ ] El demo público de OSRM no tiene SLA — si esto pasa de prototipo a algo que el equipo usa a diario, evaluar un OSRM auto-hospedado (Docker, datos de OpenStreetMap de Costa Rica/Venezuela) en vez del servidor demo compartido.
- [ ] El modal de edición no permite re-optimizar ni agregar pedidos de vuelta (solo quitar) — si hace falta, habría que reutilizar `optimizarConCapacidad` dentro del modal.
- [ ] El mapa (`RutaMapaPreview.tsx`) usa las mismas coordenadas mock del viaje — cuando haya direcciones reales, debería funcionar sin cambios ya que solo depende de `delivery_latitude`/`delivery_longitude`.
