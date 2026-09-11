# Planificación — Propuesta de modelo de datos (BD propia)

> **Estado:** propuesta / borrador para discusión. No implementado aún.
> **Motor:** PostgreSQL (Supabase). Todas las tablas llevan `id uuid`, `created_at`,
> `updated_at`, `organization_id` y `pais` (`cr`/`ve`) salvo que se indique.

## Principio: qué guardamos y qué NO

El módulo **lee de EFLOW en solo-lectura** (vía el backend Lambda) y **guarda en
BD propia el resultado de planificar**. Nunca escribimos en EFLOW.

| Origen (EFLOW, solo lectura — NO se guarda) | BD propia (lo que sí guardamos) |
|---|---|
| `journeys` (viajes), `journey_orders` (pedido↔viaje) | Las **secuencias generadas** (orden de paradas, asignación, métricas) |
| `EXPEDICIONESCABECERA` (pedidos: peso/vol/ruta/prioridad) | La **config de días** por ruta (estilo COFERSA) |
| `CLIENTES` (coordenadas, dirección) | **Cache de distancias** driving (para el optimizador) |
| `distribution_routes`, `drivers`, `trasportation_units`, `transportation_companies` (catálogos) | **Overrides de capacidad** de vehículos + (futuro) **histórico** de desempeño |

> Regla: los ids de EFLOW (viaje, pedido, ruta, chofer, vehículo, transportista,
> cliente) se guardan como **texto** (`*_ref`), no como FK — son de otra BD.

> **Clave del pedido (confirmado Calzadilla 2026-09-11):** EFLOW **no es multipaís**,
> así que la referencia a un pedido/movimiento se une **SIEMPRE por 4 campos**:
> pedido + **almacén** + compañía + sucursal. El **`pais` lo ponemos nosotros**.
> Por eso `order_ref` no basta; ver `order_ref` + `warehouse_ref` + `company_ref` +
> `branch_ref` en `route_plan_stops`.

---

## 1. `route_plans` — Secuencias generadas ("Rutas / Secuencias Generadas", "Nueva Ruta")

Una fila por secuencia que el planificador genera (o crea a mano). Es el corazón
del módulo.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pais` | text | `cr` / `ve` |
| `name` | text | etiqueta visible (ej. `01 · CASCO CENTRAL`) |
| `source_trip_ref` | text null | `journey_id` de EFLOW del que se generó; **null** si es "Nueva Ruta" manual |
| `route_code` | text | ruta EFLOW (ej. `01`) |
| `route_name` | text | nombre de la ruta |
| `route_date` | date | día de despacho |
| `carrier_ref` | text null | transportista asignado (EFLOW `transportation_company_id`) |
| `driver_ref` | text null | conductor asignado (EFLOW `driver_id`) |
| `vehicle_ref` | text null | vehículo asignado (EFLOW `unit_id`) |
| `status` | text | `generada` / `completada` / `pendiente` (los estados del bulk que ya existe en la UI) |
| `tipo` | text | `transporte` (normal) / `retira` (cliente retira en almacén) — ver Actualización 2026-09-11 |
| `stop_count` | int | nº de paradas |
| `total_distance_m` | numeric | distancia total (driving) |
| `total_duration_s` | numeric | tiempo total estimado |
| `total_weight` | numeric | peso total de los pedidos |
| `total_volume` | numeric | volumen total |
| `capacity_weight` | numeric null | capacidad del vehículo (snapshot al generar) |
| `capacity_volume` | numeric null | idem volumen |
| `capacity_ok` | boolean | ¿cabe todo? (validación peso/volumen vs vehículo) |
| `optimizer` | text | motor usado (`osrm` / `google` / `manual`) |
| `generated_by` | uuid null | usuario que la generó |
| `notes` | text null | |

Índices: `(pais, route_date)`, `(status)`, `(source_trip_ref)`.

## 2. `route_plan_stops` — Paradas ordenadas de una secuencia

Una fila por pedido dentro de una secuencia, **en el orden óptimo calculado**.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `route_plan_id` | uuid FK → `route_plans` | on delete cascade |
| `seq_order` | int | 1..N — el orden de entrega optimizado |
| `order_ref` | text | pedido EFLOW (`IDEXPEDICION` / `order_number`) |
| `warehouse_ref` | text | **almacén** — parte de la clave de 4 campos |
| `company_ref` | text | **compañía** (`IDCOMPANIA`) — parte de la clave |
| `branch_ref` | text | **sucursal** (`IDSUCURSAL`) — parte de la clave |
| `guia_ref` | text null | `IDCONFIRMACION` de CARCAM — su presencia marca pedido **cerrado/listo** |
| `customer_ref` | text | cliente EFLOW (`IDCLIENTE`) |
| `customer_name` | text | snapshot |
| `delivery_address` | text | snapshot |
| `latitude` / `longitude` | numeric null | coords del cliente (pueden faltar) |
| `weight` / `volume` | numeric null | del pedido (cascada cabecera→detalle→calculado) |
| `priority` | int null | prioridad EFLOW |
| `tipo` | text | `entrega` / `recoleccion` (soporta devoluciones futuras) |
| `distance_from_prev_m` | numeric null | tramo desde la parada anterior |
| `duration_from_prev_s` | numeric null | idem tiempo |
| `eta` | timestamptz null | hora estimada de llegada |
| `status` | text | `pendiente` / `entregado` / `fallido` (se sincroniza con Tracking a futuro) |

Índices: `(route_plan_id, seq_order)`, `(order_ref)`.
Unicidad: `(route_plan_id, order_ref, warehouse_ref, company_ref, branch_ref)` — la
clave real del pedido en EFLOW es de 4 campos (ver arriba).

## 3. `route_schedules` — Config de días por ruta (matriz estilo COFERSA)

La matriz "ruta × día" con estados (la que dibuja la UI de COFERSA: `ambos` /
`cita`, con leyenda de colores). Reemplaza la tabla estática cliente↔ruta↔día que
"nadie mantiene".

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pais` | text | |
| `route_code` | text | ruta EFLOW |
| `weekday` | int | 0=Dom … 6=Sáb |
| `mode` | text | `ambos` (entrega+recolección) / `cita` (requiere cita) / `entrega` / `recoleccion` / `none` |
| `active` | boolean | |

Unicidad: `(pais, route_code, weekday)`.

> Opcional `client_route_days` si hace falta override **por cliente** (un cliente
> de una ruta que se entrega en otro día/ruta): `(pais, customer_ref, route_code,
> weekday, mode)`.

## 4. `vehicle_capacities` — Override de capacidad de vehículos

EFLOW (`trasportation_units`) trae capacidad **0** en casi todos los registros; la
UI hoy usa una capacidad sintética por marca. Esta tabla permite fijar la real.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pais` | text | |
| `vehicle_ref` | text | EFLOW `unit_id` |
| `plate` | text null | snapshot |
| `capacity_weight` | numeric | máx peso |
| `capacity_volume` | numeric | máx volumen |
| `fuel_type` | text null | |
| `tire_count` | int null | |

Unicidad: `(pais, vehicle_ref)`.

## 5. `location_distances` — Cache de matriz de distancias (driving)

Cachea la matriz de distancias **por carretera** (no geodésica) entre puntos, que
es cara de calcular (OSRM self-hosted / Google Maps). Clave del optimizador Fase 1.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pais` | text | |
| `origin_key` | text | `OLO` o `customer_ref` |
| `dest_key` | text | `customer_ref` |
| `distance_m` | numeric | distancia driving |
| `duration_s` | numeric | tiempo driving |
| `source` | text | `osrm` / `google` |
| `computed_at` | timestamptz | para invalidar/refrescar |

Unicidad: `(pais, origin_key, dest_key, source)`.
Índice: `(pais, origin_key)`.

## 6. (Fase 2) `performance_metrics` — Histórico de desempeño

No existe data aún (se captura tras 1–2 meses de operación). Diseñar la tabla para
incorporar transportista/conductor/vehículo más adelante, **sin bloquear el arranque**.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `pais` | text | |
| `subject_type` | text | `carrier` / `driver` / `vehicle` |
| `subject_ref` | text | id EFLOW del sujeto |
| `route_code` | text null | desempeño por ruta (opcional) |
| `avg_duration_s` | numeric | tiempo promedio |
| `deliveries` | int | nº de entregas de la muestra |
| `on_time_rate` | numeric null | % a tiempo |
| `period_start` / `period_end` | date | ventana de la muestra |

---

## Relaciones (resumen)

```
route_plans 1───N route_plan_stops
route_plans   ·····> (source_trip_ref, route_code, carrier/driver/vehicle_ref) → EFLOW (solo lectura)
route_schedules      → config de días por ruta (COFERSA)
vehicle_capacities   → capacidad real por vehículo
location_distances   → cache para el optimizador
performance_metrics  → (fase 2) desempeño histórico
```

## Notas de implementación

- **Supabase RLS:** filtrar por `organization_id` (y `pais`) en todas las tablas.
- **Snapshots:** `route_plan_stops` guarda nombre/dirección/peso del pedido **al
  momento de generar**, para que la secuencia no cambie si EFLOW se actualiza después.
- **Estados del bulk** (`generada`/`completada`/`pendiente`) ya están en la UI
  ("Secuencias Generadas") — el `status` de `route_plans` los materializa.
- **Fase 1 vs Fase 2:** tablas 1–5 son el arranque; `performance_metrics` (6) es
  backlog hasta tener datos de operación real.
- **Mock → real:** hoy el módulo mockea `trips`/`trip_orders`/`location_distances`
  (ver `MOCKING.md`); esta propuesta es su forma "real" en Supabase.

---

## Actualización 2026-09-11 — decisiones y alcance nuevo (reunión con Ana)

> Fuente: **Reunión 2026-09-11 — Entidades y modelo de datos de Planificación (con
> Ana)** (Notion). **A validar con Calzadilla/Antonio antes de construir.**

1. **Nuevo alcance grande — creación de viajes:** hoy **ningún módulo crea el
   viaje** (se asume pre-creado en WMH). La intención es que **Planificación** lo
   cree, porque tiene el calendario de rutas. Criterio (a validar): cada día, si
   una ruta sale ese día y hay pedidos para ella → se crea un **viaje vacío**; los
   pedidos en predespacho se asignan al viaje activo de su ruta; al llenarse el
   camión se cierra y se crea el siguiente. Esto implica que `route_plans` (o una
   tabla `trips` propia) pase de "reflejo de WMH" a **fuente definitiva** (el WMH
   es reemplazable). El pedido decide su viaje por `fecha_planificada_entrega` +
   `ruta`.
2. **`tipo` de viaje** (añadido arriba): `transporte` vs `retira` (cliente retira
   en almacén). El de retira se crea **fijo a diario** y se cierra al final del día
   (no se dejan viajes abiertos indefinidamente — daña estadísticas).
3. **Estado "viaje completo/cerrado" (trigger de optimización):** la secuencia
   debe optimizarse cuando el viaje **ya tiene todos sus pedidos** (si entra otro
   después, deja de ser óptima). Falta un estado claro de "no recibe más pedidos"
   (¿`SITUATION` pending/full?). En COFERSA los pedidos llegan todo el día con una
   hora límite de despacho → **pregunta abierta para Antonio**.
4. **Calendario de rutas:** lo **mantiene Planificación** y lo **comparte con OMS**.
   Ya avanzado: `route_schedules` ← EFLOW `RUTA_DIA_AB` (`/api/catalogos/rutas-dias`).
5. **Replicación:** no pegarle al WMS en vivo → leer de **tablas replicadas**
   (EXPEDICIONES para pedidos, journeys/journey_orders para viajes). Planificación
   **no escribe** sobre data del WMS (OMS sí). **Dónde se replican: preguntar a
   Calzadilla.**
6. **Dirección en observaciones + IA:** el pedido puede traer otra dirección/ruta
   en el campo libre de **observaciones**. Se analizará con un **modelo (DeepSeek)**
   para detectar si la ruta/dirección real difiere de la del pedido → la ruta
   podría cambiar. (OMS usa el mismo campo para otras reglas.)
7. **Límite de alcance:** Planificación **optimiza y para** (asigna chofer/vehículo,
   genera la secuencia, la pasa a Trade). **No** guarda fecha de entrega, POD ni
   completado/cancelado — eso es **Tracking** (hoy Trade). → `route_plan_stops.status`
   y ETA quedan para cuando exista Tracking; no son responsabilidad de este módulo
   por ahora.
8. **Log/auditoría de optimizaciones:** la vista de "Secuencias Generadas" cumple
   esto; falta **filtro por día** (`route_date`).

### Preguntas abiertas (para Calzadilla/Antonio)

- ¿Quién y dónde se crean los viajes hoy? ¿Vacíos y luego se anexan pedidos?
- ¿Hay estado de "viaje completo/cerrado"?
- ¿Dónde se replican EXPEDICIONES y journeys/journey_orders?
- Chofer↔transportista↔vehículo: ¿relación fija? ¿horarios? ¿independientes?
- ¿Confirmado que la creación de viajes es de Planificación?

---

## Actualización 2026-09-11 (tarde) — respuestas de Calzadilla

> Fuente: **Reunión 2026-09-11 (tarde) — BD con Calzadilla** (Notion). Estas ya son
> **confirmaciones**, no supuestos.

1. **Ciclo de vida del pedido (WMS):** `EXPEDICIONESCABECERA` = todos; se cruza con
   **`ALMACENMOVIMIENTOS_CARCAM`** ("carcán"). No en CARCAM = **no procesado**
   (candidato a prioridad); en CARCAM con `número viaje = PEND` y sin guía = **en
   proceso**; `número viaje` ≠ PEND + **`IDCONFIRMACION` (guía)** + fecha cierre =
   **cerrado/listo**. → `route_plan_stops.guia_ref` materializa "listo".
2. **`situation` es el filtro obligatorio (CRÍTICO):** al reasignar viaje/chofer/
   unidad, EFLOW **inhabilita el viejo y crea uno nuevo** → hay duplicados. **Toda
   query de viajes/choferes debe excluir `situation IN ('inhabilitado','invalidated')`.**
   Valores: inhabilitado / asignado / completado / **MER** (unión de 2 viajes) /
   pendiente. Es más confiable que las fechas. → aplicar en el **backend** (queries
   de viajes/pedidos), no solo en la propuesta.
3. **Trigger "viaje listo" para optimizar:** unir CARCAM con `journey_orders`; si
   **todos** los pedidos del viaje tienen guía → cerrado (optimizable). Alternativa
   a confirmar: `situation = pendiente`. Sin estado 100% claro aún.
4. **Llaves de chofer:** `CARCAM.IDCHOFER` = **`driver_code`**;
   `journey_order_transportation.driver_id` = **`driver_id`** (el real → une con
   `drivers`). **Cliente-retira CR:** `driver_id` **40 y 62** son *dummy* → excluir
   de geo/optimización (equivalen a `route_plans.tipo = 'retira'`).
5. **Peso:** confirma la cascada. CR **no carga peso real**; debe salir del
   **maestro de artículos × cantidad**, no lo actualizan → muchos en 0.
6. **Multi-empresa/almacén (impacto en el modelo):** unir **por 4 campos** (pedido
   + almacén + compañía + sucursal); el **país lo asignamos nosotros**. CR: en WMH
   solo COFERSA; EPA y demás en **WMS/DMS** con lógica de "completo" **distinta**
   (a documentar). VE: 3 compañías, 2 almacenes. **Colombia viene** (1 compañía, 2
   almacenes). Alcance real = **todos los clientes y países**.
7. **Replicación:** el **Lago NO** (compacta + ~30 min). Usar **réplica IPRAX**
   (SymmetricDS, <2s). **VE la tiene, CR NO** → **acción: pedirla a Rafael/Alfredo**.

### Impacto directo en el backend (no solo propuesta)

- Añadir a las queries de viajes/pedidos el filtro `situation NOT IN
  ('inhabilitado','invalidated')` para no traer duplicados.
- Exponer/derivar `guia_ref` (`IDCONFIRMACION`) y los 4 campos de clave en el
  payload de pedidos, para el modelo propio.
