# EFLOW QA read-only API (`server/`)

A tiny Express server that exposes **real EFLOW QA data** (trips, routes, drivers,
vehicles, carriers) so the `/planificacion` React module can drop its MOCK names
("Viaje 1", "Viaje 2"â€¦) and show real QA names.

**Read-only by construction.** Every handler runs a single `SELECT`; all inputs are
bound parameters (`@name`), never string-interpolated. No `INSERT`/`UPDATE`/`DELETE`
anywhere. Connection opens with `readOnlyIntent`.

Schema / JOIN rationale: `docs/guides/eflow-qa-schema-planificacion.md`.

## Stack

| Choice | Why |
|---|---|
| **Express 4.21.2** | Smallest well-known HTTP router; no build step, no types needed for 6 routes. |
| **mssql 11.0.1** (tedious) | The SQL Server driver the brief specifies; pooled, parameterized. |
| Plain ESM `.mjs`, no TypeScript | Server lives outside `src/`, so it stays out of the frontend `tsconfig`. Node runs it directly â€” nothing to compile. |
| `node --env-file=.env.local` | Native Node env loading (Node 20+). No `dotenv` dependency. |

## Run it

1. `cp .env.example .env.local` and fill the `EFLOW_QA_*` values (QA SQL Server creds).
   `.env.local` is gitignored â€” never commit it.
2. `pnpm install`
3. `pnpm server`  â†’ `eflow-qa read-only API on http://localhost:4000`

Or directly: `node --env-file=.env.local server/index.mjs`.

Change the port with `EFLOW_API_PORT` in `.env.local`.

## Endpoints

| Method + path | Returns |
|---|---|
| `GET /api/health` | `{ ok: true }` â€” connectivity probe |
| `GET /api/viajes?limit=100` | Trip list, newest `VIAJE` first. `limit` 1â€“1000, default 100. Canonical tripâ†’routeâ†’driverâ†’vehicleâ†’carrier JOIN. |
| `GET /api/viajes/:id` | Same shape, one trip by `VIAJE` (integer). `400` invalid id, `404` unknown. |
| `GET /api/catalogos/rutas` | All 38 `distribution_routes`. |
| `GET /api/catalogos/transportistas` | All `transportation_companies`. |
| `GET /api/catalogos/conductores?transportistaId=` | `drivers`, optionally filtered by carrier id. |
| `GET /api/catalogos/vehiculos?transportistaId=` | `trasportation_units`, optionally filtered by carrier id. `weight_capacity` / `volumetric_capacity` are `0` in QA â€” **returned as-is**; the UI keeps its synthetic capacity. |

Query failures against QA return `502 { error: "eflow_qa_query_failed", detail }`.

### `viaje` row shape

```jsonc
{
  "trip_id": 8194,              // VIAJE â€” replaces "Viaje N"
  "trip_status": "COMPLETED",   // PENDING | COMPLETED | MERGED
  "trip_status_code": 3,
  "trip_created": "2026-07-13T07:30:59.510Z",
  "trip_dispatch": null,
  "trip_closed": "2026-07-14T09:45:12.790Z",
  "route_codes": "08",          // VIAJES_ENC_AB.DESTINO (may be "02,22")
  "route_name": "SAN CARLOS",
  "route_alias": "SAN CARLOS",
  "driver_id": 4,
  "driver_name": "CONDUCTOR A",
  "driver_document": "000000000",
  "driver_phone": "004",
  "vehicle_id": 12,
  "vehicle_plate": "PLACA-001",
  "vehicle_brand": "IZUSU NPR",
  "vehicle_weight_capacity": 0,      // mock in QA â€” as-is
  "vehicle_volumetric_capacity": 0,  // mock in QA â€” as-is
  "carrier_name": "TRANSPORTISTA A",
  "carrier_code": "...",
  "dock": "PURT23",
  "customer_count": 7,
  "total_weight": 725.48,
  "total_volume": 520.77,
  "total_packages": 173
}
```

Driver/vehicle/carrier are `null` for unassigned `PENDING` trips (expected).

## Frontend wiring (separate task â€” not done here)

`vite.config.ts` already proxies `/api/*` â†’ `http://localhost:4000` in dev
(override with `EFLOW_API_URL`). To consume it, `/planificacion` would replace its
MOCK JSON import with `fetch('/api/viajes')` and map `trip_id`/`route_name`/
`driver_name`/`vehicle_plate`/`carrier_name` onto its view model, keeping the
synthetic capacity math untouched. For production, serve the frontend and this API
behind the same origin, or set the API base URL via env.

