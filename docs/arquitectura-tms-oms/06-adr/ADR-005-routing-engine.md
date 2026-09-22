# ADR-005 — Motor de Ruteo (Routing Engine)

**Estado:** Propuesto

## Contexto

El prompt maestro pide generación dinámica de rutas considerando decenas de
variables simultáneas (capacidad, ventanas, licencias, costo, SLA, km
vacíos, etc.) y explícitamente prohíbe "implementar un algoritmo casero
deficiente si existe una solución robusta" (§15).

## Decisión

Usar una librería de optimización de rutas madura (recomendado: **Google
OR-Tools**, modelo VRPTW) como motor de ruteo, ejecutada como *job*
asíncrono (no bloqueando requests HTTP), con `optimization_runs` /
`optimization_results` persistidos para auditoría (ADR-007).

## Consecuencias

- Requiere evaluar si OR-Tools corre dentro del monolito Node (bindings) o
  como servicio/Lambda Python separado — decisión técnica de la Fase 8 del
  roadmap, no de este ADR.
- El resultado de cada corrida debe ser reproducible dado el mismo input
  (mismo `optimization_run` con los mismos parámetros snapshot) para que la
  auditoría tenga sentido.

## Alternativas rechazadas

- **Heurística propia (nearest-neighbor simple, sin 2-opt/3-opt)**:
  rechazada explícitamente por el prompt maestro y por buen juicio de
  ingeniería — es exactamente el tipo de "algoritmo casero deficiente" que
  se pide evitar.
- **Bloquear el request HTTP durante la optimización**: rechazado por
  requisitos de performance (§43) — a partir de cientos de pedidos el
  cálculo puede tardar más de lo aceptable para un request síncrono.
