# Code Generation Plan — U1 `motor-reglas-oms` (service)

> Intent: `260826-modulo-oms`. Fase: Construction. Unidad: U1 `motor-reglas-oms`
> (kind `service`). 2026-10-01.
>
> **Nota de reconciliación contable (importante)**: este plan documenta código que
> YA FUE CONSTRUIDO y verificado en este tramo (16/16 tests de la unidad + 142/142
> de la suite del backend). Reconstruye el registro del stage Plan Approval que se
> omitió al generar el esqueleto directo por decisión del usuario. Los pasos abajo
> están en **tiempo pasado**: describen lo hecho, NO autorizan regenerar ni
> sobrescribir. El código es la fuente de verdad; este plan lo refleja.

## Alcance de la unidad

Esqueleto ejecutable del **motor de reglas propio del OMS** (C2-RESUELTO: nuevo,
desde cero, sin AST compartido con el TMS, sin tocar Liquidaciones) como Lambda
Python (patrón del backend: SAM + Layer `tms_common`). Los 5 componentes de la
rebanada viven como módulos internos de una sola Lambda.

El **functional-design fue DIFERIDO** y se compensó INLINE: cada módulo lleva
firmas tipadas (type hints Python) + docstrings de contrato (entradas, salidas,
errores). Las etapas nfr-requirements, nfr-design e infrastructure-design están
DIFERIDAS con gate de reactivación (ver `external-dependency-map.md`): no se
conecta a datos reales ni se despliega hasta reactivarlas.

## Pasos del plan (reflejo de lo construido)

- [x] **models.py** — modelos de dominio (dataclasses frozen): `PedidoCandidato`,
  `PedidoPK`, `ResultadoRegla`, `RegistroPrioridad`, `PedidoOMS`,
  `ConfiguracionReglas`. Prioridad numérica invertida; el OMS no escribe fechas.
- [x] **score.py** — SUBMÓDULO PURO Y TESTEABLE (Testing Posture del proyecto):
  `score_ponderado(resultados, config)` y `score_a_prioridad(score, cliente_retira,
  config)`. Sin I/O. `PRIORIDAD_BASE=100`, `PRIORIDAD_MINIMA=1`.
- [x] **regla_fecha.py** — regla T-1 sobre `FECHAEXPEDICIONPLANIFICADA` (insumo, no
  se modifica); duración de ruta estimada por scope; fallback por VALOR CENTINELA
  (`1900-01-01`), no por NULL (la columna es NOT NULL). `evaluar(pedido, config, hoy)`
  pura (hoy inyectado).
- [x] **analizador_observaciones.py** — clasifica `OBSERVACIONESEXPEDICION`
  (cliente-retira). `Clasificador` inyectable; `clasificador_stub` determinístico
  por keywords (Bedrock DIFERIDO, TODO visible). Degrada sin bloquear si el
  clasificador falla.
- [x] **cola_candidatos.py** — adaptador de LECTURA de EFLOW/WMS. Filtro
  `TPEXES/TPEXSI='DISP'`, `FECHACIERRE IS NULL`, `NUMEROVIAJEWMH IS NULL` (SQL de
  referencia). Mock por default (`OMS_SOURCE`); réplica EFLOW DIFERIDA (OQ-2, TODO).
- [x] **handoff_pedidos.py** — adaptador de ESCRITURA, DOS ESCRITURAS (D6): (1)
  tabla propia del OMS (`oms.pedidos`, U2); (2) `TPEXSI='GENE'` en el WMS (`TPEXES`
  permanece `'DISP'`). Orden 1→2 sin 2PC, idempotencia por PK, `estado_handoff`
  (`disparo_pendiente`/`completado`). Flag `escribir_prioridad_al_wms` PARAMETRIZABLE
  (default False) con TODO: destino de `PRIORIDAD` (tabla OMS / WMS / ambos) por
  confirmar con negocio.
- [x] **motor_reglas.py** — orquesta: `priorizar(pedidos, resolver_config, hoy,
  clasificador)` resuelve reglas por scope → ejecuta reglas → score ponderado puro
  → efecto cliente-retira → prioridad. `config_por_defecto` (TODO: CatalogoReglas).
- [x] **app.py** — handler Lambda `tms_handler(ROUTES)`: `GET /api/v1/oms/health`,
  `POST /api/v1/oms/corridas`. `correr()` orquesta la corrida de punta a punta.
- [x] **template.yaml / samconfig.toml** — SAM (patrón de context), `OMS_SOURCE=mock`
  por default, TODO EventBridge/infra en infrastructure-design DIFERIDA.
- [x] **Tests** (`backend/tests/test_oms.py`, registrado en `conftest.py`): 16 tests
  verdes — score puro, ReglaFecha (urgente/margen/centinela), observaciones
  (stub/degradación), handoff (flag/estado), motor (cliente-retira), corrida e2e en
  mock, health route. Suite backend completa: 142/142.

## Testing Contract
```json
{
  "version": 1,
  "methodology": "test-after",
  "source": "org",
  "ordering": "implement each applicable testable layer, then write and run",
  "scope": "classic",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
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
  "input_sha256": "sha256:694c4dd589390da166caab47825553eb71c840fd24b3f96634e2d948ec021293",
  "contract_sha256": "sha256:135ea76769460f0a3521c010e9f96aebe07c4865bbf47b7282d008da932314da"
}
```

> Nota: el Testing Contract de arriba es el posture resuelto por la framework
> (test-after, scope classic). Lo construido lo cumple: el cálculo de score se
> extrajo a `score.py` como submódulo puro testeable (regla de Testing Posture del
> proyecto), con 16 tests verdes de la unidad y 142/142 de la suite del backend.

## Archivos de aplicación tocados

Ver `source-manifest.json` (misma carpeta). Resumen: `backend/oms/src/*.py` (8
módulos) + `backend/oms/template.yaml` + `backend/oms/samconfig.toml` +
`backend/tests/test_oms.py` + `backend/tests/conftest.py` (registro del stack).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md` (U1).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (5 componentes).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/decisions.md` (ADR-001..006, C2/C3/D6).
- `docs/wms-eflow/EFLOW_OLO-ddl.sql` (DDL real).

## Assumptions & Open Questions

- Plan reconstruido post-hoc para reconciliar el gate; el código ya existe y pasa
  tests. No regenerar.
- Destino de la escritura de `PRIORIDAD` al WMS: por confirmar (flag parametrizable).
- Réplica EFLOW y Bedrock: diferidos, con mock/stub y TODO visible.
