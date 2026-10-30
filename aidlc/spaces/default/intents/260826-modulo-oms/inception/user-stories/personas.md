# Personas — Módulo OMS

> Actores de las historias de usuario, derivados de los 4 roles de la Adenda del
> 2026-08-26 (ver `requirements.md` → Actores) más el actor no-humano
> **Sistema/Motor OMS** para las capacidades automáticas.

## P1 — Operador de Despacho `[RETIRADO del alcance del OMS por D5]`

> **Persona retirada del OMS.** Sostenía el Calendario de Rutas (E8/US28–US29),
> eliminado por D5 (ruteo dinámico multi-fuente: las rutas dejan de ser fijas).
> El manejo de rutas pasa a **Planificación** (intent `260825-route-planning-reqs`),
> no al OMS. Se conserva aquí solo como marca de deprecación.

## P2 — Administrador de Módulo

- **Quién es**: superusuario del módulo OMS (no del TMS completo).
- **Objetivo**: configurar el catálogo de reglas (activar/desactivar, peso/score,
  parámetros) por compañía para el rollout por etapas.
- **Contexto**: la lógica de las reglas vive en código (Lambdas compartidas por
  función, resueltas por scope — C3-SUPERSEDE, no una Lambda por compañía); él
  solo parametriza, no crea reglas.
- **Dolor**: necesita habilitar reglas progresivamente sin depender de un
  despliegue por cada ajuste de parámetro.

## P3 — Jefe de Almacén

- **Quién es**: coordinador de piso/almacén.
- **Objetivo**: visibilidad y reportería del módulo; acceso a la planificación.
- **Contexto**: **no bloquea ni aprueba** el flujo (el cálculo es 100 %
  automático).
- **Dolor**: hoy no tiene una vista consolidada de la salud de la operación.

## P4 — Responsable del OMS

- **Quién es**: heredero de las funciones que hoy hacen 3–4 personas de la Torre
  de Control.
- **Objetivo**: monitorear el motor automatizado, ejercer el **override manual**
  (única intervención humana sobre el cálculo) y decidir/aplicar simulaciones.
- **Contexto**: interviene solo en casos extraordinarios (camión accidentado,
  urgencia); confía progresivamente en la automatización.
- **Dolor**: hoy prioriza a mano ~400–500 pedidos/día leyendo observaciones.

## P5 — Sistema / Motor OMS (actor no-humano)

- **Quién es**: el motor de reglas del OMS, **activado por Planificación** (D7:
  lambda de activación asíncrona; ya no corre por cron/EventBridge).
- **Objetivo**: leer los pedidos del lote desde **`public.orders`** (los que
  Planificación procesó y dejó con viaje), calcular la prioridad (regla fecha
  generalizada + score; EPA pre-asignada; cliente-retira por zona) y dejar los
  pedidos "alistados": UPDATE a `orders` + escritura a **EFLOW real**
  (`TPEXSI='GENE'` + `PRIORIDAD`).
- **Invariantes que respeta**: **no escribe fechas**; **no escribe el número de
  viaje**; situación **DISP → GENE** (estado permanece `DISP`); **prioridad
  numérica invertida con score ponderado**.
- **Contexto**: Lambdas compartidas por función, por scope (C3-SUPERSEDE, no una
  Lambda por compañía); termina en "alistado". También corre el loop de backorder
  (D13) de forma desacoplada.

## P6 — Sistema TMS / Planificación (actor externo)

- **Quién es**: módulo hermano que, en el flujo invertido (D7), **procesa los
  pedidos, les asigna el viaje y ACTIVA al OMS** (lambda de activación), y luego
  **lee de `public.orders`** los pedidos ya priorizados para armar los viajes.
- **Objetivo**: asignar el viaje y disparar al OMS. Escribe el `wms_trip_number`
  (el OMS no lo escribe). **Fuera del alcance del OMS**; actor externo en las
  historias de frontera (US0).

## P7 — EPRAC (actor externo, módulo que pre-asigna la prioridad de EPA)

- **Quién es**: módulo que entrega los pedidos de EPA y les **pre-asigna la
  prioridad** (**1 o 2**; nunca 0; esos valores no cambian).
- **Objetivo**: entregar al OMS los pedidos de EPA ya con su prioridad. El OMS
  **no recalcula** para EPA (US-EPA); solo los libera con esa prioridad. **Fuera del alcance
  del OMS**; actor externo.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  (Actores; FR2, FR4, FR8, FR13).
- `aidlc/spaces/default/memory/project.md` (`## Decided`: roles, alcance del OMS,
  override manual, viaje = Planificación).
- `documents/2026-08-26-reunion-oms-roles.md` (Adenda: los 4 roles).

## Assumptions & Open Questions

- Los permisos exactos por rol se afinan en el diseño de autorización (FR14);
  aquí se modelan como niveles (visualización / operación / administración).
