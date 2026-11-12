# Code Generation Plan — U1 `motor-reglas-oms` (service)

> Intent: `260826-modulo-oms`. Fase: Construction. Unidad: U1 `motor-reglas-oms`
> (kind `service`). **Reconciliado as-built 2026-10-19 al modelo v4 + ADR-013**
> (desacople priorización↔liberación).
>
> **Nota de reconciliación contable (importante)**: este plan documenta código que
> YA FUE CONSTRUIDO y verificado (rama `oms`): **36/36 tests de la unidad
> (`test_oms.py`) + 287/287 de la suite del backend**. Reconstruye el registro del
> stage Plan Approval para el código real de hoy. Los pasos abajo están en **tiempo
> pasado**: describen lo construido, NO autorizan regenerar ni sobrescribir. El
> código es la fuente de verdad; este plan lo refleja.
>
> **Supera** la versión 2026-10-01 de este plan, que describía el modelo viejo
> (`oms.pedidos`, `analizador_observaciones` como camino activo de cliente-retira,
> cola `TPEXES/TPEXSI='DISP'`, dos escrituras D6). Ese modelo quedó superado por el
> flujo invertido (D7/ADR-007), la escritura invertida (D8/ADR-008), cliente-retira
> por zona (D11/ADR-011) y el desacople priorización↔liberación (D14/ADR-013).

## Alcance de la unidad

Motor de reglas propio del OMS (C2-RESUELTO: nuevo, desde cero, sin AST compartido
con el TMS, sin tocar Liquidaciones) como Lambda Python (SAM + Layer `tms_common`).
Los componentes de la corrida viven como módulos internos de una sola Lambda.

**Modelo v4 + ADR-013 (as-built):**
- **Activación por POLLING de columna** sobre `public.orders`:
  `WHERE planning_run_id IS NOT NULL AND oms_processed_at IS NULL` (ADR-007). NO lee
  de `EXPEDICIONESCABECERA` ni usa el anti-join viejo.
- **Desacople priorización↔liberación (ADR-013)**: un barrido con DOS pasadas.
  **Priorizar** deja `wms_situation = DISP`, calcula priority/oms_score/
  prioritization_run_id, NO escribe `GENE` ni estampa `oms_processed_at`.
  **Liberar** (solo los pedidos con `now() >= dispatch_date − dias_prep_picking`,
  `dias_prep_picking = 1`) escribe `GENE`+`PRIORIDAD` por la costura
  `EscritorSituacion` (→ `sim_expedicionescabecera`, eFlow read-only) y estampa
  `oms_processed_at = now()`. Liberación **por viaje** (dispatch_date igual por
  `numero_viaje`).
- **Acción manual "Procesar a Eflow"** (gated por rol): liberación filtrada por
  `numero_viaje` (+ subconjunto opcional), ignorando la ventana.
- **Barrido**: `BARRIDO_VECES_POR_DIA = 5` (constante documentada; hora de corte/
  compañía = futuro, sin scheduler en el código).
- **cliente-retira por ZONA** (D11/ADR-011): la señal va por `delivery_zone` en el
  flujo del motor. `analizador_observaciones.py` queda como **stub DIFERIDO**
  (Bedrock futuro, D11), NO es el camino activo de cliente-retira.

## Pasos del plan (reflejo de lo construido)

- [x] **models.py** — dataclasses frozen: `PedidoCandidato` (con `dispatch_date`,
  `numero_viaje`, `planning_run_id`, `oms_processed_at`, `lead_time_days`,
  `delivery_zone`, `customer_type`), `PedidoPK`, `ResultadoRegla`,
  `RegistroPrioridad`, `ConfiguracionReglas` (con `dias_prep_picking = 1`),
  constante `BARRIDO_VECES_POR_DIA = 5`. Prioridad numérica invertida; el OMS no
  escribe fechas.
- [x] **score.py** — SUBMÓDULO PURO Y TESTEABLE (Testing Posture): `score_ponderado`
  y `score_a_prioridad`. Sin I/O.
- [x] **regla_fecha.py** — `fecha_listo = delivery_date − lead_time_days` (dinámico,
  insumo de Planificación, default 1). No modifica fechas. No aplica a EPA.
- [x] **cola_candidatos.py** — LECTURA por polling de `public.orders`:
  `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`; expone `dispatch_date`,
  `numero_viaje`, `lead_time_days`, `delivery_zone`, `customer_type`, llave EFLOW.
  Mock por default (`OMS_SOURCE`); EFLOW/réplica live aislada.
- [x] **handoff_pedidos.py** — ESCRITURA partida (ADR-013): `priorizar_pedido()`
  (UPDATE `orders`: priority/oms_score/prioritization_run_id/handoff_status, deja
  `DISP`, sin `oms_processed_at`, sin costura) y `liberar_pedido()`
  (`wms_situation='GENE'` + `oms_processed_at=now()` + escritura 2 por
  `EscritorSituacion`/`SimExpedicionesWriter` → `sim_expedicionescabecera`; state
  machine `disparo_pendiente`→`completado`, idempotencia por llave EFLOW). Predicado
  puro `en_ventana_liberacion(dispatch_date, hoy, dias_prep_picking)`. eFlow
  read-only. Comentario `ponytail:` OQ-REL1 (replan de un ya liberado → stale).
- [x] **motor_reglas.py** — orquesta la pasada de PRIORIZACIÓN (reglas por scope →
  score ponderado puro → prioridad; EPA cortocircuita; cliente-retira por zona). No
  usa `dispatch_date` (eso es de la liberación).
- [x] **analizador_observaciones.py** — **stub DIFERIDO** (D11): Bedrock futuro. NO
  es el camino activo de cliente-retira (que es por zona). Se conserva como esqueleto
  con TODO visible.
- [x] **app.py** — handler Lambda: `correr()` ejecuta las DOS pasadas (prioriza
  todo, libera los en ventana); ruta `POST /api/v1/oms/viajes/{numero_viaje}/procesar`
  (acción manual, gated por `permissions.require("oms","edit")`, ignora la ventana,
  subconjunto opcional). Resumen: total/priorizados/liberados/pendientes.
- [x] **sql/47_orders_release_indexes.sql** — índices PARCIALES de la pasada de
  liberación (`idx_order_release`, `idx_order_numero_viaje`), idempotentes,
  ROLLBACK + validación, estándar OLTP Intelix. Solo índices (la columna
  `dispatch_date` la crea Planificación).
- [x] **template.yaml / samconfig.toml** — SAM (patrón del backend), `OMS_SOURCE=mock`
  por default; infra/deploy de Intelix (W1/W2/W3 en external-dependency-map).
- [x] **Tests** (`backend/tests/test_oms.py`, registrado en `conftest.py`): **36
  tests verdes** — score puro, ReglaFecha, priorizar (deja DISP, sin
  oms_processed_at), liberar en/fuera de ventana (GENE+oms_processed_at por la
  costura), liberación por viaje, acción manual (por viaje, subconjunto, gating 403),
  re-priorización idempotente, borde del predicado de ventana, corrida e2e. Suite
  backend completa: **287/287**.

## Testing Contract
```json
{
  "version": 1,
  "methodology": "test-after",
  "source": "org",
  "ordering": "implement each testable layer, then write + run that layer's tests.",
  "scope": "classic",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "Tests = first-class deliverable in every Bolt. Specific methodology\n(TDD, BDD, ATDD, classic test-after) affirmed at practices-discovery,\nrecorded in `team.md` with explicit `Methodology` + `Ordering` fields.\nCode Generation resolves those independently from coverage, tooling,\nscope notes.\n\nNo posture affirmed → default per scope:\n- **Methodology**: test-after\n- **Ordering**: implement each testable layer, then write + run that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic`: add 80% line-coverage\n  floor + CI execution before merge.\n- `bugfix`, `security-patch`: add targeted regression for the specific\n  bug/vuln. Existing suite stays green.\n- `express`: Minimal strategy. Requirement-driven unit tests (one per\n  requirement, happy-path floor per component). Existing tests stay green.\n- `poc`, `refactor`, `workshop`: no extra new-test floor. Existing suite\n  stays green.\n\nActive `Test Strategy` applies in every scope. Determines volume + types.\nScope floors additive. Never reduce or replace selected strategy.\n\nBuild and Test verify coverage floors + quality targets. Never weaken to\nmake step pass.\n\nAffirm stricter posture in `team.md` if team commits."
    },
    {
      "layer": "project",
      "text": "- La lógica de negocio (en especial el cálculo de prioridad del OMS) debe extraerse a módulos `.ts` puros, fuera de los componentes `.tsx` de página, para que sea probable sin montar React (learned 2026-08-28)"
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Keep the existing test suite green.",
      "This scope adds no extra new-test floor beyond the selected test strategy."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "test-after",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Data model / database behavior - implement.",
      "Data model / database behavior - write and run its tests after implementation.",
      "Repository / data access - implement.",
      "Repository / data access - write and run its tests after implementation.",
      "Business logic - implement.",
      "Business logic - write and run its tests after implementation.",
      "API / endpoint - implement.",
      "API / endpoint - write and run its tests after implementation.",
      "Frontend behavior - implement.",
      "Frontend behavior - write and run its tests after implementation.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:3480aeb554b79dd3db387e6282ea5350a7090580e0520c82c31b9b985333308e",
  "contract_sha256": "sha256:584f0f60ec824f61c2153b2f1b56861324697bf096b15b429cba33e9341d4989"
}
```

> Nota: el Testing Contract de arriba es el posture resuelto por la framework
> (test-after, scope classic), pegado **verbatim** de `aidlc-testing-posture.ts
> render --unit motor-reglas-oms`. Los layers/steps genéricos (incl. "Frontend
> behavior") son del template del posture; U1 es backend puro, así que esa capa es
> inaplicable y no se construyó. Lo construido cumple el contrato: `score.py` y el
> predicado `en_ventana_liberacion` son submódulos puros testeables. 36 tests verdes
> de la unidad y 287/287 de la suite del backend.

## Archivos de aplicación tocados

Ver `source-manifest.json` (misma carpeta). Resumen: `backend/oms/src/*.py` (8
módulos) + `backend/oms/template.yaml` + `backend/oms/samconfig.toml` +
`backend/tests/test_oms.py` + `backend/tests/conftest.py` + `sql/47_orders_release_indexes.sql`.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md` (U1).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/decisions.md` (ADR-001, ADR-005, ADR-006, ADR-007, ADR-008, ADR-010, ADR-011, **ADR-013**).
- `aidlc/spaces/default/intents/260826-modulo-oms/construction/motor-reglas-oms/functional-design/` (functional-spec, rules, entities).
- `docs/work/2026-10/2026-10-19-adr013-desacople-priorizacion-liberacion.md`.

## Assumptions & Open Questions

- Plan reconstruido/reconciliado post-hoc (as-built); el código ya existe y pasa
  tests (36/287). No regenerar.
- **OQ-REL1** (replan de un pedido ya liberado → stale): documentada, no bloquea v1.
- Escritura 2 a eFlow real = por **endpoint EPRAC** (futuro) detrás de la costura;
  hoy simulada en `sim_expedicionescabecera`.
- `analizador_observaciones.py`: stub diferido (D11, Bedrock futuro); cliente-retira
  activo es por zona.
