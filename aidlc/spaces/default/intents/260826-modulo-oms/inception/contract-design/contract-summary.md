# Resumen de contratos — Módulo OMS (rebanada delgada, flujo invertido)

> Intent: `260826-modulo-oms`. Etapa: Contract Design (Inception, 2026-10-16).
> Lead: arquitecto; apoyo: plataforma AWS. Consume: `unit-of-work.md` (U1
> motor-reglas-oms, U2 backorder-inventario-oms), `unit-of-work-dependency.md`
> (DAG U2→U1), `components.md` (v4) y `requirements.md` (v4).
>
> Nomenclatura: WMS = **EFLOW**; módulo que asigna la prioridad de EPA (1 o 2) = **EPRAC**.
>
> Esta etapa formaliza las fronteras del flujo invertido (D7–D13). Las dos
> fronteras que cruzan el OMS con otros módulos/sistemas son: **(C1) activación
> OMS↔Planificación** y **(C2) handoff del OMS a `public.orders` + EFLOW**. La
> frontera interna U2→U1 (backorder reusa el handoff de U1) es intra-módulo y se
> describe como reuso, no como contrato externo.

## Contratos

| # | Provider | Consumer | Mecanismo | Owner |
|---|---|---|---|---|
| C1 | Planificación | OMS (`LambdaActivacion` + `ColaCandidatos`) | Async (señal) + shared-schema (`public.orders` pull por columna) | Compartido: Planificación (señal + escritura de viaje/`lead_time_days`) · OMS (lectura/estampado de `oms_processed_at`) |
| C2 | OMS (`HandoffPedidosOMS`) | `public.orders` (lee Planificación) + EFLOW/WMS (dispara picking) | shared-schema (UPDATE Aurora) + shared-schema (UPDATE EFLOW SQL Server) | OMS |

## C1 — Activación OMS↔Planificación (RESUELTO 2026-10-16)

**Mecanismo**: **columna como fuente de verdad + lambda como señal** (NO llaves en
el payload como mecanismo de entrega). Planificación escribe los pedidos en
`public.orders`, les asigna viaje, estampa `planning_run_id` (correlación) y avisa
al OMS por una lambda/evento asíncrono. El OMS resuelve su conjunto de trabajo
**leyendo `public.orders` por columna**; si la señal se pierde, un **barrido
periódico** sobre la misma condición es la red de seguridad. El OMS procesa **por
compañía** (batching propio) y estampa `oms_processed_at = now()` al completar el
handoff de cada pedido.

**Parte A — señal de activación (AsyncAPI; es correlación, no fuente de verdad):**

```yaml
asyncapi: 3.0.0
info:
  title: OMS Activation Signal (Planificación → OMS)
  version: 1.0.0
  description: >
    Señal asíncrona que Planificación emite tras asignar viajes a un lote.
    NO es la fuente de verdad del lote: el OMS resuelve el conjunto leyendo
    public.orders por columna (ver Parte B). Si la señal se pierde, el barrido
    periódico recupera el trabajo. Idempotencia natural por oms_processed_at.
operations:
  activateOms:
    action: send
    channel: { $ref: '#/channels/omsActivation' }
channels:
  omsActivation:
    description: Evento/invocación lambda async (fire-and-forget).
    messages:
      activation: { $ref: '#/components/messages/Activation' }
components:
  messages:
    Activation:
      name: OmsActivation
      payload:
        type: object
        properties:
          planning_run_id: { type: string, description: "Correlación/latencia; NO entrega el lote" }
          scope:
            type: object
            properties:
              country_id:  { type: string }
              company_id:  { type: string }
              warehouse_id:{ type: string }
          order_keys:
            type: array
            description: "OPCIONAL, solo correlación/latencia. El OMS NO depende de esto."
            items:
              type: object
              properties:
                eflow_id_almacen:    { type: string }
                eflow_id_compania:   { type: string }
                eflow_id_sucursal:   { type: string }
                eflow_id_expedicion: { type: string }
        required: [planning_run_id]
```

**Parte B — superficie compartida `public.orders` (shared-schema; fuente de verdad):**

```yaml
shared-schema:
  store: Aurora PostgreSQL (tms_olo, esquema public)
  table: public.orders
  purpose: >
    Superficie de handoff y de activación por pull. Planificación escribe el
    viaje y la duración; el OMS lee la cola y estampa su resultado.
  oms_read_queue:   # ColaCandidatos — cómo el OMS resuelve su conjunto de trabajo
    where: "wms_trip_number IS NOT NULL AND oms_processed_at IS NULL"
    order_by: "company_id, <orden interno del OMS>"   # el OMS batcha por compañía
    note: "Misma consulta para la señal y para el barrido periódico (red de seguridad)."
  columns_written_by_planificacion:
    - { name: wms_trip_number,   type: text,        note: "número de viaje; SOLO Planificación lo escribe" }
    - { name: planning_run_id,   type: text,        note: "correlación del lote" }
    - { name: lead_time_days,    type: integer,     note: "duración logística denormalizada de plan_trips.lead_time_days; insumo de ReglaFecha (Cofersa=1 fijo, VE dinámica/hoy estático por zona)" }
    - { name: delivery_date,     type: date,        note: "fecha de entrega del cliente; el OMS NO la modifica" }
    - { name: delivery_zone,     type: text,        note: "base de cliente-retira (D11)" }
  columns_read_by_oms:
    - delivery_date
    - lead_time_days
    - delivery_zone
    - customer_type        # TIENDA|MAYOREO (separa EPA de Cofersa/mayoreo)
    - wms_trip_number
    - oms_processed_at
    - "eflow_id_almacen | eflow_id_compania | eflow_id_sucursal | eflow_id_expedicion"  # llave EFLOW
  columns_written_by_oms:
    - { name: oms_processed_at,  type: timestamptz, note: "NULL=pendiente; el OMS estampa now() al completar el handoff — saca el pedido de la cola. Idempotencia natural." }
    # (el resto de columnas que escribe el OMS están en C2, escritura 1)
  migration_owner: >
    Las columnas nuevas (orders.oms_processed_at, orders.lead_time_days,
    plan_trips.lead_time_days) van en el PR de tablas del dueño de Planificación,
    no por fuera.
```

## C2 — Handoff del OMS (dos escrituras: `public.orders` + EFLOW)

**Mecanismo**: dos escrituras shared-schema, sin 2PC (orden 1→2 + reintento
idempotente por llave EFLOW). El OMS **no** escribe el número de viaje ni toca el
picking.

**Escritura 1 — `public.orders` (Aurora), resultado del OMS:**

```yaml
shared-schema:
  store: Aurora PostgreSQL (tms_olo, esquema public)
  table: public.orders
  operation: UPDATE
  match_by:
    - eflow_id_almacen
    - eflow_id_compania
    - eflow_id_sucursal
    - eflow_id_expedicion     # llave EFLOW = idempotencia
  set:
    - { column: priority,              type: integer,     note: "prioridad numérica invertida (menor=más urgente)" }
    - { column: oms_score,             type: numeric,     note: "score ponderado" }
    - { column: wms_situation,         type: text,        value: "'GENE'" }
    - { column: handoff_status,        type: text,        note: "'disparo_pendiente' tras escritura 1; 'completado' tras escritura 2" }
    - { column: prioritization_run_id, type: text,        note: "id de la corrida del OMS" }
    - { column: oms_processed_at,      type: timestamptz, value: "now()", note: "saca el pedido de la cola pull (C1-B)" }
  atomicity: "atómica — nunca GENE sin prioridad"
  precondition: "el pedido YA existe en orders (ingerido desde EFLOW); si no, error PedidoNoIngerido"
```

**Escritura 2 — EFLOW `EXPEDICIONESCABECERA` (SQL Server), dispara el picking:**

```yaml
shared-schema:
  store: EFLOW_OLO (SQL Server, WMS)
  table: dbo.EXPEDICIONESCABECERA
  operation: UPDATE
  match_by:
    - IDALMACEN
    - IDCOMPANIA
    - IDSUCURSAL
    - IDEXPEDICION
  set:
    - { column: TPEXSI,   value: "'GENE'", note: "situación → generada; dispara el picking del WMS" }
    - { column: PRIORIDAD, type: int,      note: "prioridad del OMS; flag escribir_prioridad_al_wms = TRUE (D8)" }
  invariants:
    - "TPEXES (estado) PERMANECE 'DISP' — solo cambia la situación"
    - "el OMS NO escribe NUMEROVIAJEWMH (lo escribe Planificación)"
    - "el OMS NO escribe fechas"
  ordering: "escritura 1 (Aurora) ANTES de escritura 2 (EFLOW)"
  failure: >
    sin 2PC. Si la 2 falla tras la 1, el pedido queda handoff_status='disparo_pendiente'
    y se reintenta idempotente por la llave EFLOW (re-correr no duplica ni re-dispara).
    ponytail: dos stores, orden + reintento; upgrade = outbox/reconciliación.
```

## Reglas de propiedad de los contratos

- **C1 señal (AsyncAPI)**: la **emite Planificación**; el OMS la consume como
  disparo. Cambios aditivos al payload son seguros (el OMS ignora campos
  desconocidos; no depende del payload para resolver el lote).
- **C1 superficie `public.orders`**: **compartida**. Planificación posee las
  columnas de viaje y `lead_time_days`; el OMS posee `oms_processed_at` y las
  columnas de resultado (C2 escritura 1). Las columnas nuevas se migran en el PR de
  tablas de Planificación. Disciplina de columnas: cada módulo escribe solo las
  suyas, para no pisarse.
- **C2 escritura 1 (`orders`) y escritura 2 (EFLOW)**: las **posee el OMS**. Cambio
  de breaking (p. ej. nuevo valor de situación) se acuerda con el dueño de EFLOW/WMS.
- **Breaking changes**: se acuerdan entre proveedor y consumidor antes de
  desplegar. **Aditivos** (columnas/campos nuevos) son seguros: los consumidores
  ignoran lo que no conocen.

## Open questions

| Contrato | Pregunta | Bloquea |
|---|---|---|
| Backorder (OQ-BO1) | ¿De qué tabla/estado de EFLOW lee el OMS las acciones omitidas por inventario? | U2 `backorder-inventario-oms` (diseño fino) |
| Backorder (OQ-BO2) | ¿Cuál es la fuente de inventario que consulta el OMS? | U2 (diseño fino) |
| Backorder (OQ-BO3) | ¿El disparador del re-chequeo es un evento de entrada de inventario o un barrido periódico? | U2 (diseño fino) |
| C1 duración (OQ) | El cálculo dinámico por clúster (VE) aún no existe; hoy `lead_time_days` es un mapa estático zona→días. ¿Cuándo entra el dinámico? | Afina ReglaFecha para VE; no bloquea Cofersa |

> El contrato del **backorder** (U2) NO se cierra en esta etapa: queda como
> **assumption abierta** (OQ-BO1/BO2/BO3), para la próxima reunión. U2 es esqueleto
> en la rebanada; su contrato se formaliza cuando se resuelvan esas OQ.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work-dependency.md` (DAG U2→U1).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (v4) y `decisions.md` (ADR-007, ADR-008, ADR-010).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (v4: FR0, FR1, FR2, FR8).
- `docs/reference/mapeo-pedidos-eflow-orders.md` (EFLOW → public.orders).

## Assumptions & Open Questions

- C1 (activación) y C2 (handoff) están RESUELTOS y formalizados arriba.
- El contrato del **backorder** (U2) queda **abierto** (OQ-BO1/BO2/BO3) — no se
  cierra en esta etapa, a resolver en la próxima reunión.
- La frontera interna U2→U1 (el backorder reusa `HandoffPedidosOMS`) es intra-módulo
  (reuso de código), no un contrato cross-módulo.
