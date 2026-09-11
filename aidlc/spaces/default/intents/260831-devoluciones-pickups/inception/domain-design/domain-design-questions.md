# Domain Design — Preguntas

Contexto: `../requirements-analysis/requirements.md` (FR16.1–16.3) y el módulo
existente `src/pages/planificacion/`.

## Q1. ¿FR16 agrega componentes/bloques nuevos o solo modifica los existentes?

- A. Solo modifica los existentes. El módulo de Planificación ya tiene sus bloques (adaptador de viajes, motor de secuencia de paradas, cálculo de capacidad, UI de la página). FR16 los toca; no nace ningún bloque nuevo salvo un pequeño componente de UI (`TipoParadaBadge`).
- B. Requiere un componente nuevo dedicado a devoluciones.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Solo modificación. El catálogo documenta los 4 bloques lógicos que FR16 toca + `TipoParadaBadge` (UI). No hay backend nuevo — todo corre en el cliente sobre Supabase.

## Q2. ¿Cómo se modela una "devolución" en el dominio?

- A. No es una entidad nueva. Una parada/pedido gana un atributo discriminador `tipo` ∈ {`entrega`, `devolucion`}. Todo el resto del shape (`Pedido`) se reutiliza. La entidad sigue siendo `Pedido`/`Parada`, propiedad del bloque de secuencia.
- B. Es una entidad `Devolucion` separada.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Atributo `tipo` en `Pedido`. Sin entidad nueva. Coincide con FR16.1.1 (mismo shape + flag).

## Q3. ¿Hay más de una descomposición viable que valga la pena discutir?

- A. No. La descomposición ya existe en el código y FR16 no la altera; el catálogo solo la hace explícita para trazar los requisitos.
- B. Sí (especificar en Other).
- X. Other (please specify)

[Answer]: A. Sin alternativas — se documenta la descomposición existente.

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en components.md, decisions.md y traceability.json:

- **Catálogo (4 bloques lógicos existentes + 1 UI nuevo):**
  1. `ViajesAdapter` — trae los viajes del WMS con sus pedidos y ahora sus recolecciones conocidas (`tipo: devolucion`). (FR16.1.1)
  2. `SecuenciaParadas` — construye y optimiza la secuencia; incluye las devoluciones como paradas más. Dueño de la entidad `Parada`/`Pedido`. (FR16.1)
  3. `CapacidadVehiculo` — bin-packing (FR2); suma peso/volumen de las devoluciones; marca exclusión. (FR16.3)
  4. `PlanificacionUI` — cards, lista, mapa, barra de capacidad; distinción visual por tipo. (FR16.2)
  5. `TipoParadaBadge` (nuevo, UI) — badge indigo de tipo devolución. (FR16.2.1)
- **Entidades:** sin entidad nueva. `Pedido`/`Parada` (dueño: `SecuenciaParadas`) gana el atributo `tipo` ∈ {`entrega`, `devolucion`}.
- **Dependencias:** `PlanificacionUI` → `SecuenciaParadas` → `CapacidadVehiculo`; `SecuenciaParadas` ← `ViajesAdapter`. Grafo acíclico.
- **External dependencies:** Supabase (base), OSRM (matriz de distancias) — sin cambios.
- **ADRs:** (1) devolución como atributo discriminador, no entidad separada; (2) sin componentes backend nuevos — FR16 es cambio de cliente.
- **traceability.json:** mapea FR16.1/16.2/16.2.1/16.2.2/16.3 → los 5 bloques.

- Looks correct
- Request changes

[Answer]: Looks correct
