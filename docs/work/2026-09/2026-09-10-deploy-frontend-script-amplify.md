# 2026-09-10 — Script de deploy a Amplify + fixes de despliegue

## What changed

- Nuevo `deploy-frontend.ps1` (raíz): build de Vite + empaquetado + deploy manual
  a AWS Amplify de un tirón. Parámetros: `-ApiBase`, `-NoMock`, `-AppId`,
  `-Branch`, `-AwsProfile`, `-Region`.

## Why

Automatizar el ciclo build→zip→deploy que se hacía a mano, y evitar dos bugs
que rompían el despliegue anterior.

## How / fixes incorporados

- **Assets 404 en Amplify:** el zip debe usar rutas **forward-slash**
  (`assets/x.js`). `Compress-Archive` y `ZipFile.CreateFromDirectory` en Windows
  generan backslashes → Amplify sirve con `/` y da 404. El script arma el zip con
  `ZipArchive.CreateEntry` reemplazando `\` por `/`.
- **Login en vez del módulo:** el frontend usa mock auth opt-in
  (`VITE_MOCK_AUTH=true` en `useAuth.tsx`). Sin la flag muestra el login real de
  Supabase. El script pone mock ON por defecto (`-NoMock` para desactivarlo).
- **Repoint al backend:** `VITE_API_BASE` por defecto apunta al stack dev
  (`fm2mrqtsu1`); parametrizable para qa/prod.
- **PS 5.1:** `$ErrorActionPreference='Continue'` + chequeo de `$LASTEXITCODE`
  (el stderr de pnpm/aws/curl abortaba el script con `Stop`).

## Promoted knowledge

- Zips para Amplify/S3 SIEMPRE con forward-slash o los assets dan 404.
- `VITE_MOCK_AUTH=true` = entra como SuperUsuario sin login (todo mock).

## Follow-ups

- Cuando exista qa/prod estable, correr con `-ApiBase` de ese ambiente y
  `-NoMock` si se quiere el login real.
