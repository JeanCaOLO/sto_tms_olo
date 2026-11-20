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
