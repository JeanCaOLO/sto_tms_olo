# Unidades de trabajo — Módulo OMS (rebanada delgada de 1ª entrega)

> Intent: `260826-modulo-oms`. Etapa: Units Generation (Inception, **re-corrida v4
> por la inversión del flujo OMS↔Planificación, 2026-10-16**). Deriva del
> `components.md` v4 (8 componentes en alcance) y `decisions.md` (ADR-007..012).
> Pasada corta: descompone en unidades desplegables, NO re-abre diseño.
>
> **Nomenclatura (vigente)**: WMS = **EFLOW**; módulo que asigna la prioridad de
> EPA (1 o 2) = **EPRAC**.

## Resumen

Con la inversión del flujo (D7) y la escritura real a EFLOW/`public.orders`
(D7/D8), la descomposición de la rebanada cambia respecto a v3:

- **Se ELIMINA la unit `esquema-pedidos-oms`** (era U2 en v3): ya **no hay tabla
  propia del OMS** (`oms.pedidos` descartada; esquema único `public`). La tabla es
  **`public.orders`**, que **ya existe en BD** (aplicada 2026-10-16) y no es trabajo
  del OMS crearla. El OMS la lee y la actualiza, no la define.
- **U1 `motor-reglas-oms`** absorbe los 7 componentes de la corrida de priorización
  (incluida la nueva `LambdaActivacion` de entrada) como módulos internos de una
  Lambda Python.
- **U2 `backorder-inventario-oms`** (NUEVA) es el loop de backorder (D13),
  **desacoplado** de la corrida (disparador y ciclo de vida propios) → unidad
  aparte, no un módulo de la corrida. En esta rebanada es esqueleto + open questions.

Descomposición mínima: **2 unidades** (ambas service).

## Tabla de unidades

| Unit ID | Directory | Nombre | Kind | Complejidad |
|---|---|---|---|---|
| U1 | `u1-motor-reglas-oms` | Motor de reglas del OMS (Lambda) | service | L |
| U2 | `u2-backorder-inventario-oms` | Loop de backorder/inventario del OMS | service | M |

## U1 — motor-reglas-oms (service)

- **Qué es**: servicio AWS Lambda (Python 3.13) nuevo y propio del OMS
  (C2-RESUELTO). Es la **corrida de priorización**, que **activa Planificación**
  (D7). Esqueleto demostrable que se construye primero.
- **Contiene** (módulos internos, del `components.md` v4):
  - `LambdaActivacion` — entrada ASÍNCRONA (D7/FR0): Planificación **avisa** (señal,
    no fuente de verdad); arranca la corrida. Contrato RESUELTO 2026-10-16.
  - `ColaCandidatos` — adaptador de LECTURA de **`public.orders`** (D7): **pull por
    columna** `wms_trip_number IS NOT NULL AND oms_processed_at IS NULL` (misma
    consulta para la señal y para el barrido periódico). **Ya no** lee de
    `EXPEDICIONESCABECERA` ni usa el anti-join.
  - `MotorReglasOMS` — orquesta: deriva EPA a `ReglaEPA`; para el resto invoca
    `ReglaFecha` + `ReglaClienteRetiraZona`, calcula el **score ponderado**
    (submódulo puro testeable), aplica umbral y ordena el handoff.
  - `ReglaEPA` — cortocircuito EPA (D9): prioridad pre-asignada por **EPRAC**
    (1 o 2; nunca 0); no recalcula; libera el pedido con esa prioridad.
  - `ReglaFecha` — fecha generalizada (D10): `fecha_entrega − duración`, con la
    **duración como insumo de Planificación** (Cofersa=1, VE dinámica); fallback por
    centinela.
  - `ReglaClienteRetiraZona` — cliente-retira por `delivery_zone` (D11), prioridad
    máxima.
  - `HandoffPedidosOMS` — adaptador de ESCRITURA (D7/D8): escritura 1 = UPDATE a
    `public.orders` (prioridad, score, `wms_situation='GENE'`, handoff_status,
    prioritization_run_id, **`oms_processed_at=now()`** → saca el pedido de la cola
    pull); escritura 2 = **EFLOW real** (`TPEXSI='GENE'` + `PRIORIDAD`; `TPEXES`
    permanece `DISP`; sin número de viaje). Orden 1→2, sin 2PC, reintento idempotente
    por llave EFLOW.
- **NO contiene**: `AnalizadorObservaciones` (DIFERIDO, D11).
- **Entidades**: `RegistroPrioridad` (resultado del motor); `PedidoCandidato` /
  `PedidoOMS` se materializan sobre `public.orders` (no hay tabla propia).
- **Deployment**: una Lambda del backend (estándar Intelix SAM); la activa
  Planificación (no EventBridge). La partición por compañía se resuelve por scope
  (C3), no por Lambda por compañía.
- **Notas**: EFLOW real = escritura 2 (hoy mock/stub en el esqueleto; flag
  `escribir_prioridad_al_wms`=TRUE). Catálogos TIPOSINTEGRACION y CLIENTES/
  ALMACENCOMPANIA pendientes antes de code-generation en vivo.

## U2 — backorder-inventario-oms (service)

- **Qué es**: el **loop de backorder** (D13), servicio/componente **desacoplado**
  de la corrida de priorización (no se dispara con la lambda de activación ni vive
  en el handoff de un lote): revisión continua / por evento.
- **Contiene**: `BackorderInventario` — (1) lee las acciones liberadas omitidas por
  falta de inventario; (2) chequea inventario; (3) re-manda a generar solo esas
  acciones (situación `GENE` con su prioridad) cuando entra stock. Reutiliza el
  borde de escritura del handoff (de U1) para re-generar.
- **Alcance en esta rebanada**: **esqueleto del componente + open questions**; el
  diseño fino NO se cierra.
- **Open questions (no cerradas, hechos de integración/negocio)**: OQ-BO1 (tabla/
  estado de acciones omitidas en EFLOW), OQ-BO2 (fuente de inventario), OQ-BO3
  (disparador: evento de entrada de inventario vs. barrido periódico).
- **Deployment**: servicio del backend con su propio disparador (evento o
  schedule, a definir en OQ-BO3); separado de la Lambda de la corrida.

## Implementación / orden

> Topología, no orden económico (eso es Delivery Planning). La secuencia de negocio
> ya tomada: el **esqueleto de U1 (`motor-reglas-oms`) es el primer entregable**;
> U2 (backorder) es posterior (esqueleto + OQ, depende de integraciones abiertas).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (v4, 8 componentes).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/decisions.md` (ADR-007..012).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (v4).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md` (v4).

## Assumptions & Open Questions

- La unit `esquema-pedidos-oms` de v3 se **elimina**: `public.orders` ya existe en
  BD; el OMS no la crea. No es una unidad de trabajo.
- U1 depende de `public.orders` (lectura y escritura) y de EFLOW (escritura 2),
  ambas existentes/externas; no de una unidad de esquema.
- U2 (backorder) depende de las integraciones abiertas (OQ-BO1/BO2/BO3); por eso es
  esqueleto en esta rebanada.
- Contrato de la lambda de activación (U1): scope + `planning_run_id` vs. llaves
  explícitas — a confirmar con el dueño de Planificación (no bloquea).
