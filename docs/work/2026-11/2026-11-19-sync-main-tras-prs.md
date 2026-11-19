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
