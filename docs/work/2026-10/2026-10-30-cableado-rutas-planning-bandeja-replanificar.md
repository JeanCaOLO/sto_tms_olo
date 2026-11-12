# 2026-10-30 — Cableado de rutas de planning (bandeja + replanificar) y guard

## What changed

- `backend/planning/template.yaml`: se declararon dos `RouteKey` que faltaban en la
  API HTTP compartida:
  - `GET /api/v1/planificacion/bandeja`
  - `POST /api/v1/planificacion/planes/replanificar`
- `backend/tests/test_routes_wired.py` (nuevo): guard parametrizado por microservicio
  que afirma que toda ruta de `ROUTES` (`app.py`) esté declarada como `RouteKey` en su
  `template.yaml`.
- PR a `main`: #31 (rama `planificacion-2`, commit `f23bd41`).

## Why

La pantalla "Pedidos en Bandeja" (`/oms/bandeja`) fallaba con "No se pudo cargar la
bandeja" y en consola aparecía un error de CORS. El diagnóstico mostró que NO era CORS:
el handler `list_bandeja` existía en `app.py` (`ROUTES`) desde el commit del 26-oct, pero
su `RouteKey` nunca se declaró en `template.yaml`. API Gateway respondía **404 de gateway
(sin header CORS)** y el browser lo reportaba como error de CORS. Mismo caso para el botón
Replanificar (`POST .../planes/replanificar`). Dato de diagnóstico: `curl` con header
`Origin` da **401** si la ruta existe (la Lambda responde) y **404 "Not Found"** si no
está cableada en el gateway.

## How

Se replicó el patrón de las rutas hermanas (`pedidos`): `AWS::ApiGatewayV2::Route` con
`ApiId`/`AuthorizerId` compartidos (`Fn::ImportValue ${CommonStackName}-...`) y `Target`
a `PlanningApiIntegration`. El guard carga cada stack vía `conftest.load_stack_module`,
lee su dict `ROUTES` y compara contra los `RouteKey` del `template.yaml` del servicio.
Verificación: `pytest tests/test_planning.py tests/test_routes_wired.py` → 18 passed; los
12 microservicios pasan el guard.

**Pendiente de efecto real:** requiere `sam deploy` del servicio `planning` a la cuenta
OLO + `create-deployment` del stage (ver `AGENTS.md`). No ejecutado aquí (sin credenciales
de OLO).

## Promoted knowledge

- Topología: el backend vivo es microservicios (`backend/<svc>/`) sobre una API HTTP
  compartida (`common-services`); en dev es `pmc95jqekl` (us-east-2, cuenta OLO).
  `backend-planif/` NO está desplegado (solo `npm run api:local`, sin SAM template).
- Un handler en `ROUTES` sin su `RouteKey` en el template = 404 de gateway disfrazado de
  CORS. El guard `test_routes_wired.py` lo previene en todos los servicios.

## Follow-ups

- **"Sin viajes" en Planificaciones/Calendario** (bug aparte, no resuelto): los planes
  existen en Aurora para la semana y para Cofersa (`route_plans`: 8 planes 26-31 oct, 114
  `plan_trips`) pero la UI sale vacía. `list_planes` filtra por org+almacén+cliente;
  sospecha: almacén seleccionado ≠ `56ce1ef7` o Lambda `planning` desplegada desactualizada.
  Confirmar con el request real.
- **Inverso del guard:** `planning/template.yaml` declara 7 rutas de transición
  (`planes/{id}/confirmar|completar|cancelar`, `viajes/{tripId}/...`) sin handler en
  `ROUTES`. Revisar si se portan los handlers o se retiran las rutas.
- Desplegar `planning` a OLO + `create-deployment` para que el fix surta efecto.
