# Mapa de dependencias externas — Módulo OMS (v4)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (re-corrida v4, 2026-10-16).
> Mapea los ítems gated (fuera del control del OMS) a los Bolts que los consumen.
> Consume: bolt-plan.md, contract-summary.md.

## Dependencias gated

| # | Dependencia | Dueño | Bloquea | Estado en Bolt 1 | Qué pasa si se atrasa |
|---|---|---|---|---|---|
| 1 | **Columnas nuevas** `orders.oms_processed_at`, `orders.lead_time_days`, `plan_trips.lead_time_days` | Dueño de Planificación (en su PR de tablas) | Bolt 1 (lectura/estampado reales) | Esqueleto usa mock de `orders`; contrato C1 definido | Bolt 1 corre contra mock; al mergear el PR, se cablea la lectura real sin cambiar la lógica |
| 2 | **Señal de activación** (lambda/evento de Planificación) | Planificación | Bolt 1 (disparo real) | Señal **simulada**; el pull por columna + barrido no dependen de ella | La columna es la fuente de verdad: el barrido periódico cubre el disparo aunque la señal no exista aún |
| 3 | **Réplica/acceso EFLOW real** (escritura 2) | Alfredo (solicitar) | Bolt 1 (escritura real a EFLOW) | **Mock/stub** de la escritura 2 | Esqueleto escribe contra mock; al existir, se cambia el adaptador |
| 4 | Catálogos `TIPOSINTEGRACION`, `CLIENTES`/`ALMACENCOMPANIA` | WMS/EFLOW (pedir) | code-generation en vivo | Valores conocidos (`DISP`/`GENE`); scopes parametrizados | Pedir antes de correr contra datos reales; no bloquea el esqueleto |

## Dependencias que BLOQUEAN el Bolt 2 (backorder)

| # | Dependencia (OQ) | Pregunta | Estado |
|---|---|---|---|
| BO1 | Acciones omitidas en EFLOW | ¿De qué tabla/estado las lee el OMS? | **ABIERTA** — próxima reunión |
| BO2 | Fuente de inventario | ¿Qué fuente consulta el OMS? | **ABIERTA** — próxima reunión |
| BO3 | Disparador del re-chequeo | ¿Evento de entrada de inventario o barrido periódico? | **ABIERTA** — próxima reunión |

**Bolt 2 (U2) no entra a construcción hasta cerrar BO1/BO2/BO3.**

## Consumidor aguas abajo (no es dependencia de entrada)

- **Planificación** no solo activa al OMS (C1); también **lee `public.orders`** para
  armar los viajes tras la priorización. Comparte la tabla con el OMS (disciplina de
  columnas: Planificación escribe viaje + `lead_time_days`; el OMS escribe prioridad
  + situación + `oms_processed_at`).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/delivery-planning/bolt-plan.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/contract-design/contract-summary.md` (C1, C2).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.

## Assumptions & Open Questions

- Las dependencias 1–3 de Bolt 1 se cubren con mock/stub en el esqueleto; ninguna lo
  bloquea. La escritura real y el deploy esperan a reactivar nfr/infra-design (gate
  de reactivación de la rebanada).
- Las OQ-BO1/BO2/BO3 bloquean Bolt 2; se resuelven en la próxima reunión.
