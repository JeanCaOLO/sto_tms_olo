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
