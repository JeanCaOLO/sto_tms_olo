# 2026-11-10 — Conflicto del PR #42 con main

## What changed

- Merge de `main` (PRs #40 tarifas y #41 OMS) en `planificacion-2` (commit `c63a05c`).
- Conflicto único: `docs/requirements/planificacion/documento-de-requerimientos-planificacion.md`. Se
  quedó la versión de la rama.

## Why

GitHub marcaba el PR #42 con conflictos tras mergearse #40 y #41 en `main`.

## How

- `main` solo cambiaba una línea del documento (`lib/supabase.ts` → `lib/api-client.ts` en R003); la
  versión de la rama reescribió el documento y ya no menciona esa ruta, así que no se pierde nada.
- Verificado que el código que trae `main` no lee `tbl_orders.route_type_id` (renombrada a
  `tms_zone_id` en sql/64); los `route_type_id` restantes son de `tbl_routes`.
- Suite backend: 621 en verde. PR #42 queda `MERGEABLE` / `CLEAN`.

## Follow-ups

- Tras mergear el PR #42: actualizar `main` en GitLab y avanzar `planificacion-2`.
