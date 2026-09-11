# Requerimientos — Módulo de Planificación de Rutas

Intent: `260825-route-planning-reqs`. Etapa: Requirements Analysis (Inception). Proyecto
**brownfield** `sto_tms_olo`. Idioma: español.

**Historial de este documento**: reemplaza una versión previa en formato de matriz
tabular (revisada y en estado READY el 2026-08-25, sin narrativa de actores/glosario/
restricciones). Esta versión adopta redacción narrativa estilo user-story, alineada al
formato usado en `documents/OC26007 - Documento de Requerimientos - Módulo OMS -
Iteración 2.pdf` (Eduardo), para facilitar la lectura cruzada entre ambos módulos
satélite del TMS. El bloque `Acceptance (BDD)` explícito solo se agrega donde el
comportamiento tiene ramas de negocio no triviales que ameritan un escenario formal
(FR1, FR2, FR3, FR4, FR16); el resto de los FR son suficientemente puntuales y
verificables con sus bullets numerados por sí solos, sin necesitar BDD adicional. Pasó
además por una revisión en vivo con Ana (líder de proyecto, 2026-08-31) que corrigió
terminología y agregó requerimientos — ver Review al final.

A diferencia del OMS (spec previa a construcción), Planificación de Rutas es
**brownfield en construcción activa** — no un módulo terminado. Los 22 FR de la versión
anterior estaban marcados "Implementado" sin distinguir qué corre contra backend real y
qué corre íntegramente sobre mocks encadenados; corregido acá.

**Corrección de terminología (reunión con Ana, líder de proyecto, revisión del documento
sobre esta base) — léase antes de seguir**: "Ruta" y "Secuencia de Paradas" **no son lo
mismo**, y este documento (como el resto del proyecto) venía usándolos como sinónimos.
Una **ruta** es el concepto estático del negocio: sale martes/jueves, es GAM o rural, tiene
horario fijo — vive en el Calendario de Rutas del OMS, no la crea ni la edita
Planificación. Lo que este módulo arma, optimiza, genera y edita es una **secuencia de
paradas** (stop sequence): la asignación concreta de pedidos + orden + transportista +
conductor + vehículo para la ejecución de una ruta en una fecha dada. Donde este documento
dice "generar/editar/eliminar una ruta", léase "generar/editar/eliminar una secuencia de
paradas" — la corrección terminológica completa (renombrar en código, UI y el resto de los
FR) queda pendiente como tarea de seguimiento, no se hizo un rename masivo del documento
todavía.

**Léase antes que nada** (ver `MOCKING.md`, fuente de verdad de este estado): el login
real nunca funcionó en esta rama (auth mockeado con `VITE_MOCK_AUTH`), las tablas
`trips`/`trip_orders` que alimentan la selección de viaje **no existen todavía en
Supabase** (100 % mock, sin condición de fallback), y el camino de escritura real
(`generar-ruta-api.ts`) **existe en código pero nunca se ejecutó con éxito** porque RLS
bloquea cualquier escritura sin sesión real. "Implementado" en este documento significa
**"UI y lógica de negocio funcionan de punta a punta contra datos mock"**, no "corre en
producción contra el backend real" — se marca explícitamente cuándo sí hay verificación
contra Supabase real (catálogos de lectura) y cuándo no (todo lo demás).

## Análisis de intención

El objetivo de negocio es **automatizar el armado de rutas de entrega** a partir de los
viajes que el WMS Iflow despacha ya agrupados: dado un conjunto de pedidos con destino,
peso y volumen, decidir qué pedidos caben en qué vehículo, en qué orden se entregan, y
persistir esa decisión como una ruta operativa lista para el despacho físico.

Planificación es el módulo **inmediatamente downstream** del OMS en el flujo de datos: el
OMS decide *cuándo* alistar un pedido y con qué prioridad; Planificación decide *cómo* se
agrupan y secuencian los pedidos ya alistados dentro de una ruta. Ninguno de los dos
reasigna la relación ruta↔pedido — esa relación nace en el WMS y ambos módulos la
consumen como dato de entrada (Reunión 2026-08-18, confirmado también como restricción de
alcance del OMS en su propio documento de requerimientos, sección "Fuera de alcance").

Lo que Planificación **busca lograr** (metas, no features):

- Reemplazar el armado manual de rutas (hoy a criterio del planificador, sin verificación
  sistemática de capacidad) por un cálculo determinístico que nunca sobrecargue un
  vehículo por encima de los márgenes de seguridad legales/operativos.
- Minimizar el recorrido de cada ruta con una secuencia de paradas cercana al óptimo,
  usando distancias reales por calle en vez de líneas rectas.
- Escalar de un vehículo a una flota completa sin cambiar de herramienta ni de algoritmo
  base.
- Degradar con gracia ante cualquier falla de servicio externo (OSRM, Supabase) sin
  bloquear al planificador — nunca un error fatal, siempre un fallback transparente.

**Alcance de Planificación** (de `team-roles.md` → mapa de dependencias inter-módulo):
recibir pedidos ya agrupados y priorizados, decidir asignación pedido↔vehículo, secuencia
de paradas, y persistir la ruta con transportista/conductor/vehículo/fecha asignados.
**Fuera de alcance**: generar o priorizar pedidos (OMS), ejecutar físicamente la ruta o
trackearla en vivo (módulo de tracking, futuro), calcular tarifas de flete (Liquidación,
Dylan), y la logística de devoluciones/recolecciones (módulo de Devoluciones, en
levantamiento — Reunión 2026-08-24).

## Actores

| Rol | Responsabilidad en Planificación |
|-----|-----------------------------------|
| **Planificador de Rutas** | Arma la secuencia de paradas día a día: selecciona el viaje, incluye/excluye pedidos, optimiza la secuencia, ajusta manualmente y la genera. Usuario primario del módulo (flujo "Nueva Ruta"). |
| **Coordinador de Flota** | Distribuye pedidos de un viaje entre múltiples vehículos cuando excede la capacidad de uno solo; configura slots y genera secuencias de paradas en batch (flujo "Reparto de Flota"). En operaciones pequeñas puede ser la misma persona que el Planificador. Rol nuevo, sin precedente en el OMS. |
| **Jefe de Almacén** | Supervisa las secuencias de paradas ya generadas, las edita o elimina ante cambios de último minuto (flujo "Rutas Generadas"). Rol ya cerrado y compartido con el OMS — visibilidad, sin bloquear el flujo. |
| **Administrador de Módulo** | Configura los catálogos base (vehículos, conductores, transportistas, rutas tipo) consumidos por Planificación. No opera secuencias de paradas día a día. Rol transversal, ya cerrado en el OMS. |

**Nota de coherencia inter-módulo**: los roles Jefe de Almacén y Administrador de Módulo
son deliberadamente los mismos nombres y alcance que en el documento de requerimientos del
OMS — ambos módulos comparten el mismo mapa de roles operativos del negocio, no cada
módulo inventa el suyo.

**Duda abierta planteada por Ana (líder de proyecto) sin cerrar**: el OMS tiene un rol
"Operador Logístico" cuya responsabilidad descrita ("mantener actualizado el catálogo de
rutas para que el motor de priorización cuente con fuentes de verdad confiables — crea,
actualiza y desactiva rutas") suena cercana al "Planificador de Rutas" de este módulo,
pero no es evidente que sean la misma persona: uno mantiene el calendario/catálogo de
rutas (antes de que el pedido esté listo), el otro arma la secuencia de paradas una vez
que el pedido ya está listo para despacho. **No se cerró en la reunión** — ver OQ-9.

Sin rol de "Conductor" en este módulo: el conductor se **asigna** a la ruta pero no opera
la pantalla de planificación; su interfaz es el futuro módulo de ejecución/tracking.

## Glosario

- **Ruta**: concepto **estático** del negocio — un patrón fijo de despacho (ej. "GAM
  Norte sale todos los días", "Rural Sur sale jueves y viernes"), con sus días de salida
  y horario definidos en el Calendario de Rutas (mantenido por el Operador de Despacho del
  OMS). Planificación no crea ni edita rutas, solo las **consume** como dato de
  configuración al armar una secuencia de paradas.
- **Secuencia de paradas** (*stop sequence*): lo que Planificación **sí** genera —la
  asignación concreta de pedidos + orden de entrega + transportista + conductor +
  vehículo, para ejecutar una ruta en una fecha específica. Es el término correcto para lo
  que este documento venía llamando "ruta generada"/"ruta" en varios FR (ver nota de
  terminología al inicio del documento).
- **Viaje**: agrupación de pedidos despachados por el WMS Iflow con ruta tipo
  pre-asignada. Unidad de entrada de Planificación — el TMS no reasigna la relación
  ruta↔pedido que trae el viaje.
- **Pedido de excepción**: pedido cuya dirección de entrega real difiere de la registrada
  y llega sin coordenadas (comentario libre del WMS). Se excluye del cálculo de distancia
  y optimización, pero nunca se descarta de la ruta — se lista al final, con su dirección
  real visible para el operador.
- **Bin-packing / Selección por capacidad**: algoritmo first-fit-decreasing que decide qué
  pedidos caben en un vehículo dado sin superar los márgenes de seguridad de peso y
  volumen.
- **Margen de seguridad**: límite de uso de capacidad del vehículo — 85 % de peso (base
  legal, Decreto N.º 31363-MOPT Costa Rica) y 95 % de volumen (restricción operativa de
  empaque), aplicados de forma independiente, no como un único porcentaje combinado.
- **Pedido anclado**: pedido marcado por el planificador como obligatorio en la ruta,
  independientemente del resultado del bin-packing; se coloca primero en la selección.
- **Optimización de paradas**: reordenamiento de la secuencia de entrega por el algoritmo
  Nearest-Neighbor sobre una matriz de distancias real (no línea recta).
- **Matriz de distancias N×N**: una tabla de distancias entre paradas, igual que las
  tablas de km entre ciudades que traen los mapas de carretera — filas y columnas son las
  paradas, y cada casillero es la distancia real manejando entre esa fila y esa columna.
  Se pide **una sola vez, todas las combinaciones juntas** al endpoint `/table` de OSRM
  (auto-hospedado) en vez de preguntar par por par ("¿cuánto hay de A a B?", "¿de A a
  C?"...); así el sistema hace una sola llamada y ya tiene todo lo que necesita para
  decidir el mejor orden de entrega. Si OSRM no responde, cae a distancia haversine × 1.35
  (factor de rodeo) — línea recta corregida, para no dejar el cálculo sin respuesta.
- **Pool de pedidos**: el conjunto total de pedidos de un viaje disponibles para repartir,
  antes de decidir a qué vehículo va cada uno — en el Reparto de Flota no hay pedidos
  pre-asignados a un vehículo específico, están todos juntos en un solo grupo del que el
  bin-packing (FR2) va sacando para llenar cada slot.
- **Reparto de flota**: distribución del pool de pedidos de un viaje entre N vehículos
  (slots) configurados, reutilizando el mismo bin-packing por vehículo.
- **Slot**: casillero de configuración del flujo "Reparto de Flota" que representa un
  vehículo a llenar — **no** es la tarima/paleta física (la plataforma de madera donde se
  arma físicamente la carga de un cliente en el almacén, movida con paleta hidráulica o
  montacargas). Confusión real señalada en revisión: "slot" es un término puramente de
  interfaz para este flujo específico, no un concepto físico ni logístico estándar de la
  industria — no confundir con "tarima"/"paleta" (el objeto físico) ni asumir que aplica
  en otras partes del sistema. Cada slot se configura con un vehículo (obligatorio) y,
  opcionalmente, un conductor y un transportista. El planificador agrega o quita slots
  dinámicamente antes de ejecutar el reparto; cada slot recibe su propia porción de
  pedidos vía bin-packing (FR2) y su propia secuencia optimizada (FR4).
- **Pickup / Recolección**: operación en la que el vehículo recoge mercancía del cliente
  en vez de entregarla — el flujo de mercancía invertido respecto a una entrega
  (*delivery*). Término aplicable y estándar también en logística inversa (confirmado en
  reunión): cuando el pickup es de un cliente devolviendo mercancía hacia el centro de
  distribución, se llama específicamente **reverse pickup**, para distinguirlo de una
  recolección normal (ej. recoger de un proveedor, que es forward, no inversa).
- **Delivery / Entrega**: dejar mercancía en la parada — la operación normal, opuesta al
  pickup.
- **ETA (hora estimada de llegada)**: hora calculada por parada caminando el reloj desde
  las 8:00 a.m. usando duraciones reales de manejo (OSRM) más 5 min de tiempo de servicio
  fijo por parada.
- **Fuera de ventana**: parada cuya ETA calculada cae fuera de la ventana de entrega
  8:00–19:00; se marca visualmente y dispara una advertencia, sin bloquear la generación
  de la ruta.
- **Generación en batch**: confirmar de una sola vez todas las rutas de un reparto de
  flota (una por slot), en vez de repetir "Generar Ruta" vehículo por vehículo. El sistema
  las crea una tras otra mostrando el avance ("1 de 3", "2 de 3"...) y todas terminan
  apareciendo juntas en "Rutas Generadas".
- **"Ruta generada"**: nombre actual en UI/código para el resultado persistido de un ciclo
  de planificación — en realidad es una **secuencia de paradas** (ver entrada arriba), no
  una ruta. Se guarda en `localStorage` (modo mock) o en Supabase (modo real) según
  `VITE_MOCK_AUTH`. El nombre queda documentado tal cual existe hoy en el sistema; el
  rename a "Secuencia de Paradas Generada" es trabajo de seguimiento, no aplicado todavía.
- **OMS**: sistema satélite upstream que calcula cuándo debe alistarse cada pedido y con
  qué prioridad, antes de que llegue al lago de datos del TMS que Planificación consulta
  (ver `documents/OC26007 - Documento de Requerimientos - Módulo OMS - Iteración 2.pdf`).

## Requerimientos funcionales

### FR1 — Selección de viaje y carga de pedidos

Como **Planificador de Rutas**, quiero seleccionar un viaje despachado por el WMS y ver de
inmediato sus pedidos asociados, para empezar a armar la ruta sin tener que buscar pedidos
uno por uno.

- FR1.1 Al seleccionar un viaje, el sistema carga todos sus pedidos con estado `pending` y
  todos quedan **incluidos en la ruta por defecto** — el WMS ya decidió que van juntos, el
  planificador solo puede excluir explícitamente, no partir de cero.
- FR1.2 Cada pedido muestra: número de orden, cliente, dirección, zona, peso y volumen.
- FR1.3 **Comportamiento actual**: no existe todavía la tabla `trips`/`trip_orders`, así
  que el sistema no llega a consultarla ni a evaluar "0 filas" — retorna directo los
  viajes sintéticos, sin intervención del usuario ni mensaje de error (passthrough
  incondicional, no un fallback condicionado a una consulta real). **Comportamiento
  objetivo** una vez exista la tabla (ver OQ-8): si la consulta real retorna 0 filas, debe
  activarse el mismo fallback de forma automática y transparente — mismo patrón que
  `catalogos-api.ts`/`pedidos-api.ts` ya implementan hoy contra tablas que sí existen.
- FR1.4 Al cambiar de viaje, la selección de pedidos y cualquier exclusión manual del
  viaje anterior se reemplaza por completo — no se arrastra estado entre viajes.

Acceptance (BDD):
- Dado un viaje con 5 pedidos, When el planificador lo selecciona, Then los 5 quedan
  incluidos en la ruta sin acción manual adicional.
- Dado un viaje seleccionado con un pedido excluido manualmente, When el planificador
  selecciona otro viaje, Then la ruta en construcción muestra únicamente los pedidos del
  nuevo viaje, todos incluidos.

*Estado: Implementado sobre mock, sin backend real.* Las tablas `trips`/`trip_orders`
(diseñadas en la Reunión 2026-08-18) **no existen todavía en Supabase** — no hay condición
de fallback como en otros catálogos, `viajes-api.ts` retorna directo los 4 viajes
sintéticos de `fallback-viajes.ts`. No hay ningún viaje real que este flujo pueda cargar
hoy. Fuente: `use-viajes.ts`, `viajes-api.ts`, `pedidos-api.ts`, `fallback-pedidos.ts`,
`use-pedidos-ruta.ts`; verificado en `e2e/planificacion-flujo.spec.ts` **contra el mock**.

### FR2 — Selección por capacidad (bin-packing)

Como **Planificador de Rutas**, quiero que el sistema decida automáticamente qué pedidos
caben en el vehículo seleccionado, para no exceder su capacidad legal ni operativa.

- FR2.1 El algoritmo ordena los pedidos por carga relativa descendente y los asigna
  secuencialmente (first-fit-decreasing).
- FR2.2 Ningún pedido incluido hace que el peso acumulado supere el 85 % de
  `capacity_weight` del vehículo, ni que el volumen acumulado supere el 95 % de
  `capacity_volume`.
- FR2.3 Los pedidos anclados (FR3) se colocan primero, antes de aplicar el algoritmo al
  resto.
- FR2.4 Los pedidos excluidos por capacidad se listan como tales y quedan disponibles para
  re-incluirse manualmente o reasignarse a otro viaje/vehículo.

Acceptance (BDD):
- Dado un vehículo con 1500 kg de capacidad y pedidos que suman 1985 kg, When se optimiza
  la ruta, Then el sistema excluye el/los pedido(s) necesario(s) para quedar bajo 1275 kg
  (85 %) y lo comunica visualmente.

*Estado: Implementado.* Fuente: `capacity-fit.ts`; ADR-0001 (margen 85 %/95 %); verificado
en `e2e/planificacion-flujo.spec.ts` (exclusión real de 1 de 5 pedidos por capacidad).

### FR3 — Pedidos anclados

Como **Planificador de Rutas**, quiero anclar pedidos que deben ir sí o sí en la ruta, para
que el bin-packing nunca los excluya aunque no sea lo óptimo en espacio.

- FR3.1 El sistema valida, antes de permitir anclar, que el pedido más los ya anclados no
  superen los límites de capacidad del vehículo seleccionado.
- FR3.2 Si la validación falla, la acción se bloquea con una advertencia — no se ancla un
  pedido que rompería la capacidad.
- FR3.3 Los anclajes persisten mientras la ruta esté en construcción y se resetean al
  cambiar de viaje (ver FR1.4).

*Estado: Implementado.* Fuente: `capacity-fit.ts` (`excedeCapacidadAlAnclar`),
`use-pedidos-anclados.ts`.

### FR4 — Optimización de secuencia de paradas

Como **Planificador de Rutas**, quiero que el sistema ordene las paradas de forma cercana
al recorrido óptimo, para minimizar distancia y tiempo de entrega sin tener que calcularlo
a mano.

- FR4.1 El sistema aplica Nearest-Neighbor sobre la matriz de distancias real (FR5) para
  producir la secuencia.
- FR4.2 Pedidos sin coordenadas (excepciones, ver Glosario) se colocan al final de la
  secuencia, nunca se descartan.
- FR4.3 El planificador puede reordenar manualmente por arrastre después de la
  optimización automática; el mapa y el ETA se recalculan al soltar.

Acceptance (BDD):
- Dado un pedido de excepción sin coordenadas dentro del viaje, When se optimiza la ruta,
  Then aparece como última parada de la secuencia, con su dirección real visible (no la
  registrada del cliente).

*Estado: Implementado.* Fuente: `optimize-stops.ts`; techo documentado ADR-0001 (~25 % más
largo que el óptimo teórico — Nearest-Neighbor, no VRP exacto); verificado end-to-end.

### FR5 — Matriz de distancias real (OSRM)

Como sistema, quiero calcular la matriz de distancias reales por calle entre todos los
pedidos de una ruta en una sola llamada, para que la optimización use datos de recorrido
real en vez de línea recta.

- FR5.1 Se consulta el endpoint `/table` de OSRM (auto-hospedado, `osrm.jesusaraujo.lat`)
  con timeout de 5000 ms.
- FR5.2 Si OSRM no responde a tiempo o falla, el sistema cae automáticamente a distancia
  haversine × 1.35 (factor de rodeo), de forma transparente para el usuario.
- FR5.3 La matriz se construye una sola vez por ciclo de optimización, no llamada por
  llamada entre cada par.

*Estado: Implementado con OSRM — pero es la solución provisoria, no la decidida.* No
existe todavía la tabla real `location_distances` (backfill planeado contra Google Maps).
Además, ya existe un **prototipo paralelo sin fusionar** que consume la Google Maps
Distance Matrix API real (`src/lib/routePlanning/build-matrices.ts` +
`google-distance-matrix.ts`), completamente fuera de `src/pages/planificacion/` y nunca
conectado a la UI activa — es el trabajo al que se refería Jean Carlo. **OSRM vs. Google
Maps como fuente definitiva de distancias no está decidido** (ver `MOCKING.md`); hoy
conviven dos implementaciones y solo una está integrada. Fuente: `distance-matrix.ts`,
`osrm-config.ts` (activo); `src/lib/routePlanning/*` (prototipo Google Maps, inactivo).

### FR6 — Reparto de flota multi-vehículo

Como **Coordinador de Flota**, quiero distribuir los pedidos de un viaje entre varios
vehículos cuando uno solo no alcanza, para no tener que armar cada ruta manualmente
vehículo por vehículo.

- FR6.1 El sistema ordena los vehículos configurados (slots) de mayor a menor capacidad de
  peso y los llena secuencialmente con el mismo bin-packing de FR2.
- FR6.2 Los pedidos de cada slot se optimizan en secuencia con el mismo algoritmo de FR4.
- FR6.3 Los pedidos que no caben en ningún vehículo se reportan explícitamente como
  `sinAsignar`, no se pierden silenciosamente.

*Estado: Implementado.* Backlog item #1 de ADR-0001, implementado 2026-08-12. Fuente:
`fleet-split.ts`, `FlotaSlotPicker.tsx`.

### FR7 — Generación y persistencia de ruta *(léase "secuencia de paradas" — ver nota de terminología)*

Como **Planificador de Rutas**, quiero confirmar la ruta armada y que quede guardada con su
transportista, conductor, vehículo y fecha, para que quede lista para el despacho físico.

- FR7.1 En modo mock (`VITE_MOCK_AUTH=true`), la ruta se persiste en `localStorage`. En
  modo real, se escribe a Supabase (`routes`, `dispatch_guides`, actualización de
  `orders`). La decisión se toma automáticamente según la variable de entorno, sin acción
  del usuario.
- FR7.2 El botón de generar solo se habilita cuando hay viaje, conductor y vehículo
  seleccionados, y al menos un pedido en la ruta.
- FR7.3 Al generar exitosamente, se muestra confirmación (toast) con el número de ruta y
  la cantidad de paradas, y la ruta aparece en la pestaña "Rutas Generadas".

*Estado: Implementado y verificado solo en modo mock; el camino real nunca se ejecutó con
éxito.* `generarRutaEnDb()` (escritura real a `routes`/`dispatch_guides`/`orders`) existe
en código y está referenciada correctamente desde `use-generar-ruta.ts`, pero **jamás
corrió exitosamente**: no hay ningún usuario real logueado en esta rama (el login está
roto, ver `MOCKING.md`) y toda escritura sin sesión real falla por RLS
("new row violates row-level security policy"). Es código escrito y nunca probado, no
backend funcionando. Fuente: `generar-ruta-mock.ts`, `generar-ruta-api.ts`,
`use-generar-ruta.ts`; verificado end-to-end únicamente en modo mock
(`e2e/planificacion-flujo.spec.ts` escribe a `localStorage`, nunca a Supabase).

### FR8 — Generación de rutas en batch (flota) *(léase "secuencias de paradas" — ver nota de terminología)*

Como **Coordinador de Flota**, quiero generar todas las rutas del reparto de flota en un
solo paso, para no repetir la confirmación vehículo por vehículo.

- FR8.1 El sistema itera sobre cada asignación del reparto y genera una ruta por vehículo
  con las mismas reglas de FR7, reportando avance durante la iteración.

*Estado: Implementado sobre el mismo camino mock que FR7* — mismas salvedades: llama a
`generarRutaEnDb()` por cada vehículo en modo real, nunca ejecutado con éxito. Fuente:
`use-generar-flota.ts`.

### FR9 — Edición y eliminación de ruta generada *(léase "secuencia de paradas" — ver nota de terminología)*

Como **Jefe de Almacén**, quiero poder editar o eliminar una ruta ya generada, para
corregir asignaciones ante cambios de último minuto antes del despacho.

- FR9.1 Se puede cambiar transportista, conductor, vehículo o fecha de entrega, y eliminar
  paradas individuales de la secuencia.
- FR9.2 Se puede eliminar la ruta completa; la eliminación se persiste en el mismo store
  (mock o real) usado para generarla.
- FR9.3 Ninguna confirmación destructiva usa diálogos nativos del navegador (`confirm()`);
  se usa confirmación inline o toast.

*Estado: Implementado, pero íntegramente sobre `localStorage` — no existe backend real
para esta vista.* "Rutas Generadas" **siempre** lee de `localStorage`, incluso fuera de
modo mock (`use-rutas-generadas.ts`) — no hay tabla `routes` consultable ni endpoint
equivalente, y el sistema real de referencia (Trade) tampoco tenía esta pantalla. Editar o
eliminar una ruta aquí no toca ninguna base de datos ni afecta a otros usuarios del
equipo — es una vista de un solo navegador. Fuente: `EditarRutaModal.tsx`,
`use-rutas-generadas.ts`, `RutasGeneradas.tsx`.

### FR10 — Mapa interactivo y geometría real de ruta

Como **Planificador de Rutas**, quiero ver la ruta sobre un mapa con el trayecto real por
calles, para verificar visualmente que el recorrido tiene sentido antes de confirmar.

- FR10.1 El mapa (Leaflet + OpenStreetMap) muestra un marcador numerado por parada y una
  polyline con la geometría real del trayecto (OSRM `/route`, `overview=full&geometries=
  geojson`, debounce de 400 ms).
- FR10.2 Si OSRM falla, la polyline cae a línea recta entre paradas consecutivas, de forma
  transparente.
- FR10.3 Click en un marcador abre el detalle del pedido; doble-click en una parada de la
  lista hace `flyTo` animado al marcador correspondiente.

*Estado: Implementado.* Fuente: `RutaMapaPreview.tsx`, `route-geometry.ts`,
`ParadaDetalleModal.tsx`; verificado visualmente en las capturas de la suite e2e.

### FR11 — Excepciones de pedido (sin coordenadas)

Como **Planificador de Rutas**, quiero identificar de un vistazo los pedidos cuya dirección
real de entrega difiere de la registrada, para no perder esa información al armar la ruta.

- FR11.1 Un pedido con `is_exception = true` y `exception_address_raw` muestra la
  dirección real de entrega en un recuadro visible, tanto en el panel de pedidos
  disponibles como en el panel de la ruta en construcción — no solo un badge genérico.
- FR11.2 Estos pedidos se excluyen del cálculo de distancia/optimización (FR4, FR5) pero
  nunca se descartan de la ruta.

*Estado: Implementado — corregido 2026-08-31.* Hasta esa fecha, `exception_address_raw` se
capturaba en el dato pero no se renderizaba en ningún componente; el operador solo veía un
badge "Excepción" sin saber a dónde entregar realmente. Fuente: `PedidoCard.tsx`,
`ParadaCard.tsx`, `distance-matrix.ts`, `optimize-stops.ts`; regresión cubierta en
`e2e/planificacion-flujo.spec.ts`.

### FR12 — Barra de capacidad visual

Como **Planificador de Rutas**, quiero ver cuánta capacidad del vehículo estoy usando en
tiempo real, para anticipar si un pedido más va a exceder el margen antes de intentar
incluirlo.

- FR12.1 Se muestra una barra dual (peso/volumen) que cambia de color por umbral: verde
  (≤ 70 %), amarillo (70–85 % peso / 70–95 % volumen), rojo (> 85 % peso / > 95 % volumen).
- FR12.2 Se actualiza reactivamente con cada cambio de selección de pedidos o de vehículo.

*Estado: Implementado.* Fuente: `CapacityBar.tsx`.

### FR13 — Navegación por flujos (pestañas)

Como **Planificador de Rutas** o **Coordinador de Flota**, quiero moverme entre "Nueva
Ruta", "Reparto de Flota" y "Rutas Generadas" sin perder el trabajo en curso de las otras
pestañas, para poder consultar rutas ya hechas mientras armo una nueva.

- FR13.1 El estado de cada pestaña es independiente; cambiar de pestaña no reinicia las
  otras.

*Estado: Implementado.* Fuente: `page.tsx`, `PlanificacionTabs.tsx`.

### FR14 — Configuración de ruta (catálogos)

Como **Planificador de Rutas**, quiero elegir transportista, conductor, vehículo y fecha
desde catálogos reales, para no tener que escribir esos datos a mano en cada ruta.

- FR14.1 Los catálogos (vehículos, conductores, transportistas) se cargan desde Supabase
  al abrir el módulo, filtrados por la organización del usuario en sesión.
- FR14.2 El conductor se filtra por transportista seleccionado cuando aplica.
- FR14.3 El vehículo seleccionado define los límites de capacidad usados por FR2 y FR12.
- FR14.4 Si los catálogos vienen vacíos para la organización (sin datos seedeados), el
  formulario lo refleja sin romper el resto del flujo — el planificador puede seguir
  armando la ruta y optimizando, solo no puede generarla hasta tener conductor y vehículo.

*Estado: parcialmente real — el único punto de este módulo verificado contra Supabase de
producción.* Vehículos, conductores y transportistas **sí se leen de la base real** (se
verificó en `e2e/planificacion-flujo.spec.ts`: 5 conductores y 5 vehículos reales
devueltos por Supabase para la organización mock). El catálogo de **rutas
(`route_types`)** es la excepción: tiene una política RLS más estricta y suele devolver 0
filas sin sesión real, cayendo a `fallback-rutas.ts`. Es decir: este módulo lee catálogos
reales, pero nunca escribe nada real (ver FR7). Fuente: `catalogos-api.ts`,
`use-catalogos.ts`, `RouteConfigForm.tsx`, `fallback-rutas.ts`.

### FR15 — Cálculo de ETA y alerta de ventana horaria

Como **Planificador de Rutas**, quiero saber a qué hora estimada llega cada parada y si
alguna cae fuera del horario de entrega, para poder ajustar la ruta antes de confirmarla.

- FR15.1 Al optimizar, se calcula la ETA de cada parada caminando el reloj desde las 8:00
  a. m. con la duración real de manejo (OSRM `/table`, anotación `duration`) más 5 min de
  servicio fijo por parada.
- FR15.2 Una parada cuya ETA cae fuera de 8:00–19:00 se marca visualmente (badge rojo,
  borde/fondo rojo) y dispara un toast de advertencia con el conteo de paradas afectadas.
- FR15.3 Pedidos sin coordenadas no cuentan como fuera de ventana (no tienen ETA
  calculable).

*Estado: Implementado.* Backlog item #2 de ADR-0001, implementado 2026-08-25. Fuente:
`time-windows.ts`, `distance-matrix.ts` (`duracionMin`), `ParadaCard.tsx`.

### FR16 — Consideración de pickups/devoluciones en la secuencia de paradas

Como **Planificador de Rutas**, quiero que las devoluciones (recolecciones) ya conocidas
se incluyan en la secuencia de paradas junto con las entregas, y distinguirlas visualmente,
para no tener que coordinarlas por fuera del módulo. **Levantado en reunión con Ana
(2026-08-31), no implementado — nace directamente de la logística inversa (Reunión
2026-08-24, documentada en Notion:
[Reunión 2026-08-24 (aprox.) — Devoluciones / Logística Inversa con Ricardo](https://app.notion.com/p/3c72d923dc65817fbabbd71968a47991),
bajo "TMS OLO — Documentación del Proyecto" → INTELIX — su sección 10, "Relevancia para
Planificación de Rutas (Jesús)", ya conecta explícitamente este punto con este módulo).**

- FR16.1 Al generar la secuencia de paradas, el sistema incorpora las devoluciones
  (pickups) que ya se conocen al momento de la generación, como paradas adicionales —no
  solo entregas.
- FR16.2 Las paradas de devolución se marcan visualmente con un color distinto al de las
  entregas (ej. verde para entregas, azul o rojo para devoluciones) en la lista y en el
  mapa.
- FR16.3 El volumen/peso de una devolución conocida se suma al cálculo de capacidad del
  vehículo (FR2) igual que un pedido de entrega — puede hacer que otros pedidos de entrega
  queden excluidos por capacidad.
- FR16.4 **Caso no planificado ("al pie de camión")**: cuando surge una devolución no
  conocida al momento de generar la secuencia (el conductor ya está en ruta y el cliente
  pide que se lleven algo), el sistema debe permitir insertarla como parada adicional y
  recalcular tanto la secuencia como la capacidad restante disponible — puede requerir
  invertir el orden de paradas siguientes (entregar primero para liberar espacio, recoger
  después) en vez de simplemente agregar la parada al final.

Acceptance (BDD):
- (FR16.1) Dado un viaje con 3 entregas y 1 devolución ya conocida al momento de generar
  la secuencia, When el planificador genera la secuencia de paradas, Then la devolución
  aparece como una parada más en el resultado, no queda fuera ni requiere un flujo
  separado.
- (FR16.2) Dado una secuencia de paradas con entregas y devoluciones mezcladas, When se
  renderiza la lista de paradas y el mapa, Then cada parada de devolución se distingue
  visualmente de las de entrega por color (ej. entregas en verde, devoluciones en
  azul/rojo), sin necesidad de abrir el detalle para saber cuál es cuál.
- (FR16.3) Dado un vehículo con capacidad restante de 100 kg tras incluir las entregas, y
  una devolución conocida de 150 kg, When se ejecuta el bin-packing (FR2), Then la
  devolución se trata igual que un pedido de entrega para efectos de capacidad — puede
  quedar excluida o forzar la exclusión de otro pedido, con el mismo aviso visual que usa
  FR2 para cualquier exclusión por capacidad.
- (FR16.4, escenario ilustrativo de la reunión — la regla exacta de "cabe" queda abierta en
  OQ-4): Dado una secuencia de paradas A→B→C→D con una devolución conocida en la parada B
  que no cabe en el espacio disponible en ese punto del recorrido, When se genera la
  secuencia, Then el sistema reordena para entregar C y D antes de ejecutar la recolección
  de B, si eso libera capacidad suficiente.

*Estado: No implementado.* Sin código ni diseño técnico todavía — este documento es el
primer registro formal del requerimiento. Bloquea el diseño: OQ-4 (alcance exacto de la
integración con Devoluciones) y la definición formal de reglas de qué constituye "cabe" en
el escenario de recolección al pie de camión (FR16.4 específicamente — FR16.1–16.3 son
independientes de esa definición y podrían diseñarse antes). Fuente: página de Notion de
la Reunión 2026-08-24 (link arriba, bajo "TMS OLO — Documentación del Proyecto") y
transcripción de reunión Ana↔Jesús, 2026-08-31.

## Requerimientos no funcionales

- **NFR1 — Timeout de servicios externos**: toda llamada a OSRM (`/table`, `/route`) usa
  `AbortController` con timeout de 5000 ms; la solicitud de geometría aplica debounce de
  400 ms para no saturar durante reordenamientos rápidos.
- **NFR2 — Degradación con gracia**: cada punto de integración externa (OSRM, Supabase,
  auth) tiene un fallback automático y transparente — nunca un error fatal visible al
  usuario. OSRM falla → haversine × 1.35; Supabase sin filas o bloqueado por RLS → datos
  mock; geometría OSRM falla → línea recta; auth no disponible → mock-auth.
- **NFR3 — Límites de tamaño de archivo**: componentes ≤ 150 líneas, páginas ≤ 200 líneas,
  hooks ≤ 80 líneas, enforzados por hook de pre-escritura del framework crew.
- **NFR4 — Interfaz en español**: toda la UI, labels, toasts y mensajes en español;
  variables de dominio en camelCase español.
- **NFR5 — Accesibilidad de formularios**: todo campo de formulario (`Select`, `Input`)
  asocia su `<label>` con el control vía `htmlFor`/`id`, resoluble por lectores de
  pantalla y por `getByLabel` en tests automatizados. *Corregido 2026-08-31* — antes de
  esa fecha, `Select`/`Input` no generaban ni exponían un `id`, rompiendo esa asociación
  en todo el proyecto, no solo en Planificación.
- **NFR6 — Seguridad de credenciales e infraestructura**: sin credenciales hardcodeadas;
  OSRM auto-hospedado en dominio propio, sin depender del servicio demo público con
  rate-limit.
- **NFR7 — Responsividad**: sidebar colapsable/drawer según viewport; mapas Leaflet con
  scroll controlado (no capturan el scroll de la página).
- **NFR8 — Trazabilidad de decisiones técnicas**: simplificaciones deliberadas marcadas
  con comentarios `ponytail:` (techo + ruta de upgrade); decisiones de arquitectura mayores
  en ADRs (`docs/decisions/`); sesiones de trabajo en bitácora (`docs/work/`).
- **NFR9 — Cobertura de pruebas end-to-end**: el flujo crítico (selección de viaje →
  optimización → generación → verificación en "Rutas Generadas") tiene cobertura Playwright
  ejecutable localmente (`pnpm run test:e2e`), incluyendo el caso de pedido de excepción y
  el de cambio de viaje sin arrastre de estado. *Añadido 2026-08-31.* Esta cobertura
  **verifica el camino mock**, no el backend real — no hay forma de probar el camino real
  hoy (ver NFR10).
- **NFR10 — El módulo no tiene un backend real funcionando de punta a punta.** Ningún
  requerimiento de este documento fue verificado corriendo contra escritura real en
  Supabase. Tres cosas distintas bloquean esto simultáneamente: (1) el login real nunca
  funcionó en esta rama, (2) las tablas `trips`/`trip_orders` y `location_distances` no
  existen todavía, (3) el código de escritura real (`generar-ruta-api.ts`) existe pero
  nunca se ejecutó con éxito por RLS. "Implementado" en este documento no implica "listo
  para producción" — implica "UI y lógica de negocio verificadas contra datos mock". Ver
  `MOCKING.md` para el detalle completo y el checklist de qué falta cuando haya backend
  real conectado.
- **NFR11 — Margen de seguridad debe ser configurable, no hardcodeado.** Señalado en
  revisión (Ana): hoy `WEIGHT_SAFETY_MARGIN` (85 %) y `VOLUME_SAFETY_MARGIN` (95 %) son
  constantes fijas en `capacity-fit.ts`, aprobadas solo a nivel visual/demo, no como
  requerimiento formal parametrizable. El margen de peso tiene base legal específica de
  Costa Rica (Decreto N.º 31363-MOPT) — **no está confirmado si es una norma que aplica
  igual en Venezuela**, por lo que debe ser parametrizable como mínimo por país, no un
  valor único global. Ver OQ-10.

## Restricciones

- **C1 — Posicionamiento downstream del OMS**: Planificación consume el resultado
  priorizado que el OMS inserta en el lago de datos; no decide cuándo alistar un pedido ni
  reasigna la relación ruta↔pedido que ya trae el viaje del WMS.
- **C2 — Contrato de entrada aún informal**: hoy Planificación lee directo de la tabla
  `orders`/concepto "Viaje" vía Supabase; el contrato formal de salida del OMS hacia
  Planificación (¿campo/estado en `orders` o tabla/endpoint intermedio?) es la **OQ-4** del
  documento de requerimientos del OMS — abierta, no bloquea el trabajo actual porque
  Planificación opera con datos mock mientras tanto.
- **C3 — Identidad delegada**: Planificación no gestiona autenticación propia; usa
  mock-auth local (`VITE_MOCK_AUTH`) mientras el flujo real de login (RLS/Auth) está
  bloqueado a nivel de proyecto (ver `team-roles.md`, punto de coordinación #2).
- **C4 — Design system obligatorio**: toda pantalla se compone con los componentes base
  existentes (`Card`/`Button`/`Badge`/`Input`/`Select`), sin introducir kits de UI nuevos.
- **C5 — Divergencia de plataforma no resuelta**: igual que el OMS, el código corre sobre
  Supabase gestionado mientras el estándar organizacional apunta a AWS serverless; no se
  decide en este ciclo.
- **C6 — Sin backend real ejecutado con éxito**: el login está roto, `trips`/`trip_orders`
  y `location_distances` no existen en Supabase, y el código de escritura real
  (`generar-ruta-api.ts`) nunca corrió con éxito por RLS. Todo lo "Implementado" de este
  documento es válido como UI/lógica de negocio verificada contra mock — no como sistema
  en producción (ver NFR10).
- **C7 — Fuente de distancias sin decidir**: coexisten dos implementaciones no
  reconciliadas — OSRM auto-hospedado (activo, integrado) y un prototipo con Google Maps
  Distance Matrix API (`src/lib/routePlanning/`, inactivo, sin fusionar). Cuál es la fuente
  definitiva es una decisión de negocio/costo pendiente, no solo técnica.

## Supuestos

- **A1** El vehículo seleccionado siempre tiene `capacity_weight`/`capacity_volume`
  poblados; si no, la barra de capacidad y el bin-packing no tienen contra qué medir (no
  hay manejo explícito de ese caso hoy).
- **A2** La relación cliente↔ruta y viaje↔pedidos ya viene resuelta por el WMS antes de
  llegar a Planificación — el módulo la consume, no la valida ni la corrige.
- **A3** Un pedido de excepción sin coordenadas es un caso poco frecuente dentro de un
  viaje, no la norma — el diseño lo tolera pero no lo optimiza (siempre va al final).
- **A4** El catálogo de conductores/vehículos/transportistas de la organización mock puede
  estar vacío en cualquier entorno de desarrollo; el flujo de generación de ruta debe
  seguir siendo verificable (armado, optimización) aun sin poder completarse hasta el
  final.

## Fuera de alcance

- **Backlog abierto de ADR-0001** (ítems 3, 4, 6 y 7 — el 1, 2 y 5 ya están implementados,
  ver FR6, FR15 y FR5/FR10 respectivamente):
  - Límites de horas de turno del conductor.
  - Clustering geográfico de pedidos previo al bin-packing.
  - Match de tipo de vehículo (restricciones por tipo de carga, no solo peso/volumen).
  - Trade-off explícito costo/tiempo en la optimización (hoy solo minimiza distancia).
- **Integración con Devoluciones — alcance detallado, más allá de FR16**: FR16 cubre
  incorporar pickups conocidos/no conocidos a la secuencia de paradas; sigue **fuera de
  alcance de este módulo** todo lo demás del ciclo de devolución — la creación de la
  solicitud de devolución, la recepción física en el CD, la generación de orden de
  recepción/cita en andén, y las reglas de negocio de cuándo se acepta un pickup al pie de
  camión (ventana de tiempo, % de costo tolerado) — eso vive en el futuro módulo de
  Devoluciones/logística inversa (levantamiento en curso, Reunión 2026-08-24).
- **Interfaz Planificación → Liquidación**: datos de rutas completadas (distancia
  recorrida, paradas servidas, tiempo) como insumo para el cálculo de tarifas de flete
  (Dylan) — sin schema ni trigger definido (`team-roles.md`, punto de coordinación #1).
- **Contrato formal OMS → Planificación**: mientras no se cierre la OQ-4 del documento de
  requerimientos del OMS, Planificación sigue leyendo directo de `orders`.
- **Ejecución/tracking en vivo de la ruta**: fuera de este módulo; futuro módulo de
  tracking.

## Open Questions

- **OQ-1 — Capacidad de vehículo sin poblar**: ¿qué debe pasar si `capacity_weight` o
  `capacity_volume` es `null`/0 para un vehículo activo? Hoy no hay manejo explícito
  (supuesto A1). Pendiente de definir con el equipo de catálogos.
- **OQ-2 — Coordenadas de Venezuela**: pendiente de confirmación por "Toño" para
  geocodificación de direcciones en San Diego/Micheleana (`team-roles.md`, punto de
  coordinación #4) — sin esto, el módulo no puede optimizar rutas reales fuera de Costa
  Rica.
- **OQ-3 — Contrato Planificación → Liquidación**: mismo punto abierto que en
  `team-roles.md` — no bloquea el ciclo actual, pero condiciona cuándo Dylan puede empezar
  a construir sobre datos reales de rutas completadas.
- **OQ-4 — Alcance exacto de la integración con Devoluciones**: qué campos/estado necesita
  una "recolección" para insertarse como parada adicional en una ruta ya generada, y si el
  recálculo de secuencia/capacidad debe ser automático o asistido. Requiere una sesión de
  levantamiento formal (mencionada en Reunión 2026-08-24, aún no agendada con Jesús).
- **OQ-5 — Umbral operativo de "cambio de viaje pierde selección"**: FR1.4 asume que
  siempre es correcto descartar la selección al cambiar de viaje; no está validado con el
  negocio si alguna vez se necesita comparar dos viajes sin perder el trabajo del primero.
- **OQ-6 — Cuándo se resuelve el login real**: bloquea directamente la verificación de
  FR7/FR8 (generación real de rutas) y de FR1 (viajes reales, aunque esto último también
  depende de que `trips`/`trip_orders` exista). Requiere que un Admin/SuperUsuario real dé
  de alta un usuario en `app_users` — nadie tiene ese acceso hoy (`team-roles.md`, punto de
  coordinación #2).
- **OQ-7 — OSRM propio vs. Google Maps**: cuál es la fuente de distancias definitiva para
  producción, y qué pasa con el prototipo `src/lib/routePlanning/` (Google Maps) — ¿se
  fusiona, se descarta, o se usa como fallback de OSRM propio? Sin definir (`MOCKING.md`).
- **OQ-8 — Cuándo existen `trips`/`trip_orders`/`location_distances`**: sin estas tablas,
  FR1 y FR5 seguirán siendo 100 % mock sin importar qué tan resuelto esté el login. Depende
  del equipo de datos/OMS (relacionado con la OQ-2 del documento de requerimientos del
  OMS: "tablas del lago y sistema de origen").
- **OQ-9 — Planificador de Rutas vs. Operador Logístico (OMS)**: ¿son el mismo rol de
  negocio con dos nombres, o dos personas distintas en el flujo (uno mantiene el
  calendario de rutas, el otro arma la secuencia de paradas)? Levantada por Ana en
  revisión, sin cerrar — pendiente de validar con el cliente.
- **OQ-10 — Fuente de origen de los maestros de vehículos, choferes y transportistas**:
  ¿dónde se registra oficialmente la capacidad (`capacity_weight`/`capacity_volume`) de
  cada vehículo — en el STO (este mismo sistema) o en otro sistema del cliente? Sin esta
  definición no se sabe si Planificación debe ser la fuente de verdad de esos datos o solo
  consumirlos de otro lado. Pendiente de validar con el cliente (feriado en Costa Rica el
  día de la reunión, sin respuesta todavía).
- **OQ-11 — Fuente de origen del peso y volumen por pedido/artículo**: distinto de OQ-10
  (eso es capacidad del vehículo, esto es la carga que va dentro). El WMS maneja un "peso
  teórico" y en algunos flujos (ej. Cofersa) se pesa/dimensiona físicamente al empacar
  (precintado), pero no está confirmado si esa dimensión llega siempre, para todos los
  clientes, con datos completos de volumen y peso. Sin esto poblado y confiable, el
  bin-packing (FR2) no tiene con qué calcular. Bloquea la fórmula real del algoritmo, no
  solo el requerimiento.
- **OQ-12 — Regla para paradas fuera de ventana (FR15)**: hoy solo se genera una alerta
  visual; no hay regla de negocio que defina qué debe pasar después — ¿se excluye
  automáticamente de la secuencia?, ¿se dejar tal cual y que el planificador decida?,
  ¿requiere una autorización explícita para mantenerse? Sin definir.
- **OQ-13 — Formato estándar para direcciones de excepción en el WMS**: se propone que el
  WMS anteponga un código fijo al comentario libre cuando la dirección de entrega real
  difiere de la registrada, e incluya las coordenadas (lat/long) de la dirección real —
  así Planificación podría leerlo automáticamente e insertar la parada con coordenadas
  reales en vez de mandarla siempre al final sin geolocalizar. Falta definir: el formato
  exacto del código, y qué rol del WMS es responsable de escribirlo (candidato: Operador
  de Despacho — sin confirmar). Acción asignada a Jesús en la reunión.
- **OQ-14 — Infraestructura del servicio de mapas (OSRM)**: hoy el mapa OSRM auto-hospedado
  corre en un contenedor Docker propio, fuera de la infraestructura AWS estándar del
  proyecto. Evaluar alternativas AWS (o de otro proveedor) por costo y eficiencia, y cómo
  se mantiene actualizada la data del mapa (calles nuevas, cambios) en cualquiera de las
  opciones. Acción asignada a Jesús (investigación inicial) en la reunión.
- **OQ-15 — Iteración del ciclo de planificación**: ¿la generación de una secuencia de
  paradas es de una sola pasada (el planificador la confirma tal cual sale del optimizador,
  o la descarta y reintenta desde cero), o debe soportar iterar — generar, revisar, ajustar
  manualmente, volver a optimizar, sin perder el trabajo previo? Reflexión abierta en la
  reunión, sin respuesta — relevante para el diseño de UX de FR4/FR7.

## Sources

- Versión tabular previa de este mismo documento (22 FR, 7 NFR, revisada READY el
  2026-08-25 por `aidlc-product-lead-agent`; reemplazada por esta versión narrativa,
  historial completo en git) — fuente de la mayoría de los requerimientos aquí reescritos.
- `aidlc/spaces/default/intents/260825-route-planning-reqs/inception/requirements-analysis/team-roles.md`,
  `end-user-roles.md` — roles, mapa de dependencias inter-módulo, puntos de coordinación
  abiertos.
- `docs/decisions/0001-route-planning-safety-margin-and-optimization.md` (ADR-0001) —
  márgenes de seguridad, backlog priorizado y su estado de implementación.
- `docs/work/2026-08/` — bitácora de sesiones: viaje/matriz de distancias (2026-08-20),
  ventanas horarias/ETA (2026-08-25), suite e2e + fixes de accesibilidad y dirección de
  excepción (2026-08-31).
- `e2e/planificacion-smoke.spec.ts`, `e2e/planificacion-flujo.spec.ts` — verificación
  ejecutable de los requerimientos marcados "Implementado", 2026-08-31.
- `MOCKING.md`, `HANDOFF.md` — estado del sistema de mocking y contexto de coordinación de
  equipo.
- `C:\Users\jaraujo\Downloads\OC26007 - Documento de Requerimientos - Módulo OMS -
  Iteración 2.pdf` (Eduardo) — módulo satélite upstream; formato de referencia para esta
  redacción narrativa y fuente de los puntos de contrato abiertos entre OMS y
  Planificación (OQ-4 de ese documento).
- Notion — [Reunión 2026-08-24 (aprox.) — Devoluciones / Logística Inversa con Ricardo](https://app.notion.com/p/3c72d923dc65817fbabbd71968a47991),
  bajo "TMS OLO — Documentación del Proyecto" → INTELIX. Origen directo de FR16; su
  sección 10 ya conecta explícitamente con Planificación de Rutas.
- Notion — [Reunión 2026-08-18 (tarde) — Planificación de Rutas con Ricardo](https://app.notion.com/p/3c22d923dc6581cf996bd2f4f65214e8),
  misma ubicación. Fuente de la regla "TMS no reasigna ruta↔pedido" (FR1) y del concepto
  de "viaje".
- Reunión 2026-08-31 con Ana (líder de proyecto) — revisión en vivo de la primera versión
  de este documento, transcripción pegada por Jesús. Fuente de toda la corrección de
  terminología (Ruta vs. Secuencia de Paradas), FR16 (devoluciones), NFR11 (margen de
  seguridad configurable) y OQ-9 a OQ-15.

## Assumptions & Open Questions

Ver las secciones **Supuestos** (A1–A4) y **Open Questions** (OQ-1 a OQ-15) arriba.
Ninguna bloquea la comprensión del módulo actual, pero dos sí bloquean directamente el
diseño detallado de próximos requerimientos: OQ-11 (fuente de peso/volumen por pedido —
sin esto el bin-packing no tiene fórmula real que validar) y OQ-4/FR16 (alcance de
devoluciones en la secuencia de paradas). El resto son puntos de coordinación con otros
módulos (OMS, Devoluciones, Liquidación) o validaciones de negocio pendientes con el
cliente (capacidad sin poblar, geocodificación de Venezuela, margen de seguridad por
país).

## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-08-31T16:51:12Z
**Iteration:** 2

### Findings

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| 1 | Major | FR16.1–FR16.3 | Los tres sub-requerimientos del caso "pickup conocido" (incorporar como parada, marcar visualmente, sumar a capacidad) no tienen ningún escenario Given/When/Then ni criterio de aceptación verificable. El único bloque BDD del FR (FR16.4, "al pie de camión") está explícitamente marcado "pendiente de escenarios formales, ejemplo ilustrativo" y depende de una regla de negocio no definida ("qué constituye 'cabe'"). QA no podría escribir pruebas de FR16.1–16.3 hoy. | Antes de pasar FR16 a diseño, redactar Given/When/Then al menos para el caso simple (pickup conocido, FR16.1–16.3), que es independiente del caso "al pie de camión" bloqueado por OQ-4 y podría avanzar por separado. |
| 2 | Major | FR16 — Fuente | La única fuente citada para FR16 es "transcripción de reunión Ana↔Jesús, 2026-08-31" y la reunión de origen (2026-08-24, devoluciones) "solo vive en la memoria de este agente" — el documento mismo declara que `2026-08-24-reunion-devoluciones.md` no existe todavía en el repo. Es el único FR de los 16 sin ningún artefacto de repo que lo respalde. | Antes de que FR16 avance a diseño, volcar el contenido de esa reunión a un archivo del repo (aunque sea notas crudas), para que la trazabilidad de un requerimiento formal no dependa de memoria de sesión de un agente. |
| 3 | Minor | FR1.3 / Estado FR1 | FR1.3 describe un fallback condicional ("Si la consulta a Supabase retorna 0 filas, el sistema activa el fallback"), pero la nota de Estado inmediatamente debajo aclara que hoy no existe esa condición: `viajes-api.ts` retorna directo los datos sintéticos porque la tabla no existe, sin llegar a consultar y evaluar "0 filas". El criterio tal como está escrito no es el que corre hoy. | Reescribir FR1.3 para describir el comportamiento actual (passthrough incondicional) o marcarlo explícitamente como comportamiento objetivo post-creación de `trips`/`trip_orders`, no como estado presente. |
| 4 | Minor | Requerimientos funcionales (formato) | La introducción anuncia redacción "narrativa estilo user-story + BDD", pero solo 4 de 16 FR (FR1, FR2, FR4, y parcialmente FR16) traen un bloque `Acceptance (BDD)` explícito; el resto solo tiene bullets numerados. La mayoría de esos bullets sí son puntuales y verificables por sí solos (ej. FR6, FR9, FR14, FR15), por lo que esto no bloquea el desarrollo, pero es una promesa de formato aplicada de forma inconsistente. | Uniformar: o se agrega el bloque BDD a todos los FR con lógica de negocio no trivial, o se ajusta la introducción para no prometer BDD parejo en todos los FR. |
| 5 | Minor | Nota de terminología (intro) vs. cuerpo del documento | La corrección "Ruta vs. Secuencia de Paradas" queda documentada solo al inicio del documento; los títulos y el cuerpo de FR7, FR8 y FR9 ("Generación y persistencia de ruta", pestaña "Rutas Generadas") siguen usando "ruta" sin remitir de vuelta a la nota. Está declarado como trabajo de seguimiento pendiente y es coherente con esa declaración, pero un lector que entra directo a FR9 puede perderse la corrección. | Agregar una referencia corta ("ver nota de terminología") en los títulos de FR7–FR9, o mover la nota de terminología justo antes de la sección de Requerimientos funcionales para que sea más difícil de saltear. |

### Summary

El documento es sustancialmente más sólido que la versión tabular anterior: cada FR/NFR cita fuente verificable, el estado "Implementado" está consistentemente acotado a "contra mock" salvo en los puntos donde sí hay verificación real (FR14, catálogos), y las restricciones/Open Questions reflejan con honestidad los bloqueos reales del proyecto (login roto, tablas inexistentes, RLS). La corrección de terminología Ruta/Secuencia de Paradas es coherente consigo misma — no reclama una corrección que no aplicó. El único punto que se acerca a comprometer el "listo para construir" es FR16: entra al documento como FR numerado y con Estado, pero en la práctica es un requerimiento en levantamiento (fuente no persistida en repo, criterios de aceptación incompletos, bloqueado por OQ-4) — ya está señalizado como bloqueante de diseño, así que un desarrollador no lo tomaría por error, pero el gap queda documentado para que no se pierda de vista antes de construirlo.

### Correcciones aplicadas post-revisión (sin re-dispatch al reviewer)

Los 5 hallazgos de arriba fueron atendidos directamente a pedido del usuario, sin volver a
correr `aidlc-product-lead-agent`:

1. **Major (FR16.1–16.3 sin BDD)** — corregido: se agregó Given/When/Then a los 4
   sub-requerimientos.
2. **Major (fuente de FR16 no persistida)** — corregido, con una vuelta: la reunión de
   origen ya estaba documentada en Notion por el equipo (convención real del proyecto,
   `team-roles.md`), algo que no verifiqué antes de escribir un archivo redundante en
   `docs/meetings/` — corregido a pedido del usuario, borrado ese archivo y FR16/Sources
   ahora citan la página real de Notion en vez de memoria de sesión o un duplicado local.
3. **Minor (FR1.3 describe un fallback que no corre hoy)** — corregido: se separó
   comportamiento actual (passthrough incondicional) de comportamiento objetivo (fallback
   condicionado, pendiente de que exista la tabla).
4. **Minor (BDD prometido mas no aplicado parejo)** — corregido: se ajustó la intro para
   declarar explícitamente en qué FR aplica BDD y por qué el resto no lo necesita, en vez
   de prometer BDD uniforme.
5. **Minor (títulos FR7–FR9 sin remitir a la nota de terminología)** — corregido: se
   agregó una referencia inline en los tres títulos.

**Este veredicto (READY, Iteración 2) sigue siendo el último veredicto formal del
reviewer** — las correcciones de arriba no fueron re-evaluadas por
`aidlc-product-lead-agent`. Si se necesita esa garantía formal antes de avanzar a diseño,
corresponde un nuevo dispatch (Iteración 3).
