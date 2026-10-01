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
- **Contexto**: la lógica de las reglas vive en código (Lambda por compañía); él
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

- **Quién es**: el motor de reglas del OMS que corre automáticamente (≥1 vez/día
  y en horas de corte).
- **Objetivo**: leer los pedidos de EFLOW, calcular la prioridad (T-1 + score) y
  dejar los pedidos "alistados" cambiando `situación` a `GENERADA`.
- **Invariantes que respeta**: **no escribe fechas**; transición
  **DISP → GENERADA**; **prioridad numérica invertida con score ponderado**.
- **Contexto**: una Lambda por compañía; escribe solo a nivel WMS/EFLOW; termina
  en "alistado".

## P6 — Sistema TMS / Planificación (actor externo)

- **Quién es**: módulo hermano que consume los pedidos que el OMS dejó en
  `GENERADA`.
- **Objetivo**: crear/asignar el viaje automáticamente. **Fuera del alcance del
  OMS**; aparece como actor externo en las historias de frontera.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  (Actores; FR2, FR4, FR8, FR13).
- `aidlc/spaces/default/memory/project.md` (`## Decided`: roles, alcance del OMS,
  override manual, viaje = Planificación).
- `documents/2026-08-26-reunion-oms-roles.md` (Adenda: los 4 roles).

## Assumptions & Open Questions

- Los permisos exactos por rol se afinan en el diseño de autorización (FR14);
  aquí se modelan como niveles (visualización / operación / administración).
