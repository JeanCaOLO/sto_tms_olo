# eflow-sim — API simulada de eFlow (EXPEDICIONESCABECERA/DETALLE)

Stand-in del API que **ePrac** entregará formalmente, según la spec
**`ET-MS-OC26007 — OMS Endpoints eFlow`** (v1.0, 06/10/2026 · Eduardo Medina /
Ana María Maradey). Mientras ePrac lo construye, **planificación** y el **OMS**
consumen este mock con el **mismo contrato** (params + shapes de respuesta).

- **No** toca EFLOW real, ni Aurora, ni la tabla `orders`. Sirve filas de un
  **seed en memoria** (`src/expediciones_seed.json`) y aplica los POST encima
  (se reinicia al reiniciar el proceso).
- **Rutas públicas** (sin token), igual que el módulo `eflow`.
- **Swap cuando llegue el real:** se apunta el base URL del cliente al API de
  ePrac; los consumidores no cambian.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET  | `/api/eflow-sim/expediciones-cabecera` | Cabeceras; filtra por los params de abajo |
| GET  | `/api/eflow-sim/expediciones-detalle`  | Líneas; mismos filtros (sin `BAJADA`) |
| POST | `/api/eflow-sim/expediciones-cabecera` | Actualiza `TPEXES`, `TPEXSI`, `PRIORIDAD`, `BAJADA` |
| POST | `/api/eflow-sim/expediciones-detalle`  | Actualiza `TPEXES`, `TPEXSI`, `PRIORIDAD` |

**Filtros GET (todos opcionales; sin filtros = toda la tabla):**
`IDEXPEDICION`, `IDCOMPANIA`, `IDALMACEN`, `IDSUCURSAL`, `TPEXES` (estado),
`TPEXSI` (situación), `PRIORIDAD`, `BAJADA` (solo cabecera).

**POST** — identifica el registro por `IDEXPEDICION` + `IDCOMPANIA` +
`IDALMACEN` + `IDSUCURSAL`. Respuesta:
`{"status":"success","message":"Updated", ...claves}` o
`{"status":"error","message":"..."}`.

## Correr en local

Forma parte del backend local (puerto 4000). Con el resto del backend:

```bash
npm run api:local:base     # python backend/local/serve.py
```

Ejemplos:

```bash
# Cabeceras disponibles de COFERSA (compañía 0109) en estado DISP
curl "http://localhost:4000/api/eflow-sim/expediciones-cabecera?IDCOMPANIA=0109&TPEXES=DISP"

# Líneas de una expedición
curl "http://localhost:4000/api/eflow-sim/expediciones-detalle?IDEXPEDICION=EXP-000123"

# Cambiar estado/situación/prioridad de una expedición (lo que hará el OMS)
curl -X POST "http://localhost:4000/api/eflow-sim/expediciones-cabecera" \
  -H "Content-Type: application/json" \
  -d '{"IDEXPEDICION":"EXP-000123","IDCOMPANIA":"0109","IDALMACEN":"0001","IDSUCURSAL":"0001","TPEXES":"DISP","TPEXSI":"GENE","PRIORIDAD":1,"BAJADA":"A1"}'
```

## Deploy (solo Intelix)

Módulo SAM estándar, igual que los demás de `backend/`:

```bash
sam build && sam deploy --config-env dev   # o qa / prod
```

## Pendientes

- El **seed** es representativo (tipo COFERSA CR), no extracción real. La carga
  real a `orders` y el mapeo fino de columnas quedan **pendientes de la reunión
  con Jean** (las tablas van a cambiar).
- Falta el **cliente del frontend** que consuma estos endpoints desde
  planificación/OMS (siguiente paso).
- Espejar al **repo backend de GitLab** (estándar Intelix) para el equipo con
  acceso allí.
