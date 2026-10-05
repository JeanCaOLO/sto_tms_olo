# Inventario de componentes — STO / TMS OLO

> Observado el 2026-09-30 (re-corrida por el pivote WMH). Componentes lógicos de
> backend (una Lambda/stack por componente) y de frontend.

## Backend (una Lambda/stack por componente)

### common-services
- **Ruta**: `backend/common-services/`
- **Responsabilidad**: API Gateway HTTP compartido + Lambda authorizer JWT
  (`src/authorizer/`) + Layer `tms_common` + rol IAM. NO tiene lógica de negocio.
- **Depende de**: Aurora, Secrets (jwt). **Consumido por**: todos los módulos
  (Fn::ImportValue). La Layer `tms_common` (pg, eflow_db, handler, audit,
  permissions, tokens, config, responses, errors, event, passwords) la usan todos.

### auth
- **Ruta**: `backend/auth/`
- **Responsabilidad**: login/signup/session/logout; bcrypt + JWT; registra
  eventos de sesión en auditoría.
- **Depende de**: `tms_common` (pg, tokens, passwords, audit, config/jwt).

### data
- **Ruta**: `backend/data/`
- **Responsabilidad**: CRUD genérico `/api/data/{table}` con lista blanca
  (`relations.py` TABLES/FOREIGN_KEYS, `schema.py`, `mutations.py`,
  `select_query.py`) + enforcement de permisos y países (`table_modules.py`,
  `permissions`). `app_users`/`roles`/`user_scopes` bloqueadas (403).
- **Depende de**: `tms_common`.

### context
- **Ruta**: `backend/context/`
- **Responsabilidad**: jerarquía País→Almacén→Cliente→Cliente Final→Punto de
  entrega filtrada por scope (`scopes.py`), + alta/baja de delivery-points.
- **Depende de**: `tms_common` (pg).

### eflow
- **Ruta**: `backend/eflow/`
- **Responsabilidad**: lectura read-only de EFLOW (viajes, pedidos, catálogos),
  modo mock (`mock_source`, `mock_data.json`) o live (`live_source`).
- **Depende de**: `tms_common` (eflow_db).

### admin
- **Ruta**: `backend/admin/`
- **Responsabilidad**: usuarios/roles/matriz de permisos/auditoría (escritura
  transaccional); 2ª Lambda `AuditMaintenanceFunction` (particiones mensuales).
- **Depende de**: `tms_common`, `sql/15-18`.

### planning
- **Ruta**: `backend/planning/`
- **Responsabilidad**: insumo de pedidos alistados desde `wms_expediciones`
  (situación `GENE`, sin viaje WMH, por fecha de entrega). Puente OMS→Planificación.
- **Depende de**: `tms_common` (pg, permissions), `planning_sql`.

## Frontend

### design-system / componentes compartidos
- **Ruta**: `src/components/` (DataTable, modales, shell).
- **Responsabilidad**: vocabulario visual y componentes reutilizables.

### oms-frontend
- **Ruta**: `src/pages/oms/`
- **Responsabilidad**: 6 áreas (panel, cola, reglas, simulador, rutas-despacho,
  auditoría) + **`engine/priorityEngine.ts`** (motor de priorización, con test) +
  `api/`, `components/`, `types.ts`, `useOmsView.ts`.
- **Depende de**: design-system, `src/lib/supabase.ts` (shim API).
- **Nota**: `rutas-despacho` (Calendario de Rutas) queda ELIMINADO por el pivote
  (D5) — las rutas se generan dinámicamente.

### planificacion-frontend
- **Ruta**: `src/pages/planificacion/`
- **Responsabilidad**: motores TS de armado de viaje (capacity-fit, fleet-split,
  fleet-slots, optimize-stops, distance-matrix, route-geometry, time-windows,
  plan-automatico — con tests) + integración EFLOW (`eflow-api.ts`) + fallbacks +
  mapas Leaflet/OSRM.
- **Depende de**: design-system, endpoint `/api/v1/planificacion/pedidos`, EFLOW.

### motor-tarifas (TS)
- **Ruta**: `src/lib/tarifas/`
- **Responsabilidad**: kernel puro `calculate()` (resolver→evaluator→cost→margin),
  AST de reglas versionado, dinero en decimal.js, schemas zod, tests.
- **Nota**: candidato a generalizarse como motor de reglas compartido OMS+TMS
  (C2, abierta). Hoy vive en frontend; portarlo al backend es pendiente.

### liquidador, catálogos de página, config/admin
- `src/lib/liquidador/`, y páginas de clientes, conductores, transportistas,
  vehiculos, licencias, contratos, paises, zonas, puntos de entrega,
  `src/pages/configuracion/`, auditoría, dashboard, login.

## Sources

- `backend/README.md` (mapa de módulos), `backend/*/src/app.py`,
  `backend/*/template.yaml`.
- `backend/data/src/table_modules.py` (OMS_MODULES, mapeo tabla→módulo).
- `src/pages/oms/`, `src/pages/planificacion/`, `src/lib/tarifas/`.

## Assumptions & Open Questions

- El motor de reglas de backend no existe (C2). Los motores de negocio (tarifas,
  priorización, armado de viaje) están en TS de frontend.
- `live_source.py`/`mock_source.py` y los sub-módulos `admin_*.py` se
  inventariaron por su agregador `ROUTES`, sin lectura íntegra.
