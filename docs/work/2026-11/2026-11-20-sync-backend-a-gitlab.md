# 2026-11-20 — `backend/` de GitHub sincronizado a TMS-Backend (GitLab)

## What changed

- `backend/` de `github/main` (281e73e) portado al layout hexagonal de TMS-Backend, en la rama
  `sync-backend-github-2026-11-19` (sin push). Detalle en
  `TMS-Backend/docs/work/2026-11/2026-11-19-sincronizacion-backend-github.md`.
- Arreglos baratos de certificación aplicados allá: HSTS y cabeceras de seguridad, R1, R4, R7, CORS y cobertura en CI.

## Why

Pedido de Jesús: llevar el backend a GitLab cumpliendo template_base para que la próxima certificación salga bien.

## How

- 1216 tests verdes, ruff y bandit limpios.
- Re-certificación: QA y PROD quedan bloqueados solo por P2 (TLS en IaC). Con P2: QA 94 % Apto, PROD 87 % Apto.
- Salidas: `intelix/certificacion/salida/{qa,prod}-backend-v2/`.

## Follow-ups

- P2: dominio propio + certificado ACM (DevOps Intelix). C12 iss/aud coordinado con el frontend.
- Push y MR de la rama de TMS-Backend.

## Cierre

- MR !1 de TMS-Backend aceptado: `main` = e70f41d. El pipeline del MR falló en `lint:ruff` con
  `pip: orden no encontrada`. El runner de Intelix es shell y no tiene pip; `main` falla igual desde el 29-oct.
  Lint, tests y bandit se corrieron en local.
- App vacía `certificacion-tms` borrada de Dokploy.
- MR !2 de TMS-Backend aceptado (`main` = 1bfd6e1): C12 (JWT con `iss`/`aud`) y COD6 (piso de 80 %, cobertura
  medida 85,6 %). Re-certificación v3: solo bloquea P2; con P2, QA y PROD quedan en 95 % Apto.
- Resumen para gestión de lo que falta para salir Apto: `docs/certificacion/que-falta-para-apto-2026-11-20.md`.

## API REST de eFlow QA (ePRAC): conexión verificada

- Jean Carlo pasó el host correcto (`10.17.224.224:87`, no `.20`). Credenciales en `.env.local` (gitignored), como
  `EFLOW_QA_HOST/USER/PASSWORD`. No pisa la conexión SQL porque `EFLOW_CR_HOST` ya existe.
- Solo lectura: `GET /api/TestConexion` → BD `EFLOW_OLO_QA_SAP`, v3.2.1.1. Login (`POST /Autenticacion`, solo emite
  el token) OK. `GET /Expediciones/ObtenerExpediciones` DISP/DISP ±30 días → 21 pedidos (0109: 15 con prioridad 5;
  0029: 6 con prioridad 0), ninguno con viaje ni observaciones.
- El cliente de la rama `integracion-eflow-qa` (`eflow_api.py`) funciona contra QA en modo `qa` con `EFLOW_API_WRITE=off`.
  No se probó ninguna escritura (prioridad, GenerarAcciones, viaje, bajada).
- Pendiente: el punto 1 de `docs/oms/pendientes/04-integracion-api-eflow-qa.md` (de esa rama) queda verificado para
  la lectura.
- Comparación API QA vs SQL y faltantes: `docs/wms-eflow/comparacion-api-qa-vs-sql-2026-11-20.md` (bases distintas: sin acceso SQL al .224; el API trae 15 de 56 columnas, sin detalle ni coordenadas).
