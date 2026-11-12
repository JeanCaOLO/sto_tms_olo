# 2026-10-14 — API simulada de eFlow (eflow-sim)

## What changed
- Nuevo módulo backend **`backend/eflow-sim/`** (SAM, estándar Intelix) que simula el API de eFlow que entregará ePrac, según la spec **ET-MS-OC26007 — OMS Endpoints eFlow** (v1.0, Eduardo Medina / Ana María Maradey):
  - `GET /api/eflow-sim/expediciones-cabecera` y `GET .../expediciones-detalle` (filtros: `IDEXPEDICION`, `IDCOMPANIA`, `IDALMACEN`, `IDSUCURSAL`, `TPEXES`, `TPEXSI`, `PRIORIDAD`, `BAJADA`).
  - `POST .../expediciones-cabecera` (actualiza `TPEXES`/`TPEXSI`/`PRIORIDAD`/`BAJADA`) y `POST .../expediciones-detalle` (sin `BAJADA`). Respuesta `{status, message, ...claves}`.
- Fuente de datos: **seed en memoria** `src/expediciones_seed.json` (representativo tipo COFERSA CR). No toca EFLOW real, Aurora ni la tabla `orders`.
- Cableado al backend local (`backend/local/serve.py`): añadido a `STACKS` y `PUBLIC_STACKS` (ruta pública, sin token, como `eflow`).
- `template.yaml` + `samconfig.toml` + `README.md` del módulo.

## Why
- Reunión 2026-10-14: EPRAC tarda en entregar el API formal de eFlow; se decidió **simularlo con el mismo contrato** para no bloquear a planificación/OMS hacia el entregable de fin de mes. La extracción real a `orders` queda **pendiente de la reunión con Jean** (las tablas van a cambiar), por eso el mock solo **devuelve** datos, no carga nada.

## How
- Se replicó el patrón de módulo backend existente (`backend/eflow`): `src/app.py` con `dispatch(ROUTES, event)` + `tms_common`, helpers de filtro/validación, `sim_source.py` con filtrado y update en memoria.
- Verificado con el backend local (`npm run api:local:base`, :4000): GET con filtros, GET detalle, POST que persiste el cambio (confirmado con un GET posterior).

## Promoted knowledge
- Mientras ePrac no entregue, eFlow se consume vía `eflow-sim` (mismo contrato). El swap al real = cambiar base URL; consumidores sin cambios.

## Follow-ups
- [ ] (delegado a Kiro, worktree) Cliente del frontend que consuma `eflow-sim` desde planificación/OMS + pytest de `sim_source`.
- [ ] Espejar el módulo al repo backend de GitLab (estándar Intelix) para el equipo con acceso allí.
- [ ] Tras la reunión con Jean: definir el mapeo real de columnas y la carga a `orders` (reemplaza el seed).
