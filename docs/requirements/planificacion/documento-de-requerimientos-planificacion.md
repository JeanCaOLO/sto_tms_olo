# Requerimientos — Módulo de Planificación de Rutas (estado actual)

Proyecto **brownfield** `sto_tms_olo`. Idioma: español. Fecha de corte: **2026-10-06**.

Este documento describe el módulo de Planificación **tal como está hoy** en la rama `planificacion-2`, en formato narrativo user-story + BDD, con el marco de Actores / Glosario / Restricciones / Supuestos / Open Questions. Reemplaza al documento anterior (`OC26007 - Planificación`, escrito sobre el **prototipo viejo** con Supabase + mock-auth + login roto + tablas `trips/trip_orders` inexistentes): ese estado ya no aplica.

**Léase antes que nada — qué cambió respecto del documento anterior:**

- El módulo **corre contra backend real**: API hexagonal en Python (AWS SAM/Lambda, repo `TMS-Backend`) sobre **Aurora PostgreSQL**. Ya **no** es Supabase + mocks encadenados.
- El **login real funciona** (`admin@ologistics.com`); el contexto operativo (país/almacén/compañía) sale del headbar y viaja como headers en cada request.
- La unidad de trabajo ya **no es "la ruta de un viaje del WMS"**: es un **Plan del día** que el motor arma desde cero agrupando los pedidos del día por zona. La ruta **no es fija**: se construye por los pedidos del día (confirmado reuniones 2026-09/10).
- Los flujos "Nueva Ruta / Reparto de Flota / Rutas Generadas" se reemplazaron por dos pestañas: **Generar** (genera/regenera/edita/confirma el plan del día) y **Planificaciones** (lista los planes por estado, con estado por viaje).
- "Implementado" aquí significa **verificado contra backend real (Aurora)**, salvo donde se indique lo contrario.

## Análisis de intención

El objetivo de negocio es **automatizar el armado del plan de reparto de un día**: dado el conjunto de pedidos planificables de una fecha (con destino, zona, peso y volumen) y la flota disponible, decidir **qué pedidos van en qué vehículo**, **en qué zona/viaje**, **en qué orden se entregan**, y persistir esa decisión como un plan operativo editable y confirmable.

Planificación es el módulo **downstream del OMS**: el OMS decide *cuándo* alistar un pedido y con qué prioridad; Planificación decide *cómo* se agrupan y secuencian los pedidos ya alistados. Ninguno reasigna la relación ruta↔pedido original del WMS.

Metas (no features):

- Reemplazar el armado manual por un **cálculo determinístico** que nunca sobrecargue un vehículo por encima de los márgenes de seguridad.
- **Agrupar por zona** y **minimizar el recorrido** de cada viaje con una secuencia cercana al óptimo usando distancias reales por calle (OSRM), no líneas rectas.
- Escalar de un vehículo a una **flota** (reparto automático por capacidad, flota propia primero) sin cambiar de algoritmo.
- **Degradar con gracia** ante fallas externas (OSRM) y datos incompletos (pedidos sin coordenadas, peso/volumen ausente): nunca un error fatal, siempre un fallback.
- Conservar el **snapshot** con el que se generó el plan (que no mute por cambios aguas arriba).

Alcance: recibir los pedidos del día, decidir asignación pedido↔vehículo, agrupación por zona, secuencia de paradas, y persistir el plan con sus viajes (vehículo, estado) y paradas. **Fuera de alcance**: generar/priorizar pedidos (OMS), ejecutar/trackear la ruta en vivo (módulo de tracking, futuro), calcular tarifas/liquidación (Dylan/José), y la logística de devoluciones (módulo de Devoluciones, en levantamiento).

## Actores

| Rol | Responsabilidad en Planificación |
|-----|----------------------------------|
| **Planificador de Rutas** | Usuario primario. Elige el día, **genera/regenera** el plan, lo **edita** (mueve pedidos entre viajes), lo **confirma**, y gestiona el **estado por viaje** (completar/cancelar/reabrir). |
| **Jefe de Almacén** | Supervisa los planes ya generados desde la pestaña Planificaciones; filtra por estado. Rol compartido con el OMS — visibilidad. |
| **Administrador de Módulo** | Configura catálogos base (vehículos, conductores, transportistas). No opera planes día a día. Rol transversal, compartido con el OMS. |

Sin rol de "Conductor" en este módulo: el conductor se asigna pero no opera esta pantalla (su interfaz es el futuro módulo de ejecución/tracking). El "Coordinador de Flota" del documento anterior desaparece como flujo separado: el **reparto entre vehículos es automático** dentro de la generación (ver FR2/FR6).

## Glosario

- **Plan (route_plan):** resultado de un ciclo de planificación de un día. Tiene estado `draft` → `confirmed`, uno o más viajes y un conjunto de pedidos sin asignar. Persiste en Aurora.
- **Viaje (plan_trip):** agrupación de paradas de una **zona** asignada a **un vehículo**. Tiene estado propio `pending` / `completed` / `cancelled`, independiente del plan y de los otros viajes. Lleva snapshot del vehículo (placa, capacidad, flota propia).
- **Parada (plan_stop):** un pedido a entregar en un punto. Lleva snapshot (cliente, nº pedido, ciudad, zona, coordenadas, peso, volumen) y su número de secuencia.
- **Punto de entrega:** ubicación física (coordenadas). Varios pedidos pueden compartir el mismo punto → comparten color y se muestran agrupados.
- **Zona:** clave de agrupación del viaje (sale del punto de entrega → `zones`, o del código WMS/zona del pedido). El motor arma un (o más) viaje por zona.
- **Bin-packing / Selección por capacidad:** first-fit-decreasing que decide qué pedidos caben en un vehículo sin superar los márgenes de seguridad.
- **Margen de seguridad:** techo de uso de capacidad — **85 % de peso** (base legal CR, Decreto 31363-MOPT) y **95 % de volumen**, aplicados de forma independiente.
- **Flota propia primero:** los vehículos con `is_owned = true` se agotan antes de usar terceros.
- **Secuencia de paradas:** orden de entrega optimizado (2-opt / nearest-neighbor sobre matriz de distancias real OSRM; fallback a distancia aproximada si OSRM no responde).
- **Snapshot ("congelar"):** copia de los campos de pedido/vehículo al guardar el plan, para que el plan no cambie si los datos de eflow cambian después (migración `003`).
- **Contexto operativo:** país / almacén / compañía seleccionados en el headbar; viajan como headers (`x-warehouse-id`, `x-customer-id`) y filtran lo que se ve.
- **Pedido sin coordenadas:** entra al plan pero queda **fuera del dibujo de ruta** en el mapa (no se descarta).
- **OMS:** sistema satélite upstream que prioriza el pedido antes de que llegue a Planificación.

## Requerimientos funcionales

### FR1 — Elegir día y cargar pedidos planificables

Como Planificador, quiero elegir un día y ver cuántos pedidos y vehículos hay, para empezar a planificar.

- FR1.1 El selector de día define la **fecha de entrega objetivo**; el sistema carga los pedidos planificables de esa fecha en el contexto operativo activo (status `assigned`/`entregado`).
- FR1.2 Cada pedido aporta: nº de orden, cliente, zona, ciudad, coordenadas, peso y volumen (peso/volumen se totalizan desde las líneas del pedido).
- FR1.3 La carga **re-consulta en vivo** al cambiar la fecha o el contexto operativo (país/almacén/compañía), sin recargar la página.
- FR1.4 Si el día no tiene pedidos, el botón Generar se deshabilita con un aviso.

**Acceptance (BDD):** Dado un día con 26 pedidos en el contexto activo, When el planificador lo elige, Then se muestra el conteo de pedidos/vehículos y el botón Generar habilitado.

**Estado: Implementado (backend real).** Fuente: `use-pedidos-dia.ts`, `plan-pedidos-api.ts`, backend `ORDERS_SQL` (agrega peso/volumen por `order_items`).

### FR2 — Generar el plan del día (zona → capacidad → secuencia)

Como Planificador, quiero generar el plan con un clic y obtener los viajes con sus paradas, sin armarlos a mano.

- FR2.1 El sistema crea un plan `draft` con uno o más viajes.
- FR2.2 Los pedidos se **agrupan por zona**; dentro de cada zona se asignan a vehículos por **bin-packing** (85 % peso / 95 % volumen), **flota propia primero** y mayor capacidad primero.
- FR2.3 Las paradas de cada viaje quedan **secuenciadas** (orden de entrega optimizado), no por orden de llegada.
- FR2.4 Los pedidos que no caben por capacidad se listan como **sin asignar** (no se pierden).

**Acceptance (BDD):** Dado un día con ~20 pedidos de una misma zona y camiones de hasta 8000 kg, When se genera el plan, Then la zona produce un viaje con ~16 paradas (y un segundo viaje para el sobrante si no cabe), 0 pedidos perdidos.

**Estado: Implementado (backend real).** Verificado 2026-10-06 generando `2026-10-09`: viaje "07 Carretera" con 16 paradas, 0 sin asignar. Fuente: `POST /v1/planificacion/planes`, `domain/planificacion/{motor,agrupar_por_zona,ajustar_capacidad}.py`.

### FR3 — Regenerar el plan y alerta de pedidos nuevos

Como Planificador, quiero regenerar el plan cuando entran pedidos nuevos para ese día, y que el sistema me avise.

- FR3.1 Sin plan el botón dice **"Generar plan"**; con plan pasa a **"Regenerar plan"** (icono refresco). Regenerar rearma el plan tomando los pedidos actuales del día.
- FR3.2 Si entran pedidos nuevos después de generar, el botón muestra una **alerta** (ámbar/pulsante) con un **badge** del número de pedidos nuevos.
- FR3.3 La alerta se recalcula periódicamente sin recargar; tras regenerar vuelve a cero.

**Acceptance (BDD):** Dado un plan generado de un día, When entra 1 pedido nuevo para ese día, Then en ≤15 s aparece el badge "1" sobre "Regenerar plan"; When se regenera, Then el badge vuelve a 0 y el pedido está en el plan.

**Estado: Implementado (polling).** El backend es Lambda y no sostiene WebSockets; hoy es polling cada 15 s, aislado en `use-nuevos-pedidos.ts` para enchufar WebSocket cuando haya infra (ver OQ-5, NFR). Fuente: `use-nuevos-pedidos.ts`, `PlanEditor.tsx`.

### FR4 — Editar el plan (mover pedidos entre viajes)

Como Planificador, quiero mover un pedido de un viaje a otro en un plan borrador, para ajustar el reparto.

- FR4.1 Solo un plan `draft` es editable.
- FR4.2 Cada parada ofrece un selector **"Mover a…"** con los otros viajes del plan.
- FR4.3 Al mover, el servidor **revalida la capacidad** del viaje destino y **recalcula la secuencia**; si no cabe, se rechaza.

**Acceptance (BDD):** Dado un plan `draft` con ≥2 viajes, When se mueve un pedido a otro viaje con espacio, Then aparece en el destino con la secuencia recalculada; When el destino no tiene capacidad, Then la acción se rechaza.

**Estado: Implementado (backend real).** Fuente: `PUT /v1/planificacion/planes/{id}`, `plan-edit.ts`, `PlanEditor`.

### FR5 — Confirmar el plan

Como Planificador, quiero confirmar el plan cuando esté conforme, para dejarlo listo.

- FR5.1 El botón **Confirmar** pasa el plan de `draft` a `confirmed`; deja de ser editable.
- FR5.2 Tras confirmar, la vista cambia a la pestaña Planificaciones.

**Estado: Implementado (backend real).** Fuente: `POST /v1/planificacion/planes/{id}/confirmar`, `use-planes.ts`.

### FR6 — Reparto automático de flota multi-vehículo

Como Planificador, quiero que cuando una zona no cabe en un vehículo, el sistema reparta sus pedidos entre varios, sin armar cada viaje a mano.

- FR6.1 Dentro de una zona, si los pedidos exceden un vehículo, el bin-packing llena vehículos sucesivos (flota propia primero, mayor capacidad primero), generando varios viajes de la misma zona.
- FR6.2 Cada viaje se secuencia con el mismo algoritmo (FR2.3).
- FR6.3 Lo que no cabe en ningún vehículo se reporta como **sin asignar**.

**Estado: Implementado (backend real), automático dentro de FR2.** (A diferencia del prototipo viejo, no es un flujo "Reparto de Flota" aparte.) Fuente: `ajustar_capacidad.py`, `motor.py`.

### FR7 — Estado por viaje: completar / cancelar / reabrir

Como Planificador, quiero marcar cada viaje de un plan confirmado como completado o cancelado, y poder reabrirlo, para reflejar la operación sin tocar el resto.

- FR7.1 En un plan confirmado, cada viaje muestra su estado (`pending`/`completed`/`cancelled`) y las acciones disponibles.
- FR7.2 Completar → `completed`; Cancelar → `cancelled`; Reabrir → `pending`. Transiciones **reversibles**, por viaje e independientes.
- FR7.3 La pestaña Planificaciones filtra por estado de los viajes (un plan entra en "Completadas"/"Canceladas" si tiene ≥1 viaje en ese estado).

**Acceptance (BDD):** Dado un plan confirmado, When se completa un viaje y luego se reabre, Then el pill del viaje pasa a Completado y vuelve a Pendiente; los otros viajes no cambian.

**Estado: Implementado (backend real).** Fuente: `estados_viaje.py` (máquina PENDING/COMPLETED/CANCELLED + `TransicionViajeInvalida`), rutas `/viajes/{tripId}/completar|cancelar|reabrir`, `PlanTripCard`.

### FR8 — Snapshot del plan ("congelar")

Como sistema, quiero guardar el plan con los valores con que se generó, para que no cambie si eflow cambia después.

- FR8.1 Al guardar, se persisten en `plan_stops`/`plan_trips` las columnas snapshot (pedido: order_number, customer_name, ciudad, zona, lat/long, peso, volumen; vehículo: placa, capacidad, is_owned).
- FR8.2 Las lecturas del plan guardado usan el snapshot, no re-consultan eflow.

**Estado: Implementado (backend real).** Migraciones `003/004/005` aplicadas a Aurora. Fuente: `planificacion_service._congelar(...)`, `adapters/outbound/aurora/sql.py`, `models.py`.

### FR9 — Mapa interactivo y geometría real de ruta

Como Planificador, quiero ver cada viaje sobre un mapa con el trayecto real por calles, para verificar que tiene sentido.

- FR9.1 El mapa (Leaflet + OpenStreetMap) muestra un marcador numerado por parada y una polyline con la geometría real (OSRM `/route`, debounce).
- FR9.2 Si OSRM falla, la polyline cae a segmentos rectos entre paradas, de forma transparente.
- FR9.3 Los pedidos del **mismo punto** (mismas coordenadas) comparten **color** en la lista y en el pin.
- FR9.4 Pedidos sin coordenadas quedan fuera del mapa (no se descartan del viaje).

**Estado: Implementado.** Fuente: `TripMapa.tsx`, `route-geometry.ts`, `colores-parada.ts`.

### FR10 — Ver pedidos, detalle de parada y punto compartido

Como Planificador, quiero revisar los pedidos del viaje y el detalle de cada parada, incluso cuando varios pedidos comparten el mismo punto.

- FR10.1 Botón **"Ver pedidos"** lista los pedidos del viaje **agrupados por punto** (con su color).
- FR10.2 La lista de paradas muestra las **primeras 3**; si hay más, un botón **"Ver las N paradas" / "Ver menos"** expande/colapsa (evita tarjetas infinitas).
- FR10.3 Al tocar en el mapa un punto con **varios pedidos**, se abre una **tabla del punto** (#, cliente, nº pedido, peso); al tocar una fila se abre el **detalle del pedido** encima. Punto con un solo pedido → va directo al detalle.
- FR10.4 Todos los modales se cierran al **hacer click afuera** o con **Escape**.

**Acceptance (BDD):** Dado un viaje con 2 pedidos en el mismo punto, When se toca ese pin, Then se muestra la tabla del punto; When se toca una fila, Then el detalle abre **delante** de la tabla; When se hace click afuera, Then el modal se cierra.

**Estado: Implementado.** Verificado 2026-10-06 (incluye fix de z-index). Fuente: `PlanTripCard`, `PuntoModal.tsx`, `ParadaModal.tsx`, `ViajePedidosModal.tsx`, `AdminModal.tsx`.

### FR11 — Barra de capacidad por viaje

Como Planificador, quiero ver cuánta capacidad usa cada viaje, para anticipar sobrecargas.

- FR11.1 Cada viaje muestra barras de **peso** y **volumen** contra la capacidad del vehículo, con umbrales de color.

**Estado: Implementado.** Fuente: `CapacityBar.tsx`, `PlanTripCard`.

### FR12 — Filtrar planificaciones por estado y por contexto

Como Jefe de Almacén/Planificador, quiero ver la lista de planes filtrada por estado y acorde al contexto operativo, sin recargar.

- FR12.1 La pestaña Planificaciones lista los planes con fecha, estado, nº de rutas y paradas, expandibles.
- FR12.2 Filtros: todas / borrador / confirmado / completado / cancelado (los dos últimos por estado de viaje).
- FR12.3 Cambiar país/almacén/compañía en el headbar **re-consulta en vivo** la lista (y el tab Generar).

**Estado: Implementado (backend real).** Fuente: `PlanesTab.tsx`, `use-planes-list.ts` (depende del contexto operativo), `GET /planes`.

## Requerimientos no funcionales

- **NFR1 — Backend real hexagonal:** la lógica corre en una API Python (SAM/Lambda) con arquitectura hexagonal (domain/ports/adapters/app), contra Aurora PostgreSQL. SQL siempre **parametrizado** (nunca se interpola input de la request).
- **NFR2 — Contexto operativo por headers:** cada request adjunta `x-warehouse-id`/`x-customer-id` desde el headbar; el backend resuelve país/almacén/compañía y filtra. Al cambiar, las vistas re-consultan en vivo.
- **NFR3 — Degradación con gracia:** OSRM falla → distancia aproximada / polyline recta; pedido sin coordenadas → fuera del mapa, no se descarta; peso/volumen ausente → la capacidad degrada sin romper el plan.
- **NFR4 — Timeout/debounce de servicios externos:** las llamadas a OSRM usan timeout; la geometría aplica debounce para no saturar en reordenamientos.
- **NFR5 — Interfaz bilingüe (es/en):** toda la UI con i18n (claves `planning.*`), español por defecto.
- **NFR6 — UX de modales:** todos los modales cierran al click afuera y con Escape; el detalle se apila **encima** de la tabla del punto.
- **NFR7 — Seguridad:** sin credenciales hardcodeadas (el runner local lee `.env.local`, gitignored); allowlist/parametrización en el acceso a datos. Pendiente: rotar la key AWS `ext.claude` (expuesta en chat, no en git).
- **NFR8 — Trazabilidad:** simplificaciones marcadas `ponytail:` (techo + upgrade); bitácoras en `docs/work/`; decisiones mayores en ADRs.
- **NFR9 — Calidad:** el backend pasa la certificación Intelix (APTO 92 %); pytest verde en el motor. En el frontend persisten errores de `type-check` **preexistentes** en tests/mocks (`planes-mock.ts`, `plan-edit.test.ts` sin `status`), ajenos al runtime.

## Restricciones

- **C1 — Downstream del OMS:** Planificación consume pedidos ya priorizados; no decide cuándo alistar ni reasigna ruta↔pedido del WMS.
- **C2 — Fecha de entrega inmutable:** la fecha de entrega la pone el cliente y **no se modifica**; Planificación solo ajusta prioridad/estado (reunión 2026-10-05). La lejanía (T-1) se resuelve subiendo prioridad, no cambiando la fecha.
- **C3 — La ruta no es fija:** el viaje se arma por los pedidos del día y su zona; no hay rutas estáticas por día.
- **C4 — Distancias por OSRM auto-hospedado:** fuente activa de distancias/geometría; existe un prototipo con Google Maps (rama anterior) no integrado. La fuente definitiva no está decidida (OQ-6).
- **C5 — Capacidad de flota sintética:** los vehículos reales de eflow **no traen capacidad** poblada; hoy se usa un catálogo con capacidades (Ricardo ofreció dimensionar ~20-30 vehículos reales).
- **C6 — Design system obligatorio:** se usan los componentes base (`AdminModal`, `Button`, `CapacityBar`…), sin kits nuevos.
- **C7 — Divergencia de plataforma:** el backend ya es AWS serverless (estándar Intelix), pero el **pipeline de auto-deploy** necesita credenciales AWS aún pendientes.

## Supuestos

- **A1** El vehículo tiene capacidad poblada (del catálogo); si no, el bin-packing no tiene contra qué medir.
- **A2** La relación cliente↔punto de entrega y la zona ya vienen resueltas aguas arriba (eflow/catálogos); Planificación las consume.
- **A3** Peso/volumen por pedido se obtienen sumando las líneas; en compañías sin ese dato (VE, EPA cross-docking) la capacidad degrada con gracia.
- **A4** Un pedido sin coordenadas es la excepción, no la norma; el diseño lo tolera (fuera del mapa) pero no lo optimiza.

## Fuera de alcance

- **Split de pedido en varias guías (por línea):** un pedido despachado en varios viajes a nivel de línea (común en EPA / cuando no cabe). Hoy la parada es por pedido. Requiere levantamiento con Ricardo (ver OQ-1).
- **Estatus de entrega/recepción y devoluciones:** marcar no-entregado, recepción especial, y la liquidación de la guía (no se liquida sin recepción; Venezuela liquida lo entregado en bolívares con pro forma). Ligado a IPRAC. Módulo de Devoluciones en levantamiento.
- **Regla de piso de capacidad mínima (80 %) para que salga el viaje:** hoy solo se valida el techo (85 %/95 %). Pendiente (OQ-2).
- **WebSocket real** de alerta (hoy polling; depende de infra AWS).
- **Tracking/ejecución en vivo** de la ruta (módulo futuro).
- **Interfaz Planificación → Liquidación** (datos de rutas completadas como insumo de tarifas — Dylan/José).

## Open Questions

- **OQ-1 — Split de pedido por línea:** ¿`plan_stops` debe pasar a nivel de **línea** para soportar un pedido repartido en varias guías? Afecta el snapshot. Owner: Jesús + Ricardo.
- **OQ-2 — Regla del piso 80 %:** ¿% exacto y cómo se muestra (aviso "bajo mínimo")? ¿Cómo convive con la regla de fecha de entrega (un viaje puede tener que salir subóptimo)? Owner: Ricardo/negocio.
- **OQ-3 — Estatus de entrega/recepción:** qué estados y campos necesita un viaje para reflejar devoluciones y habilitar liquidación. Owner: Ricardo + Devoluciones.
- **OQ-4 — T-1 / zona→días:** qué fecha usar y la tabla parametrizable **zona → días a restar** (VE puede tardar 2 días; Colombia también). Consulta pendiente a Ricardo. Owner: Eduardo (OMS) + Jesús.
- **OQ-5 — WebSocket vs polling:** cuándo hay infra de API Gateway WebSocket para la alerta en vivo. Bloqueado por credenciales/infra AWS.
- **OQ-6 — OSRM vs Google Maps:** fuente de distancias definitiva para producción; qué pasa con el prototipo Google Maps. Sin decidir.
- **OQ-7 — Coordenadas de Venezuela:** ~20.000 puntos sin coordenadas (solo dirección en texto). Sin esto no se puede dibujar ruta en VE. Jean lo gestiona con Toño; Dylan/José probarían la API de Google. Owner: negocio + datos.
- **OQ-8 — Capacidad real de flota:** poblar `capacity_weight/volume` reales (Ricardo ofreció ~20-30 vehículos). Hoy sintético.
- **OQ-9 — Contrato formal OMS → Planificación:** fuente canónica de "pedidos reales" (campo/estado en `orders` vs tabla/endpoint intermedio). Hoy se lee directo de `orders`.

## Sources

- Código del módulo: `src/pages/planificacion/*` (frontend) y repo `TMS-Backend` (`src/domain/planificacion/*`, `src/app/planificacion_service.py`, `src/adapters/**`).
- Stories y requirements técnicos: [`docs/stories/planificacion/`](../../stories/planificacion/README.md), [`docs/requirements/planificacion/`](README.md).
- SQL: `TMS-Backend/sql/003_plan_snapshots.sql`, `004_plan_trip_status.sql`, `005_route_plan_customer.sql` (aplicadas a Aurora).
- Bitácoras: `docs/work/2026-10/` (regenerar/alerta/contexto, infra/git/mirror, UX de paradas/modales/punto compartido).
- Reuniones (Notion, espacio INTELIX): 2026-09-28 (modelo de datos EFLOW/WMH), 2026-10-05 4pm (reglas de viaje/liquidación), dailies 2026-10-05/06; doc "Fuentes de datos reales EFLOW/WMH".
- Documento anterior (prototipo): `OC26007 - Planificación - Documento de Requerimientos` — superado por este (ya no hay Supabase/mock-auth/login roto).

## Review

Pendiente. Documento escrito a pedido explícito del usuario, **sin AIDLC**, apegado al estado del módulo al 2026-10-06. Es la foto del código actual, no una spec previa a construcción.
