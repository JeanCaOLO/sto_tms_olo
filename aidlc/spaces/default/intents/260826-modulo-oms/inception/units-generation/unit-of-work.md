# Unidades de trabajo — Módulo OMS (rebanada delgada de 1ª entrega)

> Intent: `260826-modulo-oms`. Etapa: Units Generation (Inception, re-corrida
> acotada, 2026-10-01). Deriva del `components.md` acotado (5 componentes de la
> rebanada, aterrizados al DDL real) y `decisions.md` (ADR-001..006). Pasada
> corta: descompone en unidades desplegables, NO re-abre diseño.

## Resumen

Los 5 componentes de la rebanada son todos **backend Python/Lambda** y forman
**un flujo cohesionado**: el motor y sus 2 reglas corren juntos en la corrida de
priorización; `ColaCandidatos` y `HandoffPedidosOMS` son los adaptadores de
entrada/salida del mismo servicio. Por eso NO se descomponen en una unit por
componente (serían submódulos de un mismo servicio Lambda que se despliega
junto). La descomposición mínima es **2 unidades**:

- **U1 — `motor-reglas-oms`** (`kind: service`): el servicio Lambda del motor de
  reglas propio del OMS, que contiene los 5 componentes de dominio como módulos
  internos.
- **U2 — `esquema-pedidos-oms`** (`kind: spec`): el esquema de la **tabla propia
  del OMS** (`PedidosOMS`, esquema OMS de `logistica_olo`), superficie de handoff
  que lee Planificación. Es un contrato de datos consumido en su lugar.

## Tabla de unidades

| Unit ID | Directory | Nombre | Kind | Complejidad |
|---|---|---|---|---|
| U1 | `u1-motor-reglas-oms` | Motor de reglas del OMS (Lambda) | service | L |
| U2 | `u2-esquema-pedidos-oms` | Esquema de la tabla de pedidos del OMS | spec | S |

## U1 — motor-reglas-oms (service)

- **Qué es**: servicio AWS Lambda (Python 3.13) nuevo y propio del OMS
  (C2-RESUELTO: no porta AST de `src/lib/tarifas/`, no comparte motor con el TMS,
  no toca Liquidaciones). Es el **esqueleto demostrable** que se construye primero.
- **Contiene** (módulos internos, del `components.md`):
  - `MotorReglasOMS` — orquesta la corrida (resuelve reglas por scope → invoca
    reglas → score ponderado submódulo puro → umbral de inyección → orden) y aplica
    el efecto cliente-retira.
  - `ReglaFecha` — T-1 sobre `FECHAEXPEDICIONPLANIFICADA` (insumo, no la modifica);
    duración de ruta ESTIMADA por scope; fallback por valor centinela/default (US8).
  - `AnalizadorObservaciones` — clasifica `OBSERVACIONESEXPEDICION` con Bedrock
    (cliente retira), por lote, degrada sin bloquear; clasificador stub en unitarios.
  - `ColaCandidatos` — adaptador de LECTURA de EFLOW/WMS (TPEXES/TPEXSI='DISP',
    FECHACIERRE IS NULL, NUMEROVIAJEWMH IS NULL; anti-join con ALMACENMOVIMIENTOS_CARCAM).
  - `HandoffPedidosOMS` — adaptador de ESCRITURA (D6, dos escrituras): (1) tabla
    propia del OMS (U2); (2) `TPEXSI='GENE'` en EXPEDICIONESCABECERA (TPEXES
    permanece 'DISP'). Orden, reintento idempotente, idempotencia por PK.
- **Entidades que posee**: `RegistroPrioridad`, `PedidoOMS` (persistida en U2),
  y `PedidoCandidato` (proyección de lectura de EFLOW).
- **Deployment**: una Lambda del backend (estándar Intelix SAM), dentro del
  monorepo backend; se integra al API/scheduler como los demás módulos
  (EventBridge para la corrida ≥1/día + cortes, NFR1). La partición por compañía
  se resuelve por **scope** (C3), no por Lambda por compañía.
- **Notas**: EFLOW en modo mock hasta que exista la réplica/live (OQ-2); Bedrock a
  construir (hoy no integrado). Catálogos TIPOSINTEGRACION y CLIENTES/
  ALMACENCOMPANIA pendientes de pedir antes del code-generation en vivo.

## U2 — esquema-pedidos-oms (spec)

- **Qué es**: el **contrato de esquema** de la tabla de pedidos propia del OMS
  (`PedidosOMS`, esquema OMS de `logistica_olo`, Aurora PostgreSQL). Superficie de
  handoff que **lee Planificación** (no el WMS).
- **Forma** (del `components.md`, entidad `PedidoOMS`): PK (IDALMACEN, IDCOMPANIA,
  IDSUCURSAL, IDEXPEDICION) + prioridad + status + situacion + estadoHandoff
  ("disparo pendiente" para el caso de fallo parcial de la escritura 2) + pesoTotal
  / cubicajeTotal (nullable, OQ-8) + corrida.
- **Kind spec**: es un contrato de datos consumido en su lugar por U1 (escritura 1)
  y por Planificación (lectura); no es un ejecutable desplegable propio. No lleva
  doc de escalabilidad ni lógica de negocio.
- **Deployment**: migración de esquema en Aurora (esquema OMS de `logistica_olo`).

## Implementación / orden

> Esta etapa describe la TOPOLOGÍA, no decide el orden económico de construcción
> (eso es de Delivery Planning). No obstante, la decisión de negocio ya tomada
> (secuencia del usuario) es: **el esqueleto de U1 (`motor-reglas-oms`) es el
> primer entregable**; U2 es su dependencia de datos (el handoff escribe ahí).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (acotado, 5 componentes).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/decisions.md` (ADR-001..006).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (v3).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md` (rebanada: US1, US7–US13).

## Assumptions & Open Questions

- Descomposición mínima (2 units) por ser la rebanada un flujo cohesionado de un
  solo servicio. Al ampliar el alcance (componentes diferidos: CatalogoReglas,
  Simulador, Auditoría, Panel, UI) surgirán nuevas units en corridas posteriores.
- U1 depende de U2 (el handoff escribe en la tabla del OMS). Sin ciclos.
