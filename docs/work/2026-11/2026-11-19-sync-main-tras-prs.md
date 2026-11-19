# 2026-11-19 — Sync de main tras aceptar PRs #46 y #47

## What changed
- PR #46 (oms) y PR #47 (planificacion-2, incluye recolectas v2 de Dylan) mergeados a main.
- main mergeado en planificacion-2 por fast-forward (281e73e; 4 archivos del OMS: cola solo planificados).

## Why
Regla del proyecto: tras cada PR a main, traer main a planificacion-2 para no divergir.

## How
`git fetch github` + `git merge github/main` (sin conflictos); push a github y origin.

## Promoted knowledge
Ninguno.

## Follow-ups
- Verificar badge vencido y recolectas v2 en el ambiente desplegado (deploy por CI de GitLab, no visible desde GitHub).
- Túnel SSM a Aurora caído desde ~09:00: el loop local de ingesta/replan falla hasta levantarlo.
- Avisar a Dylan que su trabajo entró a main vía #47.

## Verificación post-deploy (sandbox ext-claude, 13:54 UTC)
- Lambda `dev-tms-planning-planning-api` redesplegada 13:16 UTC; el zip trae recolectas v2 (assign/cancel/results).
- Amplify `dev-tms-frontend` rama sandbox: deploy SUCCEED 13:22 UTC.
- Logs de la lambda desde el deploy: sin errores (invocaciones 13:30/13:40/13:50 ok).
- Aurora: SOL-2026-11-0001 sigue `planned` en 20261119-0109-005 (parada 3); SOL-2026-11-0002 sin asignar (failed + no_candidate). 3 eventos v2 en total.
- Pendiente: primer replan horario con código v2 (14:00 UTC) y mirar el badge en la UI.

## Sync GitHub → GitLab (Intelix)
- GitLab estaba atrás: main 89 commits (a2566f4), dylan-tarifas 228 (000db9a, del 23-oct). Sin commits propios en GitLab.
- Push fast-forward: main → 281e73e, dylan-tarifas → b2b09fb. Las 4 ramas quedan iguales en ambos remotos.

## Replan horario y badge en sandbox (19:00 UTC)
- Replan programado corrió 14:00–17:00 UTC sin errores; planifica 20 y 21-nov.
- Recolectas v2 desde la lambda desplegada: a las 14:00 registró `planning.no_candidate` de SOL-2026-11-0002 para el 21-nov; los replans de 15/16/17 no duplicaron eventos (clave idempotente ok). SOL-2026-11-0001 sigue `planned` en 20261119-0109-005.
- La ingesta de la lambda falla cada 10 min con "Sin credenciales EFLOW para país cr": esperado, el secreto de eFlow no va en la sandbox; la ingesta real la hace el loop local.
- Badge "Vencido" visible en Pedidos en Bandeja (sandbox Amplify) para entregas con fecha < hoy; Aurora tiene 37 de 101 DISP/DISP vencidos (desde el 17-nov).
- Ojo: plan del 20-nov con 36 pedidos sin camión disponible (flota ya con su vuelta del día).

## Revisión doc API eFlow de EPRAC (ePRAC-158, v1.0.0 del 12-nov)
Cubre: Autenticacion (JWT 6 días), TestConexion, GET ObtenerExpediciones (estado/situación/fechas, paginado ≤500),
POST GenerarAcciones (→SOAC), CambiarPrioridadExpedicion, AsignarNumeroViajeWMH (int64), AsignarNumeroBajada. Lotes ≤100.
Contra lo pedido el 21-oct y lo que usan OMS/Planif:
- OK: GET DISP/DISP, prioridad, nº de viaje, bajada.
- Falta en el GET (hoy lo lee planif directo de la BD): peso, volumen, costo, ruta/zona, nº de líneas,
  detalle de artículos, dirección y coordenadas del cliente, tipo de expedición, fecha de cierre.
- Situación DISP→GENE: no hay endpoint; solo GenerarAcciones (→SOAC). Confirmar si SOAC reemplaza a GENE.
- Nº de viaje: TMS manda 202611190109005 (int64 cabe), pero falta confirmar si WMH acepta un número que no existe como journey.
- Preguntar también: a qué fecha aplica el filtro FechaInicio/FechaFinal, si prioridad 0 es válida, división de pedido (no está).
- Documento explicativo: `docs/wms-eflow/api-eprac-v1-vs-necesidades.md` (qué trae la API, qué necesitan Planificación y OMS, preguntas a EPRAC).

## Certificación Intelix (template_base v0.13.1)

- Motor `scripts/verificacion/analizador.js` sobre clones de GitLab main (TMS-Backend 7cd51d7, TMS-Frontend 281e73e),
  exposición pública, un agente kiro-cli (Sonnet 5.5) por corrida vía orca.
- Resultados (dictamen del motor, sin recalcular):
  - QA backend: No apto, 65 % (90 % sin críticos: R1, P2, P2b).
  - QA frontend: No apto, 40 % (críticos COD2, R1, R3, R6, C12, P2, P3).
  - PROD backend: No apto, 59 % (84 % sin críticos).
  - PROD frontend: No apto, 40 % (87 % sin críticos).
- Falsos positivos probables en frontend: COD2 lee el package.json equivocado; R1/C12 caen en tests y en `.claude`/`.kiro`.
- Salidas en `intelix/certificacion/salida/{qa,prod}-{backend,frontend}/`. Publicadas como artifacts privados:
  - QA backend: https://claude.ai/artifact/VU3XzXgQe8HA57dDSN1A9K
  - QA frontend: https://claude.ai/artifact/TTtMVy4xjrHNCZHJxXgfKC
  - PROD backend: https://claude.ai/artifact/5eJuftq7bfNtJsFZhUUEbh
  - PROD frontend: https://claude.ai/artifact/RjZX1jQg3RnfLEnq92zJ5w
