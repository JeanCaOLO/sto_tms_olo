# Unit of Work — Devoluciones/Pickups (FR16)

Deriva de `../domain-design/components.md`, `../domain-design/decisions.md` y
`../requirements-analysis/requirements.md`. FR16.1–16.3 es un cambio cohesivo
sobre el módulo de Planificación (frontend); una sola unidad.

## Unidades

| Unit ID | Directory | Kind | Complejidad | Despliegue |
|---------|-----------|------|-------------|------------|
| U1 | `u1-devoluciones-en-secuencia` | ui | M | Embebido (app de Planificación existente) |

## U1 — Devoluciones en la secuencia de paradas

**Descripción.** Incorpora las recolecciones/devoluciones conocidas del viaje a
la secuencia de paradas del módulo de Planificación: las incluye como paradas
(FR16.1), las distingue visualmente en cards, lista y mapa (FR16.2) y las suma
al cálculo de capacidad del vehículo (FR16.3).

**Fronteras.** Toca los 6 componentes de `../domain-design/components.md`:
`ViajesAdapter`, `SecuenciaParadas`, `CapacidadVehiculo`, `GeometriaRuta`,
`PlanificacionUI` y el nuevo `TipoParadaBadge`. No toca autenticación, catálogos
ni el resto del módulo.

**Responsabilidades / entregables.**
- `Pedido.tipo` ∈ {`entrega`, `devolucion`} propagado desde `ViajesAdapter`.
- Devoluciones incluidas en `SecuenciaParadas` y en el bin-packing de
  `CapacidadVehiculo` (mismo tratamiento que un pedido de entrega).
- `TipoParadaBadge` + acento indigo en `PlanificacionUI`; tramos del mapa por
  color/patrón vía `GeometriaRuta` por leg.
- Suite e2e extendida (verificación de FR16 en `build-and-test`).

**Notas / constraints.**
- `FR16.4` fuera de esta unidad (fuera de alcance del ciclo).
- El shape del dato de la recolección es supuesto hasta OQ-4; si crece, el
  cambio se concentra en `ViajesAdapter`.
- Sin backend nuevo, sin infra (ADR-2).

## Assumptions & Open Questions

- Open question: geometría por leg de `GeometriaRuta` (aterriza en
  functional-design).

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-09-01T14:52:28Z
**Iteration:** 1
**Clase:** advisory (pase único; los hallazgos van al humano en el gate, sin ciclo de correcciones)

### Findings

| # | Severidad | Ubicación | Hallazgo | Recomendación |
|---|-----------|-----------|----------|---------------|
| 1 | Major | unit-of-work-story-map.md fila `FR16.3.2` vs. traceability.json línea 17 | Los dos artefactos discrepan sobre `FR16.3.2`. El story-map lo asigna a `U1` (orden 2, "recolección intermedia que no cabe = excluida sin reordenar"); traceability.json lo marca `Deferred` con target `FR16.4 (fuera de alcance)`. requirements.md FR16.3.2 dice que **en este ciclo** la recolección que no cabe "se marca como excluida y el planificador la resuelve a mano" (solo el reordenamiento automático se difiere). El review advisory de requirements-analysis (hallazgo #1, Major) ya marcó este límite como "punto medio no construible" sin regla de "cabe" ni criterio BDD. La descomposición en unidades hereda esa ambigüedad sin resolverla: no queda claro si `U1` debe construir el marcado-como-excluida de la recolección intermedia o no. | El humano debería fijar el límite en el gate: (a) `FR16.3.2` entero fuera de alcance → alinear el story-map con traceability.json (quitar la fila o marcarla `—`); o (b) la parte "marcar como excluida sin reordenar" queda en `U1` → alinear traceability.json (status `OK`/`Partial` → `U1`, no `Deferred`). Hoy los dos artefactos se contradicen. |
| 2 | Minor | traceability.json `"reverse": []` | El mapeo inverso unidad→requisitos está vacío. Para una sola unidad aporta poco, pero el campo del esquema queda sin poblar; un lector no ve de un vistazo el conjunto de FR que `U1` posee sin cruzar `coverage`. | Poblar `reverse` con `{ "unit": "U1", "requirements": [FR16.1, FR16.1.1, FR16.1.2, FR16.1.3, FR16.2, FR16.2.1, FR16.2.2, FR16.2.3, FR16.3, FR16.3.1, NFR-3] }` o dejar nota de que se omite por trivialidad. |
| 3 | Minor | unit-of-work-story-map.md fila `FR2` | `FR2` (bin-packing preexistente del intent padre 260825) se lista como requisito asignado a `U1` orden 2. `FR2` no es trabajo nuevo de este ciclo — es el algoritmo que `FR16.3` extiende. Incluirlo como "requisito → unidad" puede leerse como que `U1` re-implementa `FR2`. | Marcar la fila `FR2` como contexto/dependencia heredada, no como requisito en alcance de `U1`. |
| 4 | Minor | Sensor `traceability` (story-assignment) | El sensor solo casa patrones `US` y reporta `invalid_targets` para este camino sin user stories (etapa User Stories saltada, el mapa usa IDs `FR`). Limitación conocida del sensor, no defecto del artefacto: el story-map por FR es la construcción correcta cuando no hay user stories. | Sin acción; anotar el falso positivo en el gate para que no se lea como fallo real. |

### Validation Tool Results

| Tool | Result | Interpretation |
|------|--------|----------------|
| Revisión manual del edge block YAML | PASS | Un `unit`, `name: u1-devoluciones-en-secuencia`, `kind: ui` (valor de enum válido), `depends_on: []`. Bien formado. |
| Revisión manual del DAG | PASS | Nodo único, sin aristas. Trivialmente acíclico. Sin puntos de integración internos; el único externo (WMS/Iflow, OQ-4) está documentado como supuesto en requirements.md FR16.1.1, no como arista de unidad. |
| Cobertura FR en alcance → U1 | PASS | traceability.json mapea FR16.1, FR16.1.1–.1.3, FR16.2, FR16.2.1–.2.3, FR16.3, FR16.3.1 → `U1`; NFR-3 → `U1`. Sin requisitos en alcance huérfanos. |
| Exclusión de FR16.4 | PASS | `N/A` con rationale coherente en unit-of-work.md, story-map, traceability.json y requirements.md "Out of scope". |
| `kind: ui` vs. naturaleza del cambio | PASS | requirements.md NFR-2 (sin cambios de backend, mismo Supabase/RLS), ADR-2 (sin infra) y components.md ("FR16 no crea bloques backend nuevos") confirman que todo el cambio corre en el cliente de la app Vite+React existente. No hay servicio separado. `ui` es correcto. |
| Fronteras vs. components.md | PASS | Los 6 componentes que unit-of-work.md declara (`ViajesAdapter`, `SecuenciaParadas`, `CapacidadVehiculo`, `GeometriaRuta`, `PlanificacionUI`, `TipoParadaBadge`) coinciden 1:1 con el catálogo de components.md. |

### Summary

La descomposición en una sola unidad está bien justificada: FR16.1–16.3 es un cambio cohesivo de frontend sobre un módulo existente, un solo desarrollador, un solo despliegue embebido; separar por componente crearía dependencias artificiales sin ganancia de paralelismo (Q&A A/A/A/A/A, confirmado por el humano). El edge block está bien formado, el DAG es trivial y acíclico, `kind: ui` es correcto y FR16.4 está excluido de forma consistente en los cuatro artefactos. El único hallazgo sustantivo es la contradicción sobre `FR16.3.2` entre el story-map (lo pone en `U1`) y traceability.json (lo marca `Deferred`), que arrastra sin resolver la ambigüedad del "chequeo de capacidad posicional" ya señalada en el review de requirements-analysis — el humano debería cerrar ese límite en el gate. Veredicto advisory: READY.
