# Mapa de dependencias externas — Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (2026-10-01). Mapea los
> ítems gated (fuera del control del equipo) a los Bolts que los consumen. Consume:
> bolt-plan.md, unit-of-work.md.

## Dependencias gated

Ninguna de estas **bloquea** el esqueleto: Bolt 1 corre con mock/stub y deja la
dependencia marcada como deuda explícita con `TODO` visible en el código.

| # | Dependencia | Dueño | Bloquea | Estado en Bolt 1 | Lead time / qué pasa si se atrasa |
|---|---|---|---|---|---|
| 1 | Réplica de `EFLOW_OLO` (lectura real de pedidos del WMS) | Alfredo (solicitar) | Bolt 1 (lectura real) | **Mock** de lectura en `ColaCandidatos` | Sin fecha. Si se atrasa, el esqueleto sigue corriendo contra mock; al llegar, se cambia solo el adaptador de lectura |
| 2 | Integración con Amazon Bedrock (clasificación IA de observaciones) | Equipo (a construir) | Bolt 1 (clasificación real) | **Clasificador stub** determinístico en `AnalizadorObservaciones` | A construir. Si se atrasa, el stub cubre el caso cliente-retira en tests; la IA real entra después sin re-arquitectura |
| 3 | Catálogo `TIPOSINTEGRACION` (valores de `TPEXSI`: `DISP`/`GENE`...) | WMS/EFLOW (pedir) | code-generation en vivo | Valores conocidos del DDL (`DISP`, `GENE`) usados en el esqueleto | Pedir antes de correr contra datos reales; no bloquea el esqueleto |
| 4 | Catálogos `CLIENTES` / `ALMACENCOMPANIA` (maestro de compañía por scope) | WMS/EFLOW (pedir) | code-generation en vivo | Scopes parametrizados; sin maestro real | Pedir antes de correr contra datos reales; no bloquea el esqueleto |

## Consumidor aguas abajo (no es dependencia de entrada)

- **Planificación** (`260825-route-planning-reqs`, otro intent) **lee** la tabla
  `PedidosOMS` (U2) como superficie de handoff. No es una dependencia de entrada de
  Bolt 1 — es el consumidor de su salida. Bolt 1 debe dejar el esquema `PedidosOMS`
  en la forma que Planificación espera leer.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/delivery-planning/bolt-plan.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work-dependency.md`.

## Gate de reactivación de etapas de diseño DIFERIDAS (NO canceladas)

Para construir SOLO el esqueleto de U1 se **difirieron** (no se cancelaron)
cuatro etapas de Construction. El diseño funcional se compensó **inline** en el
código (firmas tipadas + docstrings de contrato). Las otras tres son un **gate de
reactivación obligatorio** antes de salir del esqueleto:

| Etapa diferida | Qué cubre | DEBE correr ANTES de |
|---|---|---|
| `functional-design` | Firmas/contratos de los 5 módulos | Compensada inline en el código (no requiere reactivación para el esqueleto; reactivar si se formaliza el diseño por-unidad) |
| `nfr-requirements` | Requisitos no-funcionales, **seguridad** | (a) conectar el motor al WMS/EFLOW **real**; (b) desplegar al **sandbox**; (c) cualquier paso hacia **producción** |
| `nfr-design` | Diseño NFR (seguridad, resiliencia, performance) | Igual que nfr-requirements: antes de WMS real / sandbox / producción |
| `infrastructure-design` | Plantilla **SAM**, **IAM** del Lambda, EventBridge, red/VPC a Aurora | Antes de **desplegar al sandbox** o a producción |

**Regla**: el esqueleto corre contra mocks/stubs y es ejecutable local/en tests
SIN este diseño. En el momento en que se intente (a) lectura/escritura real contra
EFLOW/WMS, (b) un deploy al sandbox, o (c) un paso a producción, **PARAR y reactivar
`nfr-requirements` + `nfr-design` + `infrastructure-design`** (`/aidlc --stage
<slug>`). No conectar datos reales ni desplegar con estas etapas aún diferidas.

## Assumptions & Open Questions

- Si la réplica de EFLOW o Bedrock llegan durante Bolt 1, se incorporan sin esperar
  a un Bolt posterior (son cambios de adaptador aislados).
- Las 4 etapas de diseño diferidas tienen el gate de reactivación de arriba; no se
  olvidan por estar saltadas.
