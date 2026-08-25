# Matriz de Requerimientos — Módulo de Planificación de Rutas

## Requerimientos Funcionales

### FR-1 — Selección de Viaje

| Campo | Valor |
|-------|-------|
| **ID** | FR-1 |
| **Nombre** | Selección de Viaje |
| **Descripción** | El usuario selecciona un viaje (agrupación de pedidos despachados desde el WMS Iflow) que trae sus pedidos asociados con ruta tipo pre-asignada. El sistema NO reasigna la relación ruta↔pedido; los pedidos llegan ya agrupados del WMS y el TMS solo optimiza la secuencia dentro de cada grupo. |
| **Criterio de aceptación** | 1. Al seleccionar un viaje se cargan todos sus pedidos asociados con estado `pending`. 2. Cada pedido muestra: dirección, cliente, peso, volumen, coordenadas (si disponibles). 3. Si la consulta a Supabase retorna 0 filas, se activa automáticamente el fallback de datos sintéticos sin intervención del usuario. |
| **Fuente** | `src/pages/planificacion/use-viajes.ts`, `src/pages/planificacion/pedidos-api.ts`, `src/pages/planificacion/fallback-pedidos.ts`, bitácora Reunión 2026-08-18 |
| **Estado** | Implementado |

---

### FR-2 — Capacidad y Bin-Packing

| Campo | Valor |
|-------|-------|
| **ID** | FR-2 |
| **Nombre** | Algoritmo de Capacidad (Bin-Packing 2D) |
| **Descripción** | El sistema aplica un algoritmo first-fit-decreasing para decidir qué pedidos caben en un vehículo dado. Se aplican dos márgenes de seguridad independientes: `WEIGHT_SAFETY_MARGIN = 0.85` (restricción legal, Decreto N.º 31363-MOPT, Costa Rica) y `VOLUME_SAFETY_MARGIN = 0.95` (restricción operativa de empaque). Los pedidos se ordenan de mayor a menor carga relativa y se insertan secuencialmente. |
| **Criterio de aceptación** | 1. `seleccionarPorCapacidad()` retorna `{ incluidos, excluidos }` donde ningún pedido incluido supera `capacity_weight × 0.85` acumulado ni `capacity_volume × 0.95` acumulado. 2. Los pedidos se ordenan por `cargaRelativa` descendente antes de la asignación. 3. Los pedidos anclados se colocan primero (ver FR-3). |
| **Fuente** | `src/pages/planificacion/capacity-fit.ts`, `docs/decisions/0001-route-planning-safety-margin-and-optimization.md` (ADR-0001) |
| **Estado** | Implementado |

---

### FR-3 — Pedidos Anclados (Pin)

| Campo | Valor |
|-------|-------|
| **ID** | FR-3 |
| **Nombre** | Pedidos Anclados |
| **Descripción** | El usuario puede "anclar" pedidos obligatorios que deben ir en la ruta independientemente del resultado del bin-packing. Los anclados se colocan primero en la selección de capacidad. Antes de permitir anclar un pedido, el sistema valida que el nuevo pedido más los ya anclados no superen los límites de capacidad del vehículo seleccionado. |
| **Criterio de aceptación** | 1. `excedeCapacidadAlAnclar()` retorna `true` si el pedido + los anclados existentes superan `maxWeight` o `maxVolume`. 2. Si retorna `true`, la UI bloquea la acción de anclar y muestra un toast de advertencia. 3. Los anclados persisten mientras la misma ruta esté en construcción y se resetean al cambiar de viaje. |
| **Fuente** | `src/pages/planificacion/capacity-fit.ts` (`excedeCapacidadAlAnclar`), `src/pages/planificacion/use-pedidos-anclados.ts` |
| **Estado** | Implementado |

---

### FR-4 — Optimización de Paradas (Nearest-Neighbor)

| Campo | Valor |
|-------|-------|
| **ID** | FR-4 |
| **Nombre** | Optimización de Secuencia de Paradas |
| **Descripción** | El sistema optimiza la secuencia de entrega usando el algoritmo Nearest-Neighbor (vecino más cercano) con complejidad O(n²). Utiliza una matriz de distancias N×N precalculada (OSRM `/table` endpoint para distancias reales por calle). Si la matriz no está disponible o un par falta, cae a distancia euclidiana en grados como fallback interno. Pedidos sin coordenadas se listan al final sin descartar. |
| **Criterio de aceptación** | 1. `optimizarParadas()` retorna un arreglo ordenado por vecino más cercano desde el primer pedido. 2. Utiliza la matriz OSRM si fue construida previamente. 3. Pedidos sin `delivery_latitude`/`delivery_longitude` aparecen al final del resultado. 4. Si hay menos de 2 pedidos con coordenadas, el fallback ordena por zona/ciudad. |
| **Fuente** | `src/pages/planificacion/optimize-stops.ts`, ADR-0001 (techo documentado: ~25% más largo que óptimo) |
| **Estado** | Implementado |

---

### FR-5 — Matriz de Distancias (OSRM /table)

| Campo | Valor |
|-------|-------|
| **ID** | FR-5 |
| **Nombre** | Cálculo de Matriz de Distancias N×N |
| **Descripción** | El sistema construye una matriz N×N de distancias en kilómetros entre todos los pares de pedidos con coordenadas válidas. Usa el endpoint `/table/v1/driving` de OSRM (auto-hospedado en `osrm.jesusaraujo.lat`) con anotación de distancia. Si OSRM falla (timeout 5s, error HTTP, respuesta inválida), cae automáticamente a haversine multiplicada por factor de rodeo 1.35. |
| **Criterio de aceptación** | 1. `construirMatrizDistancias()` retorna un objeto con método `distanciaKm(idA, idB)`, campo `faltantes` (pedidos sin coordenadas) y campo `fuente` (`'osrm'` o `'haversine'`). 2. El timeout OSRM es exactamente 5000ms con `AbortController`. 3. El fallback haversine aplica `DETOUR_FACTOR = 1.35`. 4. La función es llamada una sola vez por optimización (precálculo). |
| **Fuente** | `src/pages/planificacion/distance-matrix.ts`, `src/pages/planificacion/osrm-config.ts` |
| **Estado** | Implementado |

---

### FR-6 — Reparto de Flota Multi-Vehículo

| Campo | Valor |
|-------|-------|
| **ID** | FR-6 |
| **Nombre** | Reparto de Flota Multi-Vehículo |
| **Descripción** | El sistema distribuye un pool de pedidos de un viaje entre N vehículos configurados. Ordena los vehículos (slots) de mayor a menor capacidad de peso y llena cada uno secuencialmente usando el mismo algoritmo de bin-packing de FR-2. Los pedidos asignados a cada vehículo se optimizan en secuencia (FR-4). Los pedidos que no caben en ningún vehículo se reportan como `sinAsignar`. |
| **Criterio de aceptación** | 1. `repartirEntreFlota()` retorna `{ asignaciones: AsignacionFlota[], sinAsignar: Pedido[] }`. 2. Los slots se procesan de mayor a menor `capacity_weight`. 3. Cada slot reutiliza `seleccionarPorCapacidad` del módulo `capacity-fit.ts`. 4. Los pedidos incluidos en cada slot se optimizan con `optimizarParadas`. 5. Los pedidos sin asignar se reportan explícitamente. |
| **Fuente** | `src/pages/planificacion/fleet-split.ts`, ADR-0001 (backlog ítem #1, implementado 2026-08-12) |
| **Estado** | Implementado |

---

### FR-7 — Generación de Ruta (Persistencia)

| Campo | Valor |
|-------|-------|
| **ID** | FR-7 |
| **Nombre** | Generación y Persistencia de Ruta |
| **Descripción** | El sistema persiste una ruta generada con su secuencia de paradas optimizada, asignación de transportista, conductor, vehículo y fecha de entrega. En modo mock (`VITE_MOCK_AUTH=true`), la ruta se guarda en `localStorage` con prefijo `sto_mock_`. En modo real, se escribe a Supabase (tablas `routes`, `dispatch_guides`, update `orders`). La decisión mock/real se toma automáticamente según la variable de entorno. |
| **Criterio de aceptación** | 1. `useGenerarRuta` genera una ruta con todos los campos requeridos (transportista, conductor, vehículo, fecha, paradas ordenadas). 2. En modo mock, la ruta se persiste en localStorage y aparece en la pestaña "Rutas Generadas". 3. En modo real, se ejecutan las 3 operaciones a Supabase de forma secuencial. 4. Se muestra toast de éxito/error al usuario. |
| **Fuente** | `src/pages/planificacion/generar-ruta-mock.ts`, `src/pages/planificacion/generar-ruta-api.ts`, `src/pages/planificacion/use-generar-ruta.ts`, `src/lib/mock-store.ts` |
| **Estado** | Implementado |

---

### FR-8 — Generación de Rutas en Batch (Flota)

| Campo | Valor |
|-------|-------|
| **ID** | FR-8 |
| **Nombre** | Generación de N Rutas en Batch |
| **Descripción** | El flujo de reparto de flota genera N rutas simultáneamente (una por slot de vehículo) iterando sobre el resultado del fleet-split. Cada ruta se genera con las mismas reglas de FR-7. Se reporta progreso al usuario durante la iteración. |
| **Criterio de aceptación** | 1. `useGenerarFlota` itera sobre cada asignación y llama a la función de generación por cada vehículo. 2. Se expone `progress` para indicar avance. 3. Todas las rutas generadas aparecen en la pestaña "Rutas Generadas". |
| **Fuente** | `src/pages/planificacion/use-generar-flota.ts` |
| **Estado** | Implementado |

---

### FR-9 — Edición de Ruta Generada

| Campo | Valor |
|-------|-------|
| **ID** | FR-9 |
| **Nombre** | Edición de Ruta Generada |
| **Descripción** | El usuario puede editar rutas ya generadas: cambiar transportista, conductor, vehículo o fecha de entrega; y eliminar paradas individuales de la secuencia. Los cambios se persisten en el mismo store (mock o real). |
| **Criterio de aceptación** | 1. El modal `EditarRutaModal` permite cambiar asignaciones y quitar paradas. 2. Los cambios se reflejan inmediatamente en la lista de rutas generadas. 3. Se muestra toast de confirmación al guardar. |
| **Fuente** | `src/pages/planificacion/components/EditarRutaModal.tsx`, `src/pages/planificacion/use-rutas-generadas.ts` |
| **Estado** | Implementado |

---

### FR-10 — Eliminación de Ruta Generada

| Campo | Valor |
|-------|-------|
| **ID** | FR-10 |
| **Nombre** | Eliminación de Ruta Generada |
| **Descripción** | El usuario puede eliminar una ruta generada completa del sistema. La eliminación se persiste en el store correspondiente (mock: localStorage; real: Supabase). |
| **Criterio de aceptación** | 1. La acción de eliminar remueve la ruta del listado y del almacenamiento persistente. 2. No se usan diálogos nativos `confirm()`; se usa confirmación inline o toast. |
| **Fuente** | `src/pages/planificacion/components/RutasGeneradas.tsx`, `src/pages/planificacion/use-rutas-generadas.ts` |
| **Estado** | Implementado |

---

### FR-11 — Mapa Interactivo con Leaflet

| Campo | Valor |
|-------|-------|
| **ID** | FR-11 |
| **Nombre** | Mapa Interactivo |
| **Descripción** | El sistema renderiza un mapa interactivo basado en Leaflet + OpenStreetMap con: marcadores numerados en cada parada (badge de secuencia), polyline del trayecto real por calles (geometría OSRM), click en marcador para ver detalle del pedido, zoom controlado y flyTo animado en doble-click sobre una parada en la lista. |
| **Criterio de aceptación** | 1. El mapa muestra un marcador por cada parada con número de secuencia visible. 2. Se traza una polyline con la geometría real de calles. 3. Click en marcador abre `ParadaDetalleModal`. 4. Doble-click en una parada de la lista ejecuta `flyTo` al marcador correspondiente. 5. El mapa se sincroniza con la ruta en construcción. |
| **Fuente** | `src/pages/planificacion/components/RutaMapaPreview.tsx`, `src/pages/planificacion/components/ParadaDetalleModal.tsx` |
| **Estado** | Implementado |

---

### FR-12 — Geometría de Ruta Real (OSRM /route)

| Campo | Valor |
|-------|-------|
| **ID** | FR-12 |
| **Nombre** | Geometría de Ruta Real por Calles |
| **Descripción** | El sistema consulta OSRM endpoint `/route/v1/driving` con `overview=full&geometries=geojson` para obtener la geometría real por calles del trayecto completo. Se aplica un debounce de 400ms para evitar llamadas excesivas durante reordenamientos. Si OSRM falla (timeout 5s, error de red), se cae automáticamente a línea recta entre paradas consecutivas. Las coordenadas GeoJSON (lng, lat) se convierten a (lat, lng) para Leaflet. |
| **Criterio de aceptación** | 1. `obtenerGeometriaRuta()` retorna un arreglo de `[lat, lng]` pares. 2. El timeout es 5000ms con `AbortController`. 3. En caso de error retorna la línea recta (paradas conectadas punto a punto). 4. La respuesta se parsea de `routes[0].geometry.coordinates`. 5. Se invierte el orden `[lng, lat]` → `[lat, lng]` para compatibilidad con Leaflet. |
| **Fuente** | `src/pages/planificacion/route-geometry.ts` |
| **Estado** | Implementado |

---

### FR-13 — Excepciones de Pedido (Sin Coordenadas)

| Campo | Valor |
|-------|-------|
| **ID** | FR-13 |
| **Nombre** | Identificación y Manejo de Excepciones |
| **Descripción** | El sistema identifica pedidos sin coordenadas geográficas (`delivery_latitude` o `delivery_longitude` null) y los marca visualmente como "Excepción". Estos pedidos se excluyen del cálculo de distancias y optimización de secuencia, pero se listan al final de la ruta (no se descartan). Se muestra badge "Excepción" en la card del pedido y toast de advertencia indicando cuántos pedidos tienen datos incompletos. |
| **Criterio de aceptación** | 1. Pedidos con coordenadas null se filtran en `distance-matrix.ts` y se reportan como `faltantes`. 2. En `optimize-stops.ts` los pedidos sin coordenadas se colocan al final del resultado. 3. En la UI se muestra badge visual "Excepción" en `PedidoCard`. 4. Se muestra toast advirtiendo la cantidad de pedidos con excepción. |
| **Fuente** | `src/pages/planificacion/distance-matrix.ts` (campo `faltantes`), `src/pages/planificacion/optimize-stops.ts` (variable `sinCoords`), `src/pages/planificacion/components/PedidoCard.tsx` |
| **Estado** | Implementado |

---

### FR-14 — Barra de Capacidad Visual

| Campo | Valor |
|-------|-------|
| **ID** | FR-14 |
| **Nombre** | Indicador Visual de Capacidad (Peso y Volumen) |
| **Descripción** | El sistema muestra una barra dual de progreso (peso y volumen) que indica el porcentaje de capacidad utilizada del vehículo seleccionado. El color cambia según el nivel: verde (≤70%), amarillo (70%–85% peso / 70%–95% volumen), rojo (>85% peso / >95% volumen — superando margen de seguridad). |
| **Criterio de aceptación** | 1. `CapacityBar` recibe `usedWeight`, `maxWeight`, `usedVolume`, `maxVolume`. 2. Calcula porcentaje y aplica color por zona. 3. Se actualiza reactivamente cuando cambia la selección de pedidos o el vehículo. |
| **Fuente** | `src/pages/planificacion/components/CapacityBar.tsx` |
| **Estado** | Implementado |

---

### FR-15 — Navegación por Pestañas (Tres Flujos)

| Campo | Valor |
|-------|-------|
| **ID** | FR-15 |
| **Nombre** | Navegación por Pestañas |
| **Descripción** | El módulo de planificación organiza sus tres flujos principales en pestañas: "Nueva Ruta" (vehículo único), "Reparto de Flota" (multi-vehículo), y "Rutas Generadas" (gestión de rutas ya creadas). El estado de cada pestaña es independiente. |
| **Criterio de aceptación** | 1. `PlanificacionTabs` renderiza 3 tabs clickeables. 2. Solo se muestra el contenido de la pestaña activa. 3. Cambiar de pestaña no pierde el estado en progreso de las otras. |
| **Fuente** | `src/pages/planificacion/page.tsx`, `src/pages/planificacion/components/PlanificacionTabs.tsx` |
| **Estado** | Implementado |

---

### FR-16 — Configuración de Ruta (Catálogos)

| Campo | Valor |
|-------|-------|
| **ID** | FR-16 |
| **Nombre** | Formulario de Configuración de Ruta |
| **Descripción** | El usuario configura cada ruta seleccionando: viaje (origen), transportista, conductor, vehículo, y fecha de entrega. Los catálogos se cargan desde Supabase al montar el componente (con fallback a datos mock si RLS bloquea). El vehículo seleccionado define los límites de capacidad para el bin-packing. |
| **Criterio de aceptación** | 1. `useCatalogos` carga rutas, vehículos, transportistas y conductores. 2. El formulario `RouteConfigForm` expone selects para cada campo. 3. Al seleccionar vehículo se actualizan los límites de la barra de capacidad. |
| **Fuente** | `src/pages/planificacion/catalogos-api.ts`, `src/pages/planificacion/use-catalogos.ts`, `src/pages/planificacion/components/RouteConfigForm.tsx` |
| **Estado** | Implementado |

---

### FR-17 — Inclusión/Exclusión Manual de Pedidos

| Campo | Valor |
|-------|-------|
| **ID** | FR-17 |
| **Nombre** | Toggle de Inclusión/Exclusión de Pedidos |
| **Descripción** | El usuario puede incluir o excluir manualmente pedidos individuales del viaje antes de ejecutar la optimización. Los pedidos excluidos no participan en el bin-packing ni en la optimización de paradas. |
| **Criterio de aceptación** | 1. Cada `PedidoCard` tiene acción de toggle incluir/excluir. 2. Los pedidos excluidos no se pasan a `seleccionarPorCapacidad`. 3. El estado de selección persiste mientras la ruta está en construcción. |
| **Fuente** | `src/pages/planificacion/use-pedidos-ruta.ts`, `src/pages/planificacion/components/PedidosRuta.tsx` |
| **Estado** | Implementado |

---

### FR-18 — Reordenamiento Manual de Paradas (Drag & Drop)

| Campo | Valor |
|-------|-------|
| **ID** | FR-18 |
| **Nombre** | Reordenamiento Manual de Paradas |
| **Descripción** | Después de la optimización automática, el usuario puede reordenar paradas manualmente arrastrando las cards en la vista de "Ruta en Construcción". El mapa y la geometría se actualizan al soltar. |
| **Criterio de aceptación** | 1. `ParadaCard` soporta drag-and-drop. 2. `RutaEnConstruccion` maneja `onReorder` y actualiza la secuencia. 3. La geometría del mapa se recalcula tras el reordenamiento (con debounce). |
| **Fuente** | `src/pages/planificacion/components/RutaEnConstruccion.tsx`, `src/pages/planificacion/components/ParadaCard.tsx` |
| **Estado** | Implementado |

---

### FR-19 — Estado Visual de Rutas Generadas

| Campo | Valor |
|-------|-------|
| **ID** | FR-19 |
| **Nombre** | Badge de Estado de Ruta |
| **Descripción** | Cada ruta generada muestra un badge visual de estado derivado de la fecha: "Hoy" (fecha = hoy), "Programada" (fecha futura), "Completada" (fecha pasada). El estado es derivado, no persistido — se calcula en tiempo de renderizado. |
| **Criterio de aceptación** | 1. `route-status.ts` deriva el estado comparando `fecha_entrega` con la fecha actual. 2. El badge se muestra en `RutaGeneradaCard`. 3. Se puede filtrar la lista por estado. |
| **Fuente** | `src/pages/planificacion/route-status.ts`, `src/pages/planificacion/components/RutaGeneradaCard.tsx` |
| **Estado** | Implementado |

---

### FR-20 — Vista Detalle de Ruta (Modal Fullscreen)

| Campo | Valor |
|-------|-------|
| **ID** | FR-20 |
| **Nombre** | Vista Detalle Completo de Ruta Generada |
| **Descripción** | Al seleccionar una ruta generada, se abre un modal fullscreen con mapa grande mostrando la polyline completa + lista numerada de todas las paradas con detalle de cada una. |
| **Criterio de aceptación** | 1. `SecuenciaRutaModal` se abre con la ruta seleccionada. 2. El mapa muestra la geometría completa con marcadores numerados. 3. La lista lateral muestra todas las paradas con dirección y cliente. |
| **Fuente** | `src/pages/planificacion/components/SecuenciaRutaModal.tsx` |
| **Estado** | Implementado |

---

### FR-21 — Slots de Flota Configurables

| Campo | Valor |
|-------|-------|
| **ID** | FR-21 |
| **Nombre** | Configuración de N Slots de Vehículo |
| **Descripción** | En el flujo de reparto de flota, el usuario agrega N slots donde cada slot representa un vehículo + conductor (opcional) + transportista. Puede agregar/quitar slots dinámicamente antes de ejecutar el reparto. |
| **Criterio de aceptación** | 1. `FlotaSlotPicker` permite agregar, quitar y configurar slots. 2. Cada slot requiere al menos un vehículo seleccionado. 3. El conductor/transportista es opcional por slot. |
| **Fuente** | `src/pages/planificacion/components/FlotaSlotPicker.tsx`, `src/pages/planificacion/use-flota-split.ts` |
| **Estado** | Implementado |

---

### FR-22 — Cálculo de ETA y Alerta de Ventana Horaria

| Campo | Valor |
|-------|-------|
| **ID** | FR-22 |
| **Nombre** | Hora Estimada de Llegada (ETA) por Parada y Aviso de Ventana Horaria |
| **Descripción** | Al optimizar una ruta, el sistema calcula la hora estimada de llegada (ETA) de cada parada caminando el reloj desde las 8:00am usando la duración real de manejo entre paradas consecutivas (OSRM `/table` con anotación `duration`) más un tiempo de servicio fijo de 5 min por parada. Si una parada cae fuera de la ventana de entrega (8:00–19:00), se marca visualmente (badge rojo "Fuera de ventana", borde/fondo rojo en la card) y se muestra un toast de advertencia con el conteo de paradas afectadas. Fusionado desde el prototipo `src/lib/routePlanning/plan-route.ts` (ADR-0001, backlog ítem #2). |
| **Criterio de aceptación** | 1. `calcularEtas()` retorna cada parada con `eta_min` (minutos desde medianoche) y `outside_window` (booleano). 2. Paradas sin coordenadas obtienen `eta_min = -1` y no cuentan como fuera de ventana. 3. `ParadaCard` muestra el ETA en formato HH:MM junto al número de pedido, con color teal si está dentro de ventana y rojo si no. 4. Al terminar de optimizar, si `fueraDeVentana > 0` se dispara un toast de advertencia. |
| **Fuente** | `src/pages/planificacion/time-windows.ts`, `src/pages/planificacion/distance-matrix.ts` (`duracionMin`), `src/pages/planificacion/capacity-fit.ts`, `src/pages/planificacion/components/ParadaCard.tsx`, `docs/work/2026-08/2026-08-25-time-windows-eta.md`, ADR-0001 (backlog ítem #2, implementado 2026-08-25) |
| **Estado** | Implementado |

---

## Requerimientos No Funcionales

### NFR-1 — Rendimiento de Servicios Externos

| Campo | Valor |
|-------|-------|
| **ID** | NFR-1 |
| **Nombre** | Rendimiento |
| **Descripción** | Las llamadas a servicios externos (OSRM) tienen un timeout de 5000ms con `AbortController`. La solicitud de geometría se invoca con debounce de 400ms para evitar llamadas excesivas durante reordenamientos rápidos. La matriz de distancias se precalcula una sola vez por ciclo de optimización (no por par). |
| **Criterio de aceptación** | 1. Constante `OSRM_TIMEOUT_MS = 5000` en `distance-matrix.ts` y `OSRM_ROUTE_TIMEOUT_MS = 5000` en `route-geometry.ts`. 2. Debounce de 400ms aplicado antes de invocar `obtenerGeometriaRuta`. 3. La matriz N×N se construye en una sola llamada HTTP (`/table`), no N² llamadas. |
| **Fuente** | `src/pages/planificacion/distance-matrix.ts`, `src/pages/planificacion/route-geometry.ts` |
| **Estado** | Implementado |

---

### NFR-2 — Disponibilidad Degradada (Graceful Degradation)

| Campo | Valor |
|-------|-------|
| **ID** | NFR-2 |
| **Nombre** | Disponibilidad Degradada |
| **Descripción** | Cada punto de integración externa tiene un fallback automático que permite continuar la operación sin intervención del usuario: OSRM falla → haversine × 1.35; Supabase devuelve 0 filas o RLS bloquea → datos mock sintéticos; geometría OSRM falla → línea recta entre paradas; Auth no disponible → mock-auth. |
| **Criterio de aceptación** | 1. `construirMatrizDistancias` retorna `fuente: 'haversine'` si OSRM falla. 2. `obtenerGeometriaRuta` retorna línea recta si la llamada falla. 3. APIs de datos usan fallback si query retorna vacío. 4. Mock-auth se activa con `VITE_MOCK_AUTH=true`. 5. Todas las transiciones a fallback son transparentes para el usuario (no errores fatales). |
| **Fuente** | `src/pages/planificacion/distance-matrix.ts`, `src/pages/planificacion/route-geometry.ts`, `src/pages/planificacion/pedidos-api.ts`, `MOCKING.md` |
| **Estado** | Implementado |

---

### NFR-3 — Límites de Código (Mantenibilidad)

| Campo | Valor |
|-------|-------|
| **ID** | NFR-3 |
| **Nombre** | Límites de Tamaño de Archivo |
| **Descripción** | Se enforzan límites de líneas por tipo de archivo mediante hooks automáticos del framework crew que bloquean escrituras que excedan el límite: componentes React ≤ 150 líneas, páginas ≤ 200 líneas, hooks ≤ 80 líneas. Cuando un archivo se acerca al límite, se extrae lógica a archivos nuevos (nunca se solicitan excepciones). |
| **Criterio de aceptación** | 1. Ningún componente `.tsx` excede 150 líneas. 2. Ningún `page.tsx` excede 200 líneas. 3. Ningún `use-*.ts` excede 80 líneas. 4. El hook de pre-escritura bloquea archivos que violen estos límites. |
| **Fuente** | `standards/code-quality.md`, `crew.json`, `HANDOFF.md` sección 3 |
| **Estado** | Implementado |

---

### NFR-4 — Internacionalización (UI en Español)

| Campo | Valor |
|-------|-------|
| **ID** | NFR-4 |
| **Nombre** | Interfaz en Español |
| **Descripción** | Toda la interfaz de usuario está en español. Los nombres de variables de dominio usan español en camelCase (`pedidosAnclados`, `optimizarParadas`, `repartirEntreFlota`). Los comentarios de código usan español para lógica de negocio e inglés para documentación técnica estándar (comentarios `ponytail:`). |
| **Criterio de aceptación** | 1. Todos los labels, placeholders, toasts y mensajes de UI están en español. 2. Variables de dominio siguen convención camelCase en español. 3. No hay strings en inglés visibles al usuario final. |
| **Fuente** | Todos los archivos de componentes en `src/pages/planificacion/components/` |
| **Estado** | Implementado |

---

### NFR-5 — Responsividad

| Campo | Valor |
|-------|-------|
| **ID** | NFR-5 |
| **Nombre** | Diseño Responsive |
| **Descripción** | El sidebar de navegación es colapsable en escritorio y se convierte en drawer (overlay) en dispositivos móviles. Los mapas Leaflet tienen scroll controlado (no capturan el scroll de la página). La UI se adapta a diferentes tamaños de pantalla con breakpoints de Tailwind CSS. |
| **Criterio de aceptación** | 1. `useSidebar` controla estado colapsado/expandido + modo drawer en móvil. 2. El sidebar colapsa a íconos en desktop y se oculta completamente en móvil (apertura via hamburger). 3. Los mapas no capturan scroll involuntariamente. |
| **Fuente** | `src/hooks/useSidebar.tsx`, `src/components/feature/Sidebar.tsx` |
| **Estado** | Implementado |

---

### NFR-6 — Seguridad

| Campo | Valor |
|-------|-------|
| **ID** | NFR-6 |
| **Nombre** | Seguridad de Credenciales e Infraestructura |
| **Descripción** | No se hardcodean credenciales en el código fuente (las de Supabase están en `.env`, preexistente). El servicio OSRM está auto-hospedado en dominio propio (`osrm.jesusaraujo.lat`) bajo Dokploy, eliminando dependencia del servicio demo público con rate-limits. La configuración del dominio OSRM se centraliza en un módulo de configuración. |
| **Criterio de aceptación** | 1. No hay API keys ni secrets en archivos `.ts`/`.tsx` (solo en `.env`). 2. `OSRM_BASE_URL` se importa de `osrm-config.ts`, no se hardcodea en cada archivo. 3. El dominio OSRM es propio (no `router.project-osrm.org`). |
| **Fuente** | `src/pages/planificacion/osrm-config.ts`, `HANDOFF.md` sección 4, `.env` |
| **Estado** | Implementado |

---

### NFR-7 — Trazabilidad de Decisiones Técnicas

| Campo | Valor |
|-------|-------|
| **ID** | NFR-7 |
| **Nombre** | Comentarios `ponytail:` y ADRs |
| **Descripción** | Las simplificaciones deliberadas del código se documentan con comentarios `ponytail:` que incluyen: descripción del techo de la simplificación y ruta de upgrade. Las decisiones de arquitectura mayores se documentan en ADRs (`docs/decisions/`). Las sesiones de trabajo se documentan en bitácora (`docs/work/`). |
| **Criterio de aceptación** | 1. `capacity-fit.ts` contiene comentario `ponytail:` explicando que es greedy, no exact knapsack. 2. `optimize-stops.ts` documenta el techo de ~25% subóptimo. 3. `fleet-split.ts` documenta "sequential fill, no multi-bin optimum". 4. ADR-0001 documenta la investigación y decisión de márgenes. |
| **Fuente** | `src/pages/planificacion/capacity-fit.ts`, `src/pages/planificacion/optimize-stops.ts`, `src/pages/planificacion/fleet-split.ts`, `docs/decisions/0001-route-planning-safety-margin-and-optimization.md` |
| **Estado** | Implementado |

---

## Trazabilidad Cruzada

| Área funcional | Requerimientos | Archivos clave |
|----------------|---------------|----------------|
| Selección de Viaje | FR-1, FR-16 | `use-viajes.ts`, `catalogos-api.ts`, `pedidos-api.ts` |
| Capacidad / Bin-Packing | FR-2, FR-3, FR-14 | `capacity-fit.ts`, `CapacityBar.tsx` |
| Optimización de Paradas | FR-4, FR-5, FR-22 | `optimize-stops.ts`, `distance-matrix.ts`, `time-windows.ts` |
| Flota Multi-Vehículo | FR-6, FR-8, FR-21 | `fleet-split.ts`, `FlotaSplitTab.tsx`, `FlotaSlotPicker.tsx` |
| Generación de Ruta | FR-7, FR-8, FR-10 | `generar-ruta-api.ts`, `generar-ruta-mock.ts`, `use-generar-ruta.ts` |
| Edición de Ruta | FR-9, FR-10 | `EditarRutaModal.tsx`, `use-rutas-generadas.ts` |
| Mapa / Geometría | FR-11, FR-12 | `RutaMapaPreview.tsx`, `route-geometry.ts` |
| Excepciones | FR-13 | `distance-matrix.ts`, `optimize-stops.ts`, `PedidoCard.tsx` |
| Navegación | FR-15, FR-17, FR-18, FR-19, FR-20 | `page.tsx`, `PlanificacionTabs.tsx`, componentes UI |




## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-08-25T10:02:47Z
**Iteration:** 1

### Findings

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| 1 | Minor | FR-9 | Los criterios de aceptación no especifican qué sucede con los pedidos removidos de una ruta (¿vuelven al pool de disponibles? ¿se marcan excluidos?) ni si hay un mínimo de paradas permitido. | Agregar criterio: "Los pedidos removidos vuelven al estado previo en el viaje" y definir comportamiento con 0 paradas. |
| 2 | Minor | FR-19 | El estado "Completada" se deriva únicamente de que `fecha_entrega < hoy`. Esto es una simplificación funcional — una ruta con fecha pasada podría no haberse ejecutado realmente. | Documentar explícitamente que "Completada" es una derivación por fecha, no por confirmación operativa. Ya está implícito en la descripción pero el criterio de aceptación no lo aclara. |
| 3 | Minor | NFR-5 | Los archivos fuente referenciados (`useSidebar.tsx`, `Sidebar.tsx`) están fuera del módulo `planificacion/` — es un requerimiento del shell de la app, no del módulo específico. | Considerar mover a un documento de requerimientos del layout/shell o marcar explícitamente como requerimiento compartido. |
| 4 | Minor | NFR-3 | El criterio "Ningún `use-*.ts` excede 80 líneas" es una regla de linting del framework crew, no un requerimiento funcional del módulo de planificación en sí. Es verificable pero su incumplimiento no afecta al usuario final. | Aceptable como NFR de mantenibilidad documentado. Sin acción requerida. |
| 5 | Minor | team-roles.md | La interfaz Planificación → Liquidación está "por definir" — documentada como punto abierto. No bloquea la comprensión del módulo actual pero es riesgo downstream. | Ya está correctamente identificado como punto de coordinación abierto #1. Sin acción inmediata. |

### Summary

Los artefactos están excepcionalmente bien estructurados para una ingeniería inversa de código existente. Los 21 requerimientos funcionales son testables, verificables, y mapean directamente a funciones/componentes específicos del código. Los criterios de aceptación son concretos (nombres de funciones, valores de retorno, constantes, comportamientos UI observables). Los 7 NFR son medibles con umbrales explícitos. El mapa de dependencias inter-módulo es completo para lo que está implementado, con los puntos pendientes correctamente documentados como coordinación abierta. Los hallazgos son todos Minor — ninguno impediría que un desarrollador comprenda o trabaje con este módulo.
