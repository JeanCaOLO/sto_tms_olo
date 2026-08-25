# Component Inventory — Módulo de Planificación de Rutas

## Resumen

| Categoría | Cantidad | Ubicación |
|-----------|----------|-----------|
| React Components | 21 (20 activos + 1 muerto) | `src/pages/planificacion/components/` |
| Page Controller | 1 | `src/pages/planificacion/page.tsx` |
| Custom Hooks | 8 | `src/pages/planificacion/use-*.ts` |
| Algorithm Modules | 5 | `src/pages/planificacion/*.ts` |
| Repository/API Modules | 5 | `src/pages/planificacion/*-api.ts` + `*-mock.ts` |
| Prototipo Standalone | 6 | `src/lib/routePlanning/` |

---

## React Components

### Layout y Navegación

| Componente | Archivo | Responsabilidad | Props principales |
|-----------|---------|----------------|-------------------|
| `PlanificacionTabs` | `PlanificacionTabs.tsx` | Tabs de navegación entre los 3 flujos | `activeTab`, `onTabChange` |
| `NuevaRutaTab` | `NuevaRutaTab.tsx` | Layout completo del flujo de 1 vehículo: configuración + pedidos + ruta en construcción | Hooks de estado pasados como props |
| `FlotaSplitTab` | `FlotaSplitTab.tsx` | Layout del flujo de reparto multi-vehículo | Hooks de flota pasados como props |

### Configuración de Ruta

| Componente | Archivo | Responsabilidad | Props principales |
|-----------|---------|----------------|-------------------|
| `ConfiguracionRuta` | `ConfiguracionRuta.tsx` | Panel contenedor de la configuración de ruta | Catálogos, selecciones actuales, callbacks |
| `RouteConfigForm` | `RouteConfigForm.tsx` | Formulario con selects/inputs: viaje, vehículo, transportista, conductor, fechas | Opciones de catálogos, valores seleccionados |

### Capacidad

| Componente | Archivo | Responsabilidad | Props principales |
|-----------|---------|----------------|-------------------|
| `CapacityBar` | `CapacityBar.tsx` | Barra visual dual (peso/volumen) con indicador de % usado y color según umbral | `usedWeight`, `maxWeight`, `usedVolume`, `maxVolume` |

### Pedidos

| Componente | Archivo | Responsabilidad | Props principales |
|-----------|---------|----------------|-------------------|
| `PedidosRuta` | `PedidosRuta.tsx` | Lista scrolleable de pedidos del viaje con filtros de texto + toggle incluir/excluir cada pedido | `pedidos`, `seleccionados`, `onToggle` |
| `PedidoCard` | `PedidoCard.tsx` | Card individual de un pedido mostrando: dirección, cliente, peso, volumen, badges (excepción, ancla) | `pedido`, `isSelected`, `isAnclado`, `onToggle`, `onAnclar` |
| `PedidosDisponibles` | `PedidosDisponibles.tsx` | ⚠️ **CÓDIGO MUERTO** — no importado desde ningún archivo. Define su propia interfaz `Pedido` local. Vestigio de versión anterior. | — |

### Ruta en Construcción

| Componente | Archivo | Responsabilidad | Props principales |
|-----------|---------|----------------|-------------------|
| `RutaEnConstruccion` | `RutaEnConstruccion.tsx` | Panel principal: timeline vertical de paradas (drag-and-drop para reordenar) + mapa live sincronizado | `paradas`, `onReorder`, `geometria` |
| `ParadaCard` | `ParadaCard.tsx` | Card de una parada dentro de la ruta — draggable, muestra número de secuencia, dirección, cliente | `parada`, `index`, `onDragStart`, `onDragEnd` |
| `RutaMapaPreview` | `RutaMapaPreview.tsx` | Mapa Leaflet interactivo: marcadores numerados + polyline de la geometría OSRM | `paradas`, `geometry`, `onMarkerClick` |
| `ParadaDetalleModal` | `ParadaDetalleModal.tsx` | Modal que se abre al hacer click en un marcador del mapa — muestra detalle completo del pedido/parada | `parada`, `isOpen`, `onClose` |
| `StopBadge` | `StopBadge.tsx` | Badge circular numérico que indica la posición de la parada en la secuencia | `number`, `size?` |

### Flota (Multi-vehículo)

| Componente | Archivo | Responsabilidad | Props principales |
|-----------|---------|----------------|-------------------|
| `FlotaSlotPicker` | `FlotaSlotPicker.tsx` | Selector donde el usuario configura N slots: cada slot = vehículo + conductor + transportista | `slots`, `catalogos`, `onAddSlot`, `onRemoveSlot`, `onUpdateSlot` |
| `FlotaResultadoPreview` | `FlotaResultadoPreview.tsx` | Preview del resultado del reparto: muestra qué pedidos fueron asignados a qué vehículo | `resultado`, `vehiculos` |

### Rutas Generadas

| Componente | Archivo | Responsabilidad | Props principales |
|-----------|---------|----------------|-------------------|
| `RutasGeneradas` | `RutasGeneradas.tsx` | Listado/grid de todas las rutas ya generadas con filtros por estado | `rutas`, `onDelete`, `onEdit` |
| `RutaGeneradaCard` | `RutaGeneradaCard.tsx` | Card de una ruta generada: mini-mapa, estado (hoy/programada/completada), acciones | `ruta`, `onDelete`, `onViewDetail`, `onEdit` |
| `StopMiniPreview` | `StopMiniPreview.tsx` | Lista compacta de las primeras N paradas de una ruta dentro de la card | `stops`, `maxVisible?` |
| `SecuenciaRutaModal` | `SecuenciaRutaModal.tsx` | Modal fullscreen: mapa grande con polyline + lista completa numerada de paradas | `ruta`, `isOpen`, `onClose` |
| `EditarRutaModal` | `EditarRutaModal.tsx` | Modal de edición: cambiar asignaciones (vehículo/conductor), quitar paradas de la ruta | `ruta`, `catalogos`, `isOpen`, `onSave`, `onClose` |

---

## Custom Hooks

### Hooks de Estado (State)

| Hook | Archivo | Responsabilidad | Retorna |
|------|---------|----------------|---------|
| `useCatalogos` | `use-catalogos.ts` | Carga catálogos de Supabase una sola vez (mount). Cachea en estado local. | `{ rutas, vehiculos, transportistas, conductores, loading, error }` |
| `useViajes` | `use-viajes.ts` | Carga viajes despachados (actualmente 100% mock). | `{ viajes, loading, error }` |
| `usePedidosRuta` | `use-pedidos-ruta.ts` | Estado central del flujo "Nueva Ruta": lista de pedidos, selección, toggle incluir/excluir, ejecución de optimización. Coordina llamadas a `capacity-fit`, `distance-matrix`, `optimize-stops`. | `{ pedidos, seleccionados, togglePedido, optimizar, capacidadActual, ... }` |
| `usePedidosAnclados` | `use-pedidos-anclados.ts` | Mantiene set de pedidos "anclados" (pin). Antes de anclar, valida que el pedido cabe en la capacidad restante. | `{ anclados, anclarPedido, desanclar, validarCapacidad }` |
| `useFlotaSplit` | `use-flota-split.ts` | Estado del reparto multi-vehículo: pool de pedidos, slots configurados, resultado del split. Invoca `fleet-split`. | `{ pool, slots, resultado, ejecutarReparto, reset }` |
| `useRutasGeneradas` | `use-rutas-generadas.ts` | CRUD de rutas generadas persistidas en localStorage. Lee al mount, actualiza reactivamente. | `{ rutas, eliminar, actualizar, refresh }` |

### Hooks de Acción (Action)

| Hook | Archivo | Responsabilidad | Retorna |
|------|---------|----------------|---------|
| `useGenerarRuta` | `use-generar-ruta.ts` | Genera 1 ruta. Decide path mock vs real según `MOCK_AUTH_ENABLED`. Mock → localStorage; real → Supabase (3 operaciones secuenciales). | `{ generar, loading, error, success }` |
| `useGenerarFlota` | `use-generar-flota.ts` | Genera N rutas en batch (una por slot de la flota). Itera sobre el resultado del fleet-split y llama `generar` por cada vehículo. | `{ generarFlota, loading, progress, error }` |

---

## Algorithm Modules (funciones puras)

| Módulo | Archivo | Algoritmo | Entrada | Salida | Complejidad | Techo documentado |
|--------|---------|-----------|---------|--------|-------------|-------------------|
| **Capacity Fit** | `capacity-fit.ts` | First-Fit-Decreasing (bin-packing 2D) | Pedidos + capacidad vehículo | Pedidos que caben (respetando anclas) | O(n log n) | Greedy — no garantiza óptimo; upgrade a 2D knapsack |
| **Optimize Stops** | `optimize-stops.ts` | Nearest-Neighbor TSP | Paradas + matriz de distancias opcional | Secuencia optimizada | O(n²) | Nearest-neighbor — puede dar tours ~25% más largos que óptimo; upgrade a VRPTW |
| **Fleet Split** | `fleet-split.ts` | Greedy Largest-First | Pool de pedidos + lista de vehículos | N grupos (1 por vehículo) | O(n × k) | Sequential fill — no optimiza asignación global; upgrade a multi-bin optimization |
| **Distance Matrix** | `distance-matrix.ts` | HTTP + fallback | Coordenadas de N paradas | Matriz N×N de distancias (metros) | O(1) HTTP + O(n²) fallback | OSRM es ~exacto; fallback haversine×1.35 sobreestima en terreno montañoso |
| **Route Geometry** | `route-geometry.ts` | HTTP + fallback | Secuencia ordenada de coordenadas | GeoJSON LineString | O(1) HTTP | Fallback es línea recta (sin calles) |

### Márgenes de Seguridad (ADR-0001)

| Dimensión | Límite | Justificación |
|-----------|--------|---------------|
| Peso | 85% de capacidad máxima | Legislación CR de transporte de carga |
| Volumen | 95% de capacidad máxima | Best practices de fleet management (margen de maniobra) |

---

## Prototipo No Integrado (`src/lib/routePlanning/`)

| Módulo | Archivo | Función | Diferencia vs módulo activo |
|--------|---------|---------|---------------------------|
| `plan-route.ts` | Motor principal | Nearest-neighbor + ventanas horarias (8am–7pm) | Módulo activo NO tiene ventanas horarias |
| `haversine.ts` | Cálculo de distancia | Haversine + estimación duración (30 km/h) | Módulo activo usa haversine solo como fallback numérico |
| `google-distance-matrix.ts` | Cliente API | Google Maps Distance Matrix (batching 10×10) | Módulo activo usa OSRM |
| `build-matrices.ts` | Builder | Construye matrices desde Google Maps o haversine | Módulo activo construye desde OSRM |
| `types.ts` | Interfaces | `Stop`, `PlanStop`, `VehicleCapacity`, `PlanResult` | Interfaces diferentes a `types.ts` del módulo activo |
| `plan-route.selfcheck.ts` | Verificación | Assert-based, cubre capacidad + ventanas + distancia | Módulo activo NO tiene tests |

---

## Componentes Base Externos Utilizados

Importados desde `src/components/base/` (no leídos en profundidad):
- Botones, inputs, selects (componentes UI genéricos)
- Modales (wrapper para portales React)
- Toast notifications

## Hooks Externos Utilizados

- `useAuth` (`src/hooks/useAuth.tsx`) — provee sesión, org_id, user_id
- `useToast` (`src/hooks/useToast.tsx`) — notificaciones toast
