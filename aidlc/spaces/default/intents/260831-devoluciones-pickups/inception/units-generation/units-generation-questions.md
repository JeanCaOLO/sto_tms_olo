# Units Generation — Preguntas

Contexto: `../domain-design/components.md`, `../requirements-analysis/requirements.md`.

## Q1. ¿Estrategia de frontera de unidades?

- A. Por feature — una sola unidad para todo FR16.1–16.3. Los 6 componentes que toca (`ViajesAdapter`, `SecuenciaParadas`, `CapacidadVehiculo`, `GeometriaRuta`, `PlanificacionUI`, `TipoParadaBadge`) cambian de forma acoplada y se prueban juntos con el flujo e2e.
- B. Una unidad por componente.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Una sola unidad por feature. FR16 es un cambio cohesivo sobre un módulo de frontend; separarlo por componente crearía dependencias artificiales sin ganancia de paralelismo (un solo desarrollador, un solo despliegue).

## Q2. ¿Granularidad (gruesa vs. fina)?

- A. Gruesa — una unidad. FR16.1–16.3 comparten el mismo modelo de datos (`Pedido.tipo`) y el mismo flujo; el orden interno (FR16.2 → FR16.3 → FR16.1) lo maneja el backlog, no unidades separadas.
- B. Fina.
- X. Other (please specify)

[Answer]: A. Gruesa, una unidad.

## Q3. ¿Dependencias entre unidades / paralelismo?

- A. No aplica — una sola unidad, DAG trivial (un nodo, sin aristas).
- X. Other (please specify)

[Answer]: A. Un solo nodo.

## Q4. ¿Puntos de integración / contratos entre unidades?

- A. Ninguno interno. El único contrato externo es con el WMS (shape de la recolección, OQ-4) y ya está documentado como supuesto en requirements.md.
- X. Other (please specify)

[Answer]: A. Sin contratos internos entre unidades.

## Q5. ¿Modelo de despliegue?

- A. Embebido — la unidad viaja en el despliegue de la app de Planificación existente. Sin despliegue independiente, sin infra nueva (ADR-2).
- X. Other (please specify)

[Answer]: A. Embebido en la app existente.

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en unit-of-work.md, unit-of-work-dependency.md, unit-of-work-story-map.md y traceability.json:

- **Una sola unidad:** `U1` — `u1-devoluciones-en-secuencia`. Kind: `ui`. Complejidad: **M**. Despliegue: embebido en la app de Planificación.
- **Responsabilidad de U1:** implementar FR16.1–16.3 sobre los 6 componentes de `../domain-design/components.md` (ViajesAdapter, SecuenciaParadas, CapacidadVehiculo, GeometriaRuta, PlanificacionUI, TipoParadaBadge).
- **DAG:** un solo nodo, sin aristas. Sin puntos de integración internos.
- **Story map:** sin user stories (etapa saltada); el mapa relaciona los ítems del backlog (FR16.2 → FR16.3 → FR16.1) con U1.
- **traceability.json:** cada FR16.x → U1 (FR16.4 = N/A, fuera de alcance).

- Looks correct
- Request changes

[Answer]: Looks correct
