# Estructura de código — STO / TMS OLO

> Observada el 2026-09-30 (re-corrida por el pivote WMH). Árbol real de la rama
> `oms`.

## Backend (`backend/`) — Python 3.13 + SAM

```
backend/
  secrets/            template SAM de los 3 secretos (db, jwt, eflow)
  common-services/    API HTTP compartido + authorizer JWT + Layer + rol IAM
    src/authorizer/app.py
    layers/tms_common/tms_common/   pg, eflow_db, handler.py, audit.py,
                                    permissions.py, tokens, config, responses,
                                    errors, event, passwords
  auth/     src/app.py    /api/auth/*
  data/     src/app.py    /api/data/{table}  (+ relations.py, schema.py,
                          mutations.py, select_query.py, table_modules.py)
  context/  src/app.py    /api/v1/... jerarquía por scope
                          (+ scopes.py, context_queries.py, delivery_points.py)
  eflow/    src/app.py    /api/health, /api/viajes, /api/catalogos/...
                          (+ mock_source.py, live_source.py, mock_data.json)
  admin/    src/app.py    /api/v1/admin/*  (+ admin_users.py, admin_roles.py,
                          admin_permissions.py, admin_audit.py, admin_access.py,
                          audit_maintenance.py)
  planning/ src/app.py    /api/v1/planificacion/pedidos (+ planning_sql.py)
  local/    serve.py (Lambdas locales :4000), create_admin.py,
            ingest_delivery_points.py, delivery_points_csv.py
  tests/    15 archivos pytest (sin AWS ni BD: dobles)
  pytest.ini, requirements-dev.txt, README.md
```

Cada módulo (salvo `secrets`/`common-services`) es un stack SAM propio
(`template.yaml` + `samconfig.toml` dev/qa/prod) que cuelga del API compartido.

## Frontend (`src/`) — React 19 + Vite + TS

```
src/
  lib/
    supabase.ts       shim del API (apiFetch + QueryBuilder)
    tarifas/          MOTOR DE TARIFAS (TS puro): index.ts (calculate()),
                      evaluator.ts, resolver.ts, cost.ts, margin.ts, money.ts,
                      repository.ts, schemas.ts, types.ts, localData/, __tests__/
    liquidador/, routePlanning/, mock-auth.ts, mock-store.ts
  pages/
    oms/              panel, cola, reglas, simulador, rutas-despacho, auditoria,
                      engine/priorityEngine.ts (+test), api/, components/,
                      types.ts, useOmsView.ts
    planificacion/    page.tsx + motores TS: capacity-fit, fleet-split,
                      fleet-slots, optimize-stops, distance-matrix,
                      route-geometry, time-windows, plan-automatico (+ tests);
                      eflow-api.ts, catalogos-api.ts, plan-pedidos-api.ts,
                      fallback-*.ts, use-*.ts
    reglas-tarifa/, liquidaciones/, clientes, conductores, transportistas,
    vehiculos, licencias, contratos, paises, zonas, pedidos, guias,
    devoluciones, tracking, reportes, configuracion/, auditoria, dashboard,
    tiendas, login, home, seed
  components/, hooks/, i18n/, router/, App.tsx, main.tsx, __tests__/
```

## Otras zonas

- `server/` — Express legacy (referencia de contrato HTTP; pendiente de retiro).
- `sql/` — migraciones (`05` catálogos/tarifario, `15` permisos, `16-18`
  auditoría). Terreno de backend.
- `docs/` — `arquitectura-tms-oms/` (as-is, to-be, ERD, ADRs, roadmap),
  `wmh-actual/`, `reference/`, `decisions/`, `work/`.
- `aidlc/` — workspace AI-DLC (memoria, codekb, intents, knowledge).

## Sources

- Listado de `backend/` y `src/`; `backend/README.md` (estructura declarada).
- `package.json` (scripts, deps del frontend).

## Assumptions & Open Questions

- `server/` sigue presente; su retiro está pendiente de validar el deploy en dev.
- `firebase` y `@stripe/react-stripe-js` figuran en `package.json` sin uso claro
  (posible arrastre del prototipo).
