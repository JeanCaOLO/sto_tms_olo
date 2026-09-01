# Architecture Decision Records — Devoluciones/Pickups (FR16)

Sobre `components.md` y `../requirements-analysis/requirements.md`.

## ADR-1 — Una devolución es un atributo de `Pedido`/`Parada`, no una entidad separada

**Context.** FR16 introduce recolecciones/devoluciones en la secuencia de
paradas. Podría modelarse como una entidad `Devolucion` propia, o como una
variante de la entidad `Pedido`/`Parada` existente.

**Decision.** Se añade un atributo discriminador `tipo` ∈ {`entrega`,
`devolucion`} a `Parada`. No hay entidad nueva.

**Consequences.**
- (+) FR16.1–16.3 se implementan reutilizando todo el shape de `Pedido`
  (`total_weight`, `total_volume`, coords, excepción); el bin-packing y la
  optimización no distinguen tipo salvo donde el requisito lo pide.
- (+) Un solo camino de datos; menos superficie de test.
- (−) Si el futuro módulo de Devoluciones necesita estado/campos propios de una
  devolución (OQ-4), habrá que extender `Parada` o introducir una entidad
  entonces. FR16.1.1 ya lo marca como supuesto.

**Alternatives Rejected.** Entidad `Devolucion` separada — duplica el shape sin
ganancia para el alcance actual.

**Nota de semántica.** Cuando `tipo === devolucion`, la semántica de algunos
campos de `Pedido` se invierte respecto a una entrega: `delivery_address` es la
dirección de **recogida**, y `total_weight` / `total_volume` es carga
**entrante** al vehículo (no saliente). El bin-packing (FR16.3) los trata igual
para efectos de ocupación; la UI (FR16.2) los etiqueta como recogida.

## ADR-2 — FR16 es un cambio de cliente; no se introducen componentes backend

**Context.** El módulo de Planificación corre en el navegador (Vite + React)
sobre Supabase; la lógica de secuencia y capacidad es client-side. FR16 no
requiere cálculo en tiempo real ni nueva integración de servidor.

**Decision.** Todos los cambios de FR16 viven en los bloques client-side
existentes (`ViajesAdapter`, `SecuenciaParadas`, `CapacidadVehiculo`,
`PlanificacionUI`) más el componente de UI `TipoParadaBadge`. Sin nuevos
servicios, sin infraestructura.

**Consequences.**
- (+) Sin trabajo de infra/despliegue (coherente con el recorte de alcance).
- (+) La feature viaja en el pipeline existente.
- (−) La forma final del dato de la recolección depende del WMS/`trips` real y
  de OQ-4; hasta entonces se trabaja sobre el shape asumido.

**Alternatives Rejected.** Un servicio de integración dedicado a devoluciones —
prematuro; ese contrato lo define el futuro módulo de Devoluciones.

## Assumptions & Open Questions

- Open question: OQ-4 (contrato de datos con Devoluciones) puede revisar ADR-1.
