# 2026-11-02 — Un solo backend de planificación (app.py), se mata backend-planif

## What changed

- `backend/planning/template.yaml`: se repunta la Lambda a su propio código.
  - `CodeUri: ../../backend-planif/src/` → `CodeUri: src/`
  - `Handler: adapters.inbound.planificacion_api.handler` → `Handler: app.handler`
  - Se retiran 7 `RouteKey` obsoletos (editar plan `PUT planes/{id}`,
    `planes/{id}/confirmar|completar|cancelar`, `viajes/{tripId}/completar|cancelar|reabrir`):
    ya no se usan (planificación es un planificador automático). El template
    queda calzado exacto con los 7 handlers de `app.py`.
- `backend-planif/` (95 archivos): ELIMINADO. Era el backend hexagonal (copia de
  TMS-Backend) que el template desplegaba por error.
- `package.json`: `api:local` se repunta de `python backend-planif/serve.py` a
  `python backend/local/serve.py` (el canónico, que monta las Lambdas reales de
  `backend/*`); se elimina el alias duplicado `api:local:base`.

## Why

El `template.yaml` de `backend/planning` era el ÚNICO de los 17 microservicios que
no desplegaba su propio `src/`: su `CodeUri` apuntaba a `backend-planif/`. Resultado:
lo que corría en la Lambda de planificación era el backend hexagonal viejo
(`backend-planif`), NO `backend/planning/src/app.py` donde vive el planificador
actual (bandeja + planificar + replanificar + ingest eFlow). Por eso el trabajo
reciente (bandeja, replanificar) "no existía" en producción: nunca fue desplegable.

Las dos bases no eran superconjunto una de otra: `app.py` tiene bandeja/replan/ingest;
`backend-planif` tenía editar/transiciones de plan y viaje. Jesús confirmó que
editar/completar/cancelar planes y viajes YA NO SE USAN — planificación es ahora
un planificador automático. Así que `app.py` es el único backend vigente y
`backend-planif` es cruft que confunde y despliega lo equivocado.

## How

Se igualó `backend/planning` al patrón de los otros 16 servicios (`CodeUri: src/`,
`Handler: app.handler`, `tms_common` desde la Layer compartida). `app.py` ya era
auto-contenido: sus 6 módulos locales (`ingest_orders`, `pedido_articulos`,
`plan_builder`, `plans_read`, `replan`, `planning_sql`) viven en su `src/` e importa
`tms_common` de la Layer igual que los hermanos. Verificación:
`pytest backend/` → 504 passed; el guard `test_routes_wired.py` pasa con match
exacto (7 ROUTES de app.py ⊆ 7 RouteKeys del template).

**Pendiente de efecto real:** requiere `sam deploy` del servicio `planning` a la
cuenta OLO + `create-deployment` del stage. No ejecutado aquí (sin credenciales OLO).

## Promoted knowledge

- Backend de planificación = UNO solo: `backend/planning/src/app.py` (estilo plano,
  `app.handler`). `backend-planif/` ya no existe. El guard `test_routes_wired.py`
  valida que todo handler de `ROUTES` tenga su `RouteKey` en el template.
- `npm run api:local` = `backend/local/serve.py` (monta las Lambdas reales de
  `backend/*` en :4000, incluido planning→app.py).

## Follow-ups

- Frontend `src/pages/planificacion/planes-api.ts` todavía tiene funciones muertas
  (`editarPlan`, `confirmarPlan`/`completarPlan`/`cancelarPlan`,
  `completarViaje`/`cancelarViaje`/`reabrirViaje`) que pegaban a las rutas retiradas;
  caen a mock sin crashear, pero conviene limpiarlas en una pasada aparte del front.
- Desplegar `planning` a OLO + `create-deployment` para que bandeja/replanificar
  surtan efecto real (sigue pendiente del PR #31).
