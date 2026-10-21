# ADR-013 — desacople priorización↔liberación; liberación por viaje vía `dispatch_date`

**Fecha:** 2026-10-19
**Intent AI-DLC:** `260826-modulo-oms`
**Tipo:** cambio de flujo de negocio (cerrado con Planificación/EPRAC) + iteración de código as-built
**Rama:** `oms`

> El negocio cerró un cambio de flujo (reuniones 2026-10-19/20) y el contrato con
> Planificación quedó totalmente definido e implementado del lado de Planificación
> (rama `planificacion-2`). Esta entrada documenta la **absorción en los artefactos
> de Inception** y la **iteración de código as-built** de U1 que lo implementa.

## Qué cambió (ADR-013 / D14)

El OMS **ya no manda los pedidos a eFlow al priorizar**, sino **el día antes de la
salida del viaje**. La unidad de liberación es el **viaje** (todos sus pedidos se
liberan juntos). Un único barrido programado (v1 = 5×/día; frecuencia/hora de corte
= futuro, por compañía) corre **dos pasadas** sobre `public.orders`, grano pedido:

- **Priorizar**: cola `planning_run_id IS NOT NULL AND oms_processed_at IS NULL` →
  `priority`/`oms_score`/`prioritization_run_id`; deja `wms_situation = DISP`; **no**
  escribe `GENE` ni estampa `oms_processed_at`. Idempotente (re-prioriza lo no
  liberado, absorbe replan).
- **Liberar**: de lo priorizado-no-liberado, los que
  `now() >= dispatch_date − dias_prep_picking` (`dias_prep_picking = 1` por defecto,
  política del OMS) → escribe `GENE`+`PRIORIDAD` por la costura `EscritorSituacion`
  (→ `sim_expedicionescabecera`) y estampa `oms_processed_at = now()`.

Liberación **por viaje "gratis"**: `dispatch_date` es igual para todos los pedidos de
un `numero_viaje`, así que cruzan la ventana juntos; se lee **solo `orders`**, nunca
`plan_trips`/`routes`. Acción manual **"Procesar a Eflow"** (gated por rol) = la
pasada de liberación filtrada por `numero_viaje` (+ subconjunto opcional), ignorando
la ventana.

**Semántica de columnas** (precisa ADR-007): `oms_processed_at` = **liberado a
eFlow** (no "priorizado"); `prioritization_run_id` = corrida de priorización.

## Absorción en artefactos de Inception

- **`decisions.md`**: **ADR-013** nuevo (Contexto/Decisión/Consecuencias/Alternativas,
  OQ-REL1). **ADR-007** precisado (cola por `planning_run_id`; `oms_processed_at` =
  liberado; GENE diferido; cross-ref ADR-013; corregido un `wms_trip_number` stale).
  **ADR-008** precisado (escritura 2 ocurre en la liberación, no al priorizar).
- **`user-stories/stories.md`**: US0/US1 corregidas; **US9** ahora solo priorización
  (deja `DISP`, sin GENE/`oms_processed_at`); **US9b** (liberación automática por
  ventana, por viaje) y **US9c** ("Procesar a Eflow" manual, gated) nuevas; US-EPA
  alineada; re-priorización idempotente; OQ-REL1 añadida. E6 (Simulador) marcada
  fuera de alcance.
- **`user-stories/traceability.json`**: US9b/US9c en story-map y trace; FR8 →
  US9/US9b/US9c; FR4 → US9c; E6 out-of-scope; OQ-REL1; nota v4.1.
- **`delivery-planning/external-dependency-map.md`**: `orders.dispatch_date` y
  limpieza-al-caerse (ya implementadas en `planificacion-2`), reparto `sql/37`, y el
  **riesgo de despliegue** (no de diseño) hasta mergear `planificacion-2` — anotado,
  no bloquea.
- **`memory/project.md` `## Decided` (§13)**: (a) ADR-013/D14 con semántica de
  columnas; (b) **Simulador FUERA DE ALCANCE**, que **supersede** el DECIDED
  "Simulador = configurador" (2026-09-15), marcado SUPERADO inline.

## Código (as-built, `backend/oms/src`, `backend/tests`, `sql/`)

- **`handoff_pedidos.py`**: `ejecutar()` partido en `priorizar_pedido()`
  (`PRIORIZAR_PEDIDO_SQL`: deja `DISP`, `handoff_status='priorizado'`, no estampa
  `oms_processed_at`, no toca la costura) y `liberar_pedido()`
  (`LIBERAR_PEDIDO_SQL`: `wms_situation='GENE'` + `oms_processed_at=now()`, escritura
  2 por `EscritorSituacion`/`SimExpedicionesWriter`, state machine
  `disparo_pendiente→completado` e idempotencia por llave EFLOW conservados). Nuevo
  predicado puro `en_ventana_liberacion(dispatch_date, hoy, dias_prep_picking)`
  (`hoy >= dispatch_date − dias_prep`, NULL→False). Comentario `ponytail:` OQ-REL1.
- **`cola_candidatos.py` / `models.py`**: `dispatch_date` en `COLA_SQL` + mapeo +
  mock; `dispatch_date` en `PedidoCandidato`; `dias_prep_picking=1` en
  `ConfiguracionReglas`; constante `BARRIDO_VECES_POR_DIA=5` documentada (sin
  scheduler). Filtro de cola sin cambios.
- **`motor_reglas.py`**: docstring aclara que el motor es la pasada de priorización;
  sin cambio funcional.
- **`app.py`**: `correr()` hace dos pasadas (prioriza todo, libera los en ventana);
  nueva ruta `POST /api/v1/oms/viajes/{numero_viaje}/procesar` (`procesar_viaje`,
  gated por `permissions.require("oms","edit")`, ignora la ventana, subconjunto
  opcional de expediciones). Resumen: total/priorizados/liberados/pendientes.
- **`sql/47_orders_release_indexes.sql`** (nuevo, idempotente, ROLLBACK +
  validación, estándar OLTP Intelix): `idx_order_release` e `idx_order_numero_viaje`
  parciales. Solo índices — la columna `dispatch_date` la crea Planificación.
- **`test_oms.py`**: cubre (a) priorizar deja `DISP` sin `oms_processed_at` ni
  costura; (b) liberar en ventana escribe `GENE`+`oms_processed_at` por la costura;
  (c) `disparo_pendiente` si falla la escritura 2; (d) fuera de ventana no libera;
  (e) acción manual por viaje ignora ventana + subconjunto + gating 403; (f) barrido
  dos pasadas end-to-end + borde del predicado de ventana (falla si se rompe `>=`);
  re-priorización idempotente.

## Verificación

- **`pytest tests/test_oms.py -q` → 36 passed** (re-corrido de forma independiente
  por el orquestador en un venv temporal `backend/.venv_verify`, Python 3.14 +
  pg8000 + pytest 8.3.3; venv y `__pycache__`/`.pytest_cache` eliminados tras
  verificar).
- Suite completa del backend reportada por el workflow: **287 passed** (tras instalar
  `boto3`/`tzdata` en el venv temporal; 4 errores de setup en `test_alerts.py` y 1 de
  colección en `test_realtime.py` eran por dependencias ausentes en Windows ajenas a
  este cambio, no por el código del OMS). El orquestador verificó de forma
  independiente los 36 del OMS; la cifra de 287 proviene del run del workflow.
- Review semántico del diff contra el contrato ADR-013: **APPROVED**. Dos findings
  **no bloqueantes**: (1) la evidencia del run de pytest no quedó como artefacto en
  el repo (vive en los mensajes del workflow y en esta entrada); (2) asimetría
  cosmética de shape (falta `priorizados` en la respuesta de la acción manual).

## Estimación

**No se capturaron datos de estimación para esta iteración** (esfuerzo/puntos/
tiempo). No se reconstruyen ni se inventan. `team.md` no afirma un umbral de
estimación obligatoria, así que esta iteración no lo requiere; queda explícito como
gap.

## U2 backorder diferida del unit set de Construction (2026-10-19)

Code Generation es `execution: ALWAYS` y no admite skip por unidad (a diferencia de
las etapas CONDITIONAL NFR/Infra). Como **U2 `backorder-inventario-oms`** está
bloqueada (OQ-BO1 tabla/estado de acciones omitidas en EFLOW, OQ-BO2 fuente de
inventario, OQ-BO3 disparador — sin definición de negocio ni código), se la **retiró
del unit set de esta pasada de Construction** para que Code Generation se asiente
solo sobre U1 (as-built) y llegue a su gate.

- **U2 NO se elimina del proyecto**: sigue descrita en
  `inception/units-generation/unit-of-work-dependency.md` (prosa + bloque `text` con
  su entrada) y en `unit-of-work.md` como unidad futura. Solo salió del bloque
  `units` activo que el motor compila como `bolt_dag`.
- **Cómo re-agregar U2** (cuando negocio cierre OQ-BO1/BO2/BO3): reinsertar la
  entrada `backorder-inventario-oms` (`depends_on: [motor-reglas-oms]`) en el bloque
  `units` de `unit-of-work-dependency.md`, correr
  `bun .kiro/tools/aidlc-runtime.ts compile`, y re-entrar a Construction por U2. La
  arista `U2 → U1` (reusa `HandoffPedidosOMS`) sigue válida. Reversible y trazable.
- Coherente con el skip de U2 en Functional Design y con el `bolt-plan` (Bolt 2
  bloqueado hasta cerrar BO1/BO2/BO3).

## Wiring de infraestructura/despliegue (Intelix, SAM estándar)

Registrado en `external-dependency-map.md` al saltar Infrastructure Design as-built:
- **W1** — trigger programado (EventBridge Scheduler/cron SAM) del barrido **5×/día**
  (`BARRIDO_VECES_POR_DIA=5`).
- **W2** — ruta de API Gateway `POST /api/v1/oms/viajes/{numero_viaje}/procesar`
  cableada al handler, **gated por rol** (`permissions.require("oms","edit")`).
- **W3** — IAM de **escritura** del rol del Lambda a `sim_expedicionescabecera` (eFlow
  real queda read-only; cuando exista el endpoint EPRAC, el wiring de red cambia a él
  sin tocar el motor).

No bloquea la construcción de U1 (el esqueleto corre en mock/local). Infra y deploy
los hace Intelix sobre SAM estándar.

## Pendiente / abierto (no bloquea v1)

- **OQ-REL1**: un pedido ya liberado (`oms_processed_at` estampado) que un replan
  mueva a otro viaje/fecha queda potencialmente stale; sin reconciliación en v1.
- **Finding cosmético** del review: añadir `priorizados` a la respuesta de
  `procesar_viaje` para simetría de shape (opcional).
- **Endpoint real de EPRAC** detrás de la costura `EscritorSituacion` (sigue
  simulado en `sim_expedicionescabecera`).
- **Riesgo de despliegue**: la limpieza-al-caerse vive en `planificacion-2`; hasta su
  merge/despliegue podría quedar algún pedido caído con sello viejo (la cola es
  segura igual).

## Fuentes

- ADR-013, ADR-007, ADR-008: `aidlc/.../inception/domain-design/decisions.md`.
- Stories: `aidlc/.../inception/user-stories/stories.md` (US9/US9b/US9c), `traceability.json`.
- Dependencias: `aidlc/.../inception/delivery-planning/external-dependency-map.md`, `sql/37`.
- §13: `aidlc/spaces/default/memory/project.md` (`## Decided`).
- Código: `backend/oms/src/{app,handoff_pedidos,cola_candidatos,models,motor_reglas}.py`, `backend/tests/test_oms.py`, `sql/47_orders_release_indexes.sql`.
- Plan y review del workflow: `.agents/tasks/oms-adr013-plan.md`, `.agents/tasks/oms-adr013-review.md`.
