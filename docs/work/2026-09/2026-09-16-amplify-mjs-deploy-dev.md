# 2026-09-16 — Deploy a Amplify en `dev` + script `amplify.mjs`

## What changed

- **`amplify.mjs`** (Node, multiplataforma) reemplaza a `deploy-frontend.ps1`.
  Build + deploy manual a Amplify usando el flujo **file-map** (no arma zip: crea
  el deployment con el md5 de cada archivo, sube cada archivo a su URL presignada
  y arranca el deploy). Sin dependencias y sin el bug de rutas con backslash.
  - `pnpm deploy` (script nuevo) = `node amplify.mjs`. Flags: `--branch`,
    `--no-mock`, `--api`, `--skip-build`, `--app-id`, `--profile`, `--region`.
  - Rama por defecto: **`dev`** (la crea en Amplify si no existe).
- Se eliminó `deploy-frontend.ps1` (superado).

## Why

Pedido: un script de deploy en JS/mjs en vez de PowerShell, más fácil de correr;
y mover el despliegue de la rama `planificacion` a `dev`.

## How

- Rama GitLab `dev` actualizada: merge de `jesus-planificacion` (todo el trabajo
  de planificación) en `dev` (`2e0c092..993686f`), sin conflictos, `tsc` limpio.
- Amplify: desplegada la rama **`dev`** (job 1) → https://dev.d200vkxzilg7v5.amplifyapp.com
  (index.html 200) y **eliminada la rama `planificacion`** de la app
  (`aws amplify delete-branch`). Quedan `dev` y `oms`.

## Follow-ups

- Backend sigue en `oc26007-tms-backend-dev` (`fm2mrqtsu1`); el frontend `dev`
  apunta ahí por `VITE_API_BASE`.
- Opcional: excluir los `.map` del deploy para subir menos archivos.
