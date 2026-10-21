# Re-corrida v4 del OMS — inversión del flujo OMS↔Planificación

**Fecha:** 2026-10-16
**Intent AI-DLC:** `260826-modulo-oms`
**Tipo:** hito de diseño (re-corrida de etapas de Inception por drift de negocio)
**Etapas re-corridas y aprobadas:** requirements-analysis → user-stories →
domain-design (refined-mockups saltada; la rebanada es backend).

## Qué motivó la re-corrida

Reuniones de negocio (process owner: Antonio) redefinieron el flujo
OMS↔Planificación y aterrizaron varias reglas. Los artefactos previos (v3,
"pivote WMH") quedaron contradiciendo la nueva dirección y se trataron como base a
corregir, no a repetir. Nomenclatura fijada: el WMS es **EFLOW**; el módulo que
parte los pedidos de EPA por línea es **EPRAC** (no "IPRAC"/"IFLOW").

## Los 7 cambios de negocio absorbidos (D7–D13)

- **D7 — Inversión del flujo.** Planificación extrae de EFLOW, procesa, asigna el
  viaje, escribe `wms_trip_number` de vuelta a EFLOW y a `orders`, y **luego activa
  al OMS** mediante una **lambda de activación nueva, asíncrona** (fire-and-forget).
  El OMS deja de dispararse por cron/EventBridge; **lee de `public.orders`** (los
  pedidos del lote, ya con viaje), aplica reglas y escribe de vuelta a EFLOW.
- **D8 — Escritura real a EFLOW.** La escritura 2 del handoff va contra EFLOW real:
  situación `TPEXSI='GENE'` + `PRIORIDAD` (flag `escribir_prioridad_al_wms` = TRUE;
  la prioridad SÍ se escribe en EFLOW). El estado `TPEXES` permanece `DISP`. El OMS
  **no** escribe el número de viaje (lo escribe Planificación) ni toca el picking.
- **D9 — EPA sin cálculo.** EPRAC parte el pedido de la tienda EPA en dos
  expediciones (mismo número + guion): guion-0 (falla = prioridad 0) y guion-1
  (regular = prioridad 1). El OMS no recalcula: pone ambas en `GENE` con su
  prioridad, liberándolas juntas. EPA no usa la regla de fecha.
- **D10 — Regla de fecha generalizada.** `fecha_listo = fecha_de_entrega −
  duración_logística` (T-1 = caso Cofersa con duración 1). La duración es un
  **insumo por pedido/viaje que entrega Planificación** (ya no un parámetro fijo de
  config); mayoreo VE con duración dinámica (pendiente con comercial).
- **D11 — Cliente retira = zona.** Se modela por `delivery_zone`, no interpretando
  observaciones. El análisis de observaciones por IA/Bedrock
  (`AnalizadorObservaciones`) se desprioriza a futuro.
- **D12 — Cambio de prioridad sin anular.** Mientras el pedido esté
  disponible/generada, la prioridad se modifica reenviando el registro; solo el
  cambio de fecha de entrega pasa por Planificación. El OMS no reordena tareas ya
  generadas.
- **D13 — Backorder/inventario (nueva responsabilidad del OMS).** Loop propio
  desacoplado de la ruta de priorización: lee las acciones omitidas por falta de
  inventario, chequea inventario y re-manda a generar cuando entra stock.

## Artefactos tocados (todos aprobados en gate)

- `inception/requirements-analysis/requirements.md` (v4) + su questions.
  FR0 nuevo (activación), FR1 lee de `orders`, FR2 regla generalizada, FR4.4 cambio
  sin anular, FR6b EPA, FR6c backorder, FR7 diferido, FR8 escritura invertida.
- `inception/user-stories/stories.md`, `traceability.json`,
  `user-stories-assessment.md`, `personas.md`. E0/US0, E2b/US-EPA, E10/US-BO,
  US15b, US13 cliente-retira por zona, US12 a futuro; P6 Planificación activa, P7
  EPRAC nuevo.
- `inception/domain-design/components.md`, `decisions.md`, `traceability.json`.
  Componentes nuevos: LambdaActivacion, ReglaEPA, ReglaClienteRetiraZona,
  BackorderInventario. ColaCandidatos lee `public.orders`; HandoffPedidosOMS
  escribe a `orders` + EFLOW real. AnalizadorObservaciones diferido. ADR-002 y
  ADR-003 marcados SUPERSEDED; ADR-007..012 nuevos (D7–D13).

## Lo que NO se rehízo (estado existente al que se alinearon los artefactos)

- **BD (aplicada 2026-10-16):** `orders` = EXPEDICIONESCABECERA y `order_items` =
  EXPEDICIONESDETALLE, con llave EFLOW en texto, `priority` entero, columnas del WMS
  (`wms_status`, `wms_situation`, `wms_trip_number`…) y resultado del OMS
  (`oms_score`, `handoff_status`, `prioritization_run_id`). `final_customers` con
  `customer_type` (TIENDA|MAYOREO); `branches`; `warehouses`/`customers` con
  `source_system`+`external_code`. `oms.pedidos` descartada (esquema único
  `public`).
- **Código (rama `oms`):** IDs varchar/str en el motor; el handoff hace UPDATE a
  `public.orders` por la llave EFLOW con `wms_situation='GENE'`; la Cola del OMS
  (UI) ya lee `orders`.

## Assumptions

- **Contrato de la lambda de activación (ADR-007) — RESUELTO (2026-10-16)** con el
  dueño de Planificación. Mecanismo: **columna como fuente de verdad + lambda como
  señal** (no llaves en el payload). Planificación escribe en `public.orders`,
  asigna viaje, estampa `planning_run_id` (trazabilidad) y avisa al OMS por
  lambda/evento (señal). El OMS resuelve su cola por **pull por columna**:
  `wms_trip_number IS NOT NULL AND oms_processed_at IS NULL` (nueva columna
  `orders.oms_processed_at`; el OMS la estampa `now()` al completar el handoff).
  Red de seguridad: barrido periódico sobre `oms_processed_at IS NULL`; idempotencia
  natural por la columna. El OMS procesa por compañía (batching propio). Duración
  logística: `plan_trips.lead_time_days` denormalizada en `orders.lead_time_days`
  (Cofersa=1 fijo; VE dinámica — hoy mapa estático zona→días, dinámico por clúster
  a futuro). Número de viaje: lo escribe Planificación (el OMS no lo toca). El OMS
  edita `priority`, `wms_status`/`status`, `wms_situation`. Columnas nuevas
  (`orders.oms_processed_at`, `orders.lead_time_days`, `plan_trips.lead_time_days`)
  van en el PR de tablas del dueño de Planificación. Asentado en los artefactos;
  pendiente solo de aplicarse formalmente al correr Contract Design.
- **Backorder (ADR-012) — ABIERTA:** OQ-BO1 (tabla/estado de acciones omitidas en
  EFLOW), OQ-BO2 (fuente de inventario), OQ-BO3 (disparador del re-chequeo: evento
  de entrada de inventario vs. barrido periódico). Hechos de integración/negocio
  para la próxima reunión.

## Evidencia faltante (nombrada, no reconstruida)

- **Datos de estimación de la re-corrida:** no se capturaron. Es un hito de diseño
  (no de implementación de código), por lo que no se registró esfuerzo/estimación.
  Si el proceso del equipo exige estimación para hitos de diseño, queda pendiente
  de añadir con cifras reales (no se inventan aquí).

## Siguiente

- Units Generation (2.7): reconciliar las unidades de trabajo a v4 (entran
  LambdaActivacion/ReglaEPA/ReglaClienteRetiraZona/BackorderInventario; sale
  AnalizadorObservaciones a diferido) para no contradecir el domain-design
  aprobado.
