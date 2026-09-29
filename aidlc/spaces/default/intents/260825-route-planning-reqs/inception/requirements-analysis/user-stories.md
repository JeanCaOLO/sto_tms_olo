# Historias de Usuario — Módulo de Planificación de Rutas

> **Origen y método**: derivadas **del código actual de la rama `planif-hu-docs`**
> (opción B: leer el código y documentar lo que hace), no de una sesión completa del
> ritual AI-DLC. Complementan `requirements.md` (los FR) y `end-user-roles.md` (los
> roles) del mismo folder. Cada criterio de aceptación cita entre backticks el archivo
> fuente en `src/pages/planificacion/` que lo respalda.
>
> **Alcance del flujo documentado**: esta rama corre el **flujo MANUAL multi-pestaña**
> (Nueva Ruta / Reparto de Flota / Rutas Generadas / Matriz de Rutas / Asignar Viajes /
> Maestros — ver `page.tsx`, `PlanificacionTabs.tsx`). **No** incluye el flujo automático
> descrito para `main`; esas historias documentan lo que existe aquí.
>
> **"Implementado" ≠ "en producción"**: igual que en `requirements.md`, salvo los
> catálogos de lectura (que sí leen de Supabase real), todo lo demás está verificado
> **contra datos mock / EFLOW**, no contra escritura real en backend (ver `MOCKING.md`,
> NFR10). Las historias describen el comportamiento del código, no una garantía de
> producción.
>
> **Terminología**: donde una historia dice "ruta generada" léase **secuencia de
> paradas** (ver nota de terminología en `requirements.md`). Se conserva el nombre
> actual de UI/código.

## Roles

- **Planificador de Rutas** — usuario primario; arma la secuencia de paradas día a día
  (flujo "Nueva Ruta").
- **Coordinador de Flota** — reparte el pool de pedidos de un viaje entre varios
  vehículos (flujo "Reparto de Flota"). En operaciones pequeñas es la misma persona que
  el Planificador.
- **Jefe de Almacén** — supervisa, edita y elimina secuencias ya generadas (flujo "Rutas
  Generadas").

(Definiciones completas y matriz de acceso en `end-user-roles.md`.)

---

## US-1 — Seleccionar un viaje y cargar sus pedidos

Como **Planificador de Rutas**, quiero seleccionar un viaje ya despachado por el WMS y ver
al instante sus pedidos, para empezar a armar la secuencia sin buscar pedidos uno por uno.

**Criterios de aceptación:**
- Al montar el módulo se cargan los viajes del país/compañía activos; cambiar país o
  compañía recarga la lista (`use-viajes.ts` → `fetchViajesDespachados`; `page.tsx`
  `cambiarPais`/`cambiarCompania`).
- Al elegir un viaje que ya trae pedidos precargados, se usan directo; si no, se cargan
  perezoso desde el backend del viaje (`use-pedidos-ruta.ts` `setViaje` →
  `fetchPedidosDeViaje`).
- Todos los pedidos del viaje quedan **incluidos por defecto** al cargarse — el
  planificador solo excluye explícitamente, no parte de cero (`use-pedidos-ruta.ts`
  `aplicarPedidos` aplica `withStopNumbers` a todos).
- Al cambiar de viaje, la selección, los anclajes y las exclusiones del viaje anterior se
  reemplazan por completo — no se arrastra estado (`page.tsx` `handleSetViajeId` llama
  `setViaje` + `limpiarAnclas`; `use-pedidos-ruta.ts` `aplicarPedidos` resetea excluidos).
- En modo real, si el endpoint del viaje no responde o trae 0 filas, cae de forma
  transparente al pool mock (`eflow-api.ts` `fetchPedidosDeViaje` → `getFallbackPedidos`;
  `pedidos-api.ts` mismo patrón).

*Estado del código: implementado sobre mock/EFLOW; las tablas `trips`/`trip_orders` no
existen aún en Supabase (ver FR1 en `requirements.md`).*

---

## US-2 — Selección automática por capacidad (bin-packing 85/95)

Como **Planificador de Rutas**, quiero que el sistema decida qué pedidos caben en el
vehículo elegido sin superar su capacidad legal ni operativa, para no sobrecargarlo.

**Criterios de aceptación:**
- El algoritmo ordena los pedidos por **carga relativa descendente** (el mayor entre
  ratio de peso y de volumen) y los asigna secuencialmente — first-fit-decreasing
  (`capacity-fit.ts` `cargaRelativa` + `seleccionarPorCapacidad`).
- Ningún pedido incluido hace que el peso acumulado supere el **85 %** de
  `capacity_weight` ni el volumen el **95 %** de `capacity_volume`; los márgenes son las
  constantes `WEIGHT_SAFETY_MARGIN = 0.85` y `VOLUME_SAFETY_MARGIN = 0.95`
  (`capacity-fit.ts`). Peso y volumen se evalúan de forma **independiente**, no como un
  único porcentaje combinado.
- Los pedidos que no caben se devuelven en un array `excluidos` que la UI muestra como
  tales, quedando disponibles para re-incluir o reasignar (`capacity-fit.ts`
  `optimizarConCapacidad` propaga `excluidos`; `use-pedidos-ruta.ts`
  `setExcluidosPorCapacidad`).
- Sin vehículo seleccionado, la optimización corre sin recorte por capacidad (solo ordena
  la secuencia) (`capacity-fit.ts` `optimizarConCapacidad`, rama `if (!vehiculo)`).

*Estado del código: implementado. Los márgenes son constantes hardcodeadas, no
parametrizables — ver NFR11/OQ-10 en `requirements.md`.*

---

## US-3 — Anclar pedidos obligatorios

Como **Planificador de Rutas**, quiero anclar pedidos que deben ir sí o sí en la
secuencia, para que el bin-packing nunca los excluya aunque no sea lo óptimo en espacio.

**Criterios de aceptación:**
- Los pedidos anclados se colocan **primero** (se "sientan" antes de aplicar el greedy al
  resto), y el resto de la capacidad se llena largest-first con los pedidos no anclados
  (`capacity-fit.ts` `seleccionarPorCapacidad`, partición `fijos`/`resto`).
- Antes de permitir anclar, el sistema valida que el pedido nuevo más los ya anclados no
  superen los márgenes 85/95 del vehículo; si excede, la acción se bloquea
  (`capacity-fit.ts` `excedeCapacidadAlAnclar`; `page.tsx` `handleToggleAncla` →
  `toggleAnclaConValidacion` con `vehiculoSeleccionado`).
- Los anclajes se resetean al cambiar de viaje (`page.tsx` `handleSetViajeId` →
  `limpiarAnclas`).

*Estado del código: implementado (`capacity-fit.ts`, `use-pedidos-anclados.ts`).*

---

## US-4 — Optimizar la secuencia de paradas (nearest-neighbor + 2-opt)

Como **Planificador de Rutas**, quiero que el sistema ordene las paradas cerca del
recorrido óptimo, para minimizar distancia y tiempo sin calcularlo a mano.

**Criterios de aceptación:**
- El sistema construye la secuencia con **vecino más cercano** sobre la matriz de
  distancias (US-5) y luego la mejora con **2-opt** sobre ruta abierta (sin volver al
  depósito), invirtiendo segmentos mientras acorten el recorrido — mejora típica ~10-15 %
  (`optimize-stops.ts` `optimizarParadas` + `dosOpt`).
- El 2-opt está acotado: máximo 30 pasadas, O(n²) por pasada, se detiene cuando no hay
  mejora — suficiente para ≤50 paradas (`optimize-stops.ts` `dosOpt`, bucle
  `pasada < 30`).
- Los pedidos **sin coordenadas** (excepciones) se colocan al final de la secuencia,
  nunca se descartan (`optimize-stops.ts` `optimizarParadas` separa `conCoords`/`sinCoords`
  y concatena `sinCoords` al final).
- Con menos de 2 pedidos geolocalizados, se ordena todo por zona/ciudad como fallback
  (`optimize-stops.ts` `porZona`).
- El planificador puede reordenar manualmente arrastrando paradas después de la
  optimización (`use-pedidos-ruta.ts` `reordenarParadas`).
- La optimización corre sobre el pool completo del viaje (`pedidosRuta`), no solo lo
  seleccionado — así rellena hasta la capacidad aunque el usuario haya quitado pedidos
  (`use-pedidos-ruta.ts` `optimizarRuta`).

*Estado del código: implementado. Techo documentado: nearest-neighbor + 2-opt, no VRP
exacto (ADR-0001).*

---

## US-5 — Matriz de distancias reales por calle (OSRM, una sola llamada)

Como **sistema**, quiero calcular en una sola llamada la matriz N×N de distancias reales
por calle entre todos los pedidos, para que la optimización use recorrido real y no línea
recta.

**Criterios de aceptación:**
- Se pide la matriz completa al endpoint `/table/v1/driving` de OSRM con
  `annotations=distance,duration`, una sola vez por ciclo de optimización, no par por par
  (`distance-matrix.ts` `matrizOsrm`; `use-pedidos-ruta.ts` `optimizarRuta` llama
  `construirMatrizDistancias` una vez por click).
- La llamada usa `AbortController` con timeout de **5000 ms** (`distance-matrix.ts`
  `OSRM_TIMEOUT_MS`).
- Si OSRM no responde, devuelve error o hay <2 coordenadas, cae automáticamente a
  **haversine × 1.35** (factor de rodeo), de forma transparente (`distance-matrix.ts`
  `DETOUR_FACTOR`, `matrizHaversine`, `construirMatrizDistancias`).
- La matriz expone tanto distancia (km) como duración (min); en el fallback haversine la
  duración se estima a 30 km/h (`distance-matrix.ts` `ASSUMED_SPEED_KMH`).
- La instancia OSRM se elige por país activo (CR vs. VE son grafos separados), con override
  por env `VITE_OSRM_URL_CR` / `VITE_OSRM_URL_VE` (`osrm-config.ts` `osrmBaseUrl`).

*Estado del código: implementado con OSRM auto-hospedado. Coexiste un prototipo Google Maps
sin integrar (`src/lib/routePlanning/`) — fuente definitiva sin decidir (FR5/OQ-7).*

---

## US-6 — Geocodificar clientes sin coordenadas (capa Nominatim)

Como **Planificador de Rutas**, quiero que los pedidos de clientes que el WMS no trae
georreferenciados igual entren al mapa y al optimizador, para no perder paradas por falta
de coordenadas.

**Criterios de aceptación:**
- Al cargar los pedidos de un viaje, si un pedido no trae lat/lng, el sistema las rellena
  desde una capa de coordenadas pre-geocodificadas por cliente y marca el pedido
  `geo_approx` (`eflow-api.ts` `conGeocode`; `geocode.ts` `geocodeCliente`).
- La capa se resuelve por clave `<pais>:<customerId>` desde un JSON estático embebido
  (`geocode.ts` sobre `geocode.json`); las coordenadas fueron generadas offline con
  **Nominatim self-hosted** por `scripts/geocode-clientes.py`, con precisión `admin`
  (centroide de distrito/ciudad, no puerta) — no es una llamada en vivo a Nominatim desde
  la app.
- Un pedido con coordenadas propias no se toca; solo se geocodifica el que llega sin
  ellas (`eflow-api.ts` `conGeocode`, guard `if (p.delivery_latitude != null ...) return p`).

*Estado del código: implementado como capa offline (`geocode.json`, ~900 entradas CR+VE).
Ver `docs/work/2026-09/2026-09-16-geocoding-nominatim.md`.*

---

## US-7 — Reparto de flota multi-vehículo

Como **Coordinador de Flota**, quiero repartir el pool de pedidos de un viaje entre varios
vehículos cuando uno solo no alcanza, para no armar cada ruta manualmente vehículo por
vehículo.

**Criterios de aceptación:**
- El sistema ordena los vehículos configurados (slots) de **mayor a menor capacidad de
  peso** y los llena secuencialmente, reutilizando el mismo bin-packing de US-2 por
  vehículo, pasando el sobrante al siguiente (`fleet-split.ts` `repartirEntreFlota`,
  `slots.sort((a,b) => b.vehiculo.capacity_weight - a.vehiculo.capacity_weight)`).
- Cada slot recibe su porción de pedidos ya optimizada en secuencia con el algoritmo de
  US-4 (`fleet-split.ts` `repartirEntreFlota` → `optimizarParadas`).
- Los pedidos que no caben en ningún vehículo se reportan explícitamente como
  `sinAsignar`, no se pierden en silencio (`fleet-split.ts` `ResultadoReparto.sinAsignar`).
- El sistema puede **sugerir** la menor cantidad de vehículos cuya capacidad combinada
  cubra el peso y volumen del pool (mayor capacidad de peso primero) y calcular el reparto
  de una (`fleet-suggest.ts` `sugerirVehiculos`; `use-flota-split.ts` `sugerirFlota`).
- No se puede agregar el mismo vehículo dos veces a los slots (`use-flota-split.ts`
  `addSlot`).

*Estado del código: implementado. El reparto y la sugerencia priorizan por **capacidad de
peso descendente**; **no** hay lógica de "flota propia primero" en esta rama (los tipos
tienen `carrier_id` en `Vehiculo`, pero ni `fleet-split.ts` ni `fleet-suggest.ts` lo usan
para priorizar).*

---

## US-8 — Días de ruta por transportista/país

Como **Planificador de Rutas**, quiero ver qué días de la semana sale cada ruta según el
sistema del transportista/país, para saber qué rutas aplican al día que estoy planificando.

**Criterios de aceptación:**
- El módulo soporta múltiples sistemas de días de ruta declarados en un registro
  config-driven; agregar uno nuevo es una entrada más, sin tocar componente ni página
  (`route-systems/registry.ts` `ROUTE_SYSTEMS`, `getRouteSystem`).
- **EFLOW** (`RUTA_DIA_AB`) se lee en vivo por país y marca los días en que la ruta sale;
  no distingue carga/entrega (`route-systems/eflow-dias.ts` `cargarRutasDias`, mapea
  `day_ids` a columnas lunes..domingo).
- **COFERSA** se lee de un JSON estático y expande su calendario semanal con reglas de
  negocio: cita previa a nivel de fila, GAM sin split explícito = lunes–viernes "ambos",
  resto por split carga/entrega (`route-systems/parse.ts` `expandirDiasCofersa`,
  `parseDias`; `route-systems/cofersa-dias.ts` `toCofersaDia`, `rutasActivas`).
- El parseo de días tolera texto libre: listas separadas por `-`/`,`/`/`/espacio y rangos
  "X a Y", sin acentos, singular (`route-systems/parse.ts` `parseDias`).

*Estado del código: implementado (registro EFLOW en vivo + COFERSA estático + Asignación
de Viajes). Cubierto por `cofersa-dias.test.ts`, `parse.test.ts`.*

---

## US-9 — Modo demo con datos perfectos

Como **Planificador de Rutas**, quiero un modo demo con datos ficticios completos
(direcciones, pesos, volúmenes, capacidades), para presentar el módulo al cliente aunque
la data real de EFLOW no traiga esos campos.

**Criterios de aceptación:**
- Un toggle en el header activa el modo demo, que recarga los hooks del módulo
  (`page.tsx` `cambiarDemo` → `setDemo`; dependencias `demo` en `useViajes`/`useCatalogos`).
- Con demo activo, viajes, pedidos y catálogos se sirven desde una capa de datos ficticios
  en vez de EFLOW/Supabase (`demo.ts` `demoViajes`, `demoCatalogos`,
  `demoPedidosDeViaje`; `eflow-api.ts` fetchers con guard `if (demoActual) return demo...`).
- Los datos demo se rebanan por país y compañía activas (`demo.ts` `slices`, `merge`).
- Los pedidos de un viaje demo se leen del propio viaje (`demo.ts` `demoPedidosDeViaje`).

*Estado del código: implementado (`demo.ts`, `demo-data.json`). Cubierto por `demo.test.ts`.*

---

## US-10 — Generar y persistir la secuencia de paradas

Como **Planificador de Rutas**, quiero confirmar la secuencia armada y que quede guardada
con su transportista, conductor, vehículo y fecha, para dejarla lista para el despacho.

**Criterios de aceptación:**
- La generación solo se dispara desde el flujo Nueva Ruta con viaje, vehículo y pedidos
  en la secuencia; al terminar limpia el formulario y salta a la pestaña "Rutas Generadas"
  (`page.tsx` `handleGenerarRuta`).
- En modo mock, la secuencia se persiste en `localStorage` con un número
  `RT-MOCK-<timestamp>`, totales de peso/volumen y estado por defecto
  (`generar-ruta-mock.ts` `generarRutaMock`, `STORAGE_KEY = 'rutas_generadas'`).
- El camino de escritura real (Supabase) existe en código pero **nunca corrió con éxito**
  por RLS/login roto — ver FR7/NFR10 en `requirements.md`.

*Estado del código: implementado y verificado solo en modo mock.*

---

## US-11 — Ver, editar y eliminar secuencias generadas

Como **Jefe de Almacén**, quiero revisar las secuencias ya generadas y editarlas o
eliminarlas ante cambios de último minuto, antes del despacho.

**Criterios de aceptación:**
- La pestaña "Rutas Generadas" lista las secuencias persistidas (`page.tsx` tab
  `generadas` → `RutasGeneradas`; `use-rutas-generadas.ts`; `generar-ruta-mock.ts`
  `listRutasGeneradas`).
- Se puede editar transportista, conductor, vehículo, fecha y pedidos de una secuencia; al
  guardar se recalculan los totales de peso/volumen (`generar-ruta-mock.ts`
  `actualizarRutaGenerada`; `EditarRutaModal.tsx`).
- Se puede eliminar una secuencia (individual o en lote) y cambiar su estado
  (`generar-ruta-mock.ts` `eliminarRutaGenerada`, `cambiarEstadoRutaGenerada`;
  `use-rutas-generadas.ts` `eliminarVarias`/`cambiarEstadoVarias`).

*Estado del código: implementado íntegramente sobre `localStorage` — no hay backend real
para esta vista (ver FR9 en `requirements.md`).*

---

## Notas de trazabilidad (divergencias con el brief de origen)

Dos supuestos del brief que originó estas historias **no coinciden** con el código de esta
rama; se documentó lo que el código realmente hace:

1. **"Reparto de flota, flota propia primero (`compararPrioridadFlota`)"** — no existe: no
   hay función `compararPrioridadFlota` ni ninguna priorización por flota propia/tercerizada
   en esta rama. `fleet-split.ts` y `fleet-suggest.ts` ordenan **por capacidad de peso
   descendente**. Documentado así en US-7.
2. **Flujo automático de `main`** — esta rama no lo tiene (el propio brief lo advierte); no
   existe el archivo `docs/work/2026-09/2026-09-23-planificacion-flujo-automatico.md` en
   este checkout. Las historias documentan el flujo **manual multi-pestaña** que sí existe.

## Fuentes

- Código de la rama `planif-hu-docs`, `src/pages/planificacion/`: `page.tsx`,
  `use-viajes.ts`, `use-pedidos-ruta.ts`, `use-flota-split.ts`, `capacity-fit.ts`,
  `optimize-stops.ts`, `fleet-split.ts`, `fleet-suggest.ts`, `distance-matrix.ts`,
  `osrm-config.ts`, `geocode.ts`, `eflow-api.ts`, `demo.ts`, `time-windows.ts`,
  `generar-ruta-mock.ts`, `types.ts`, `route-systems/{registry,eflow-dias,cofersa-dias,parse}.ts`.
- `requirements.md`, `end-user-roles.md`, `technical-design.md` (mismo folder).
- `docs/work/2026-09/2026-09-16-geocoding-nominatim.md` (capa de geocoding Nominatim).
