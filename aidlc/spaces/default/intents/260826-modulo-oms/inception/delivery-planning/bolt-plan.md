# Plan de Bolts — Módulo OMS (rebanada delgada, flujo invertido v4)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (Inception, capstone,
> **re-corrida v4, 2026-10-16**). Consume: requirements.md v4, stories.md v4,
> components.md v4, unit-of-work.md (U1/U2), unit-of-work-dependency.md (DAG U2→U1),
> contract-summary.md (C1 activación, C2 handoff).
>
> Nomenclatura: WMS = **EFLOW**; módulo que parte EPA por línea = **EPRAC**.
>
> Un **Bolt** es una unidad desplegable de trabajo dentro de Construcción: una
> pasada completa de diseño + construcción + tests sobre una o varias Unidades de
> Trabajo, que termina en algo que corre.

## Resumen

La rebanada tiene 2 unidades (U1 `motor-reglas-oms`, U2 `backorder-inventario-oms`)
con DAG `U2 → U1`. El plan: **Bolt 1 = U1** (walking skeleton), ahora informado por
los contratos ya formalizados (C1 activación por pull-de-columna + señal; C2
handoff a `orders` + EFLOW). **U2 NO entra a construcción** en esta rebanada: está
**bloqueado por OQ-BO1/BO2/BO3** (integraciones de backorder a resolver en la
próxima reunión). Se registra como Bolt 2 **bloqueado**, no planificado para
construir aún.

## Secuencia de Bolts

| Bolt | Unidades | ¿Walking skeleton? | Estado | Mob |
|---|---|---|---|---|
| Bolt 1 | U1 `motor-reglas-oms` | Sí | Listo para construir | `aidlc-developer-agent` |
| Bolt 2 | U2 `backorder-inventario-oms` | No | **BLOQUEADO** (OQ-BO1/BO2/BO3) | `aidlc-developer-agent` (cuando se desbloquee) |

## Bolt 1 — Esqueleto de `motor-reglas-oms` (walking skeleton)

- **Unidad**: U1 `motor-reglas-oms` (service, Lambda Python). 7 componentes
  internos: LambdaActivacion, ColaCandidatos, MotorReglasOMS, ReglaEPA, ReglaFecha,
  ReglaClienteRetiraZona, HandoffPedidosOMS.
- **¿Es el walking skeleton?**: Sí. Prueba de punta a punta todas las capas del
  flujo invertido, informado por los contratos formalizados:
  1. **Activación (C1)** — `LambdaActivacion` recibe la señal; `ColaCandidatos`
     resuelve el lote por **pull de columna** (`wms_trip_number IS NOT NULL AND
     oms_processed_at IS NULL`) sobre `public.orders`.
  2. **Reglas** — `ReglaEPA` (cortocircuito EPA), `ReglaFecha` (T−duración leyendo
     `lead_time_days`), `ReglaClienteRetiraZona` (por `delivery_zone`).
  3. **Orquestación + score** — `MotorReglasOMS` (submódulo puro de score; batching
     por compañía; umbral).
  4. **Handoff (C2)** — `HandoffPedidosOMS`: UPDATE a `public.orders`
     (prioridad, score, `wms_situation='GENE'`, handoff_status, prioritization_run_id,
     `oms_processed_at=now()`) + escritura a **EFLOW** (`TPEXSI='GENE'`+`PRIORIDAD`,
     `TPEXES` permanece `DISP`, sin número de viaje).
- **Definition of Done**: los 7 módulos existen como código Python ejecutable en
  una Lambda; el score corre como submódulo puro testeable; tests unitarios verdes
  (incl. EPA cortocircuito, cliente-retira por zona, pull por columna, dos
  escrituras); el flujo corre de punta a punta contra mocks/stubs declarados
  (EFLOW mock; señal simulada; barrido simulado).
- **Confidence hypothesis (qué prueba este Bolt)**: que el flujo invertido
  (activación por señal + pull de columna → reglas → score → dos escrituras
  idempotentes con `oms_processed_at`) es construible y testeable tal como lo
  fijaron C1 y C2, antes de conectar datos reales (réplica EFLOW, Bedrock no aplica
  —diferido—).
- **Demo esperada**: una corrida que, dado un lote mock en `orders` con viaje y
  `oms_processed_at NULL`, prioriza (EPA pre-asignada; Cofersa por fecha;
  cliente-retira por zona), hace las dos escrituras, estampa `oms_processed_at`, y
  al re-correr (señal duplicada o barrido) **no re-prioriza** (idempotencia por
  columna).
- **Mob**: `aidlc-developer-agent` (scope `classic`, team-formation SKIP).

## Bolt 2 — `backorder-inventario-oms` (BLOQUEADO)

- **Unidad**: U2 `backorder-inventario-oms` (service, loop desacoplado, D13).
- **Estado**: **BLOQUEADO — no entra a construcción en esta rebanada.** Depende de
  resolver **OQ-BO1** (tabla/estado de acciones omitidas en EFLOW), **OQ-BO2**
  (fuente de inventario) y **OQ-BO3** (disparador del re-chequeo). Son hechos de
  integración/negocio para la **próxima reunión**.
- **Qué falta para desbloquear**: cerrar las 3 OQ; luego su contrato (hoy abierto
  en Contract Design) se formaliza y el Bolt 2 se planifica para construir.
- **Mob (cuando se desbloquee)**: `aidlc-developer-agent`.

## Iteración de Construcción

Con un solo Bolt construible (U1) y el segundo bloqueado, el orden es
**unit-major** (diseñar y construir U1 completa primero; primer código ejecutable
al cierre del bloque), coherente con walking-skeleton-first. Se registrará
`set-construction-iteration unit-major` en el handoff de la etapa.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (v4).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md` (v4).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (v4).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md` (U1/U2) y `unit-of-work-dependency.md` (DAG U2→U1).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/contract-design/contract-summary.md` (C1, C2).

## Assumptions & Open Questions

- Bolt 1 (U1) es construible ya: C1 y C2 están formalizados; depende de recursos
  existentes (`public.orders`, EFLOW) con mock/stub en el esqueleto.
- Bolt 2 (U2) bloqueado por OQ-BO1/BO2/BO3; no se construye hasta resolverlas.
- La duración logística de VE usa hoy un mapa estático zona→días
  (`orders.lead_time_days`); el cálculo dinámico por clúster es futuro (no bloquea
  Bolt 1, que cubre Cofersa=1 y el mecanismo de lectura).
