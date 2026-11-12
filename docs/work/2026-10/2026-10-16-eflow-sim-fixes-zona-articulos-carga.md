# 2026-10-16 — Fixes del live de eFlow-sim: zona nula, artículos y carga

## What changed
Tres arreglos tras ver el live real en el navegador:

- **Crash por zona nula (EPA).** Las expediciones de EPA (0029) llegan SIN RUTA; el
  mapper creaba viajes con `delivery_zone: null` y `zonasPresentes` hacía
  `null.localeCompare(...)` → white screen al cambiar de semana. Ahora la RUTA nula
  se mapea a la zona `"S/R"` y el orden de zonas del calendario está blindado contra null.
- **Artículos del pedido live.** El modal de la parada pedía los artículos al endpoint
  de Aurora (`/api/v1/planificacion/pedidos/{id}/articulos`, 404 en local), que no conoce
  los pedidos de eFlow. Ahora, para pedidos de eFlow-sim, hace un **GET del detalle**
  (`expediciones-detalle?IDEXPEDICION=...`) y mapea las líneas a `Articulo`.
- **Carga que caía al seed.** En la carga de página el GET de eFlow competía con los
  catálogos por el lock global del server local y se pasaba del timeout → caía al seed
  del cliente. Ahora la carga es secuencial (cabecera→detalle), el detalle es best-effort
  y la cabecera reintenta una vez.

## Why
El usuario abrió el live y: (1) el calendario crasheaba al avanzar de semana por EPA sin
ruta; (2) un pedido real mostraba "sin artículos" aunque en eFlow tiene 4 líneas; (3) al
recargar aparecían los pocos viajes del seed en vez de los reales. Los tres rompían la
demo del live.

## How
- `eflow-sim-store.ts`: `SIN_RUTA = 'S/R'` aplicado en el agrupamiento por zona y en el
  stop; `desdeApiOSeed` secuencial + detalle best-effort + `cabeceraConReintento`.
- `calendario.ts`: `zonasPresentes` ordena con coerción `(a ?? '')`.
- `eflow-sim-api.ts`: `fetchArticulosEflowSim(id)` = GET del detalle → `Articulo[]`.
- `ParadaModal.tsx`: elige la fuente de artículos por origen (`compania` presente = sim).
- Verificado: tsc + eslint limpios; vitest planif verde (+ test de regresión zona "S/R");
  live real confirmado en el navegador (rutas Cartago/Guanacaste/Puntarenas/Turrialba… +
  S/R, semana 16–23 oct, sin crash).

## Promoted knowledge
- EPA (0029) llega sin RUTA y sin coords en eFlow real; en el calendario cae en zona "S/R".
- La DESCRIPCION del artículo NO está en EXPEDICIONESDETALLE (vive en ARTICULOSGESTION):
  el modal muestra código + cantidad + peso, con el nombre vacío por ahora.
- El server local `backend/local/serve.py` serializa TODAS las requests con un lock
  global; conviene cargar secuencial y tolerar fallos del detalle.

## Follow-ups
- Nombre del artículo: join a ARTICULOSGESTION en el GET del detalle live.
- Agrupamiento de EPA (hoy todo en "S/R"); definir zona/criterio para 0029.
- Warm-up de la conexión EFLOW al arrancar el backend para evitar el primer timeout en frío.
