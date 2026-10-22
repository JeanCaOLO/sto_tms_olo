# Mapa de dependencias externas — Módulo OMS (v4.1)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (re-corrida v4, 2026-10-16;
> **refinamiento v4.1 D14/ADR-013, 2026-10-19/20**: desacople priorización↔liberación).
> Mapea los ítems gated (fuera del control del OMS) a los Bolts que los consumen.
> Consume: bolt-plan.md, contract-summary.md. **Reparto de columnas de `orders`
> documentado en `sql/37`** (Planif escribe `numero_viaje`/`lead_time_days`/
> `dispatch_date`/`planning_run_id`; el OMS escribe `priority`/`oms_score`/
> `wms_situation`/`handoff_status`/`prioritization_run_id`/`oms_processed_at`).

## Dependencias gated

| # | Dependencia | Dueño | Bloquea | Estado en Bolt 1 | Qué pasa si se atrasa |
|---|---|---|---|---|---|
| 1 | **Columnas nuevas** `orders.oms_processed_at`, `orders.lead_time_days`, `plan_trips.lead_time_days` | Dueño de Planificación (en su PR de tablas) | Bolt 1 (lectura/estampado reales) | Esqueleto usa mock de `orders`; contrato C1 definido | Bolt 1 corre contra mock; al mergear el PR, se cablea la lectura real sin cambiar la lógica |
| 2 | **Señal de activación** (lambda/evento de Planificación) | Planificación | Bolt 1 (disparo real) | Señal **simulada**; el pull por columna + barrido no dependen de ella | La columna es la fuente de verdad: el barrido periódico cubre el disparo aunque la señal no exista aún |
| 3 | **Réplica/acceso EFLOW real** (escritura 2) | Alfredo (solicitar) | Bolt 1 (escritura real a EFLOW) | **Mock/stub** de la escritura 2 | Esqueleto escribe contra mock; al existir, se cambia el adaptador |
| 4 | Catálogos `TIPOSINTEGRACION`, `CLIENTES`/`ALMACENCOMPANIA` | WMS/EFLOW (pedir) | code-generation en vivo | Valores conocidos (`DISP`/`GENE`); scopes parametrizados | Pedir antes de correr contra datos reales; no bloquea el esqueleto |
| 5 | **`orders.dispatch_date`** (`date`, = `delivery_date − lead_time_days`, igual por viaje, re-estampada en replan) — **D14/ADR-013** | Planificación (rama `planificacion-2`) | Bolt 1 (pasada de LIBERACIÓN, US9b) | **YA IMPLEMENTADA**: la columna existe en `orders` y se está poblando | La priorización no la necesita; la liberación la lee. Hasta el merge de `planificacion-2` podría faltar en algún pedido viejo → se queda en `DISP` (no se libera), no rompe |
| 6 | **Limpieza al caerse del plan**: Planif pone `planning_run_id`/`numero_viaje`/`dispatch_date = NULL` cuando un pedido sale del plan (replan y día sin pedidos) | Planificación (rama `planificacion-2`) | Cola del OMS (exclusión automática) | **YA IMPLEMENTADA y probada** en `planificacion-2` | **Riesgo de DESPLIEGUE** (no de diseño): hasta mergear/desplegar `planificacion-2`, un pedido caído podría conservar sello viejo. La cola es segura igual (`planning_run_id IS NOT NULL AND oms_processed_at IS NULL`); anotado como riesgo, **no bloquea** |

## Dependencias que BLOQUEAN el Bolt 2 (backorder)

| # | Dependencia (OQ) | Pregunta | Estado |
|---|---|---|---|
| BO1 | Acciones omitidas en EFLOW | ¿De qué tabla/estado las lee el OMS? | **ABIERTA** — próxima reunión |
| BO2 | Fuente de inventario | ¿Qué fuente consulta el OMS? | **ABIERTA** — próxima reunión |
| BO3 | Disparador del re-chequeo | ¿Evento de entrada de inventario o barrido periódico? | **ABIERTA** — próxima reunión |

**Bolt 2 (U2) no entra a construcción hasta cerrar BO1/BO2/BO3.**

## Wiring de infraestructura/despliegue (Intelix, SAM estándar)

> Registrado al saltar Infrastructure Design as-built (2026-10-19): el código del OMS
> ya está construido y verde; la infra y el deploy los hace **Intelix** sobre la
> plantilla **SAM estándar**. Esto es lo que el wiring de despliegue debe cablear;
> **no bloquea** la construcción de U1 (el esqueleto corre en mock/local sin ello).

| # | Wiring | Qué necesita Intelix | Notas |
|---|---|---|---|
| W1 | **Trigger programado del barrido** (2 pasadas: priorizar + liberar) | Regla de **EventBridge Scheduler** (o cron SAM) que invoque el handler del OMS **5×/día** (`BARRIDO_VECES_POR_DIA=5`, constante documentada en `models.py`). Frecuencia/hora de corte = parámetro a futuro, por compañía | v1 = polling de columna; el trigger es la red que dispara el barrido. No hay EventBridge de *evento* de Planificación en v1 (diferido, ADR-007) |
| W2 | **Ruta de API Gateway de la acción manual** | `POST /api/v1/oms/viajes/{numero_viaje}/procesar` cableada en API Gateway al handler del OMS (`procesar_viaje` en `app.py`), **gated por rol** (`permissions.require("oms","edit")` ya en código; el authorizer/JWT del gateway debe propagar el scope del usuario) | "Procesar a Eflow" (US9c). Subconjunto opcional de expediciones en el body |
| W3 | **IAM de escritura a `sim_expedicionescabecera`** | Permiso de **escritura** del rol de ejecución del Lambda del OMS sobre la tabla `sim_expedicionescabecera` (Aurora `tms_olo`), destino actual de la costura `EscritorSituacion`/`SimExpedicionesWriter` | eFlow real es **read-only** (no se pide IAM a eFlow). Cuando exista el endpoint EPRAC, el wiring de red cambia a ese endpoint (sin tocar el motor); por ahora solo escritura a `sim_expedicionescabecera` |

## Consumidor aguas abajo (no es dependencia de entrada)

- **Planificación** no solo activa al OMS (C1); también **lee `public.orders`** para
  armar los viajes tras la priorización. Comparte la tabla con el OMS (disciplina de
  columnas, `sql/37`: Planificación escribe `numero_viaje` + `lead_time_days` +
  **`dispatch_date`** + `planning_run_id`; el OMS escribe prioridad + situación +
  `oms_processed_at`). El **replan de Planif es `UPDATE in place`** sobre `orders` y
  **no toca las columnas del OMS** (`prioritization_run_id`, `oms_processed_at`,
  `priority`, `wms_situation`, `oms_score`, `handoff_status`).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/delivery-planning/bolt-plan.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/contract-design/contract-summary.md` (C1, C2).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.

## Assumptions & Open Questions

- Las dependencias 1–3 de Bolt 1 se cubren con mock/stub en el esqueleto; ninguna lo
  bloquea. La escritura real y el deploy esperan a reactivar nfr/infra-design (gate
  de reactivación de la rebanada).
- Las OQ-BO1/BO2/BO3 bloquean Bolt 2; se resuelven en la próxima reunión.
