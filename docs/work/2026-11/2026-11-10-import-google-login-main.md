# 2026-11-10 — Build de main roto por el import del login con Google

## What changed

- `src/lib/google-login.ts` importa `apiFetch`/`STORAGE_KEY` de `./api-client` en vez de `./supabase`
  (commit `57e9dbd`, en el PR #42).

## Why

`main` borró `src/lib/supabase.ts` (commit `c0ba962`) pero `google-login.ts` lo seguía importando:
`tsc` fallaba en `main` y, tras el merge de ayer, en `planificacion-2`. Apareció al probar el merge de
`oms`.

## How

- `tsc --noEmit -p tsconfig.app.json` en verde; vitest de `src/lib`: 1075 en verde. Backend: 627.

## Follow-ups

- Merge de prueba de `oms` en la rama local `prueba/oms-planif2` (no se sube; el PR #42 queda sin
  el OMS).
- Dos migraciones con el número 64 (`64_zona_tms_calculada_pedido` y `64_zonas_dias_anticipo`):
  renumerar una al juntar las ramas.
