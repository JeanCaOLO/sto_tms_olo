# 2026-11-10 — CI/CD GitLab → Amplify en la cuenta de Intelix

## What changed

- `.gitlab-ci.yml`: pipeline propio basado en `.gitlab-ci.yml.reference` de la plantilla, conserva el
  include de `.gitlab/intelix-ci.yml`. Jobs: `verificar` (tsc + vitest, todo commit/MR),
  `dependencias` (npm audit, no bloquea), `deploy-dev` (push a `main`).
- `scripts/ci/deploy_amplify.py`: publica `out/` en una rama de Amplify por zip, parametrizado por
  `AMPLIFY_APP_ID`/`AMPLIFY_BRANCH`.
- `docs/guides/ci-cd-amplify.md`: mapeo rama → ambiente, política IAM mínima, variables, rollback.
- Despliegue de prueba desde local (perfil `CP-Developers-IntMAY`): `tms-frontend-dev` rama `dev`,
  job 13, https://dev.d200vkxzilg7v5.amplifyapp.com.

## Why

Jesús pidió que GitLab despliegue a Amplify en cada commit, en la cuenta AWS de Intelix
(484907500756), no en la del sandbox. Decidió que ese frontend consuma el backend del sandbox
(`dev-tms-common-services`).

## How

- Primero apunté por error a la app del sandbox (`d1q6tzcx0ew3rk`); Jesús lo corrigió antes de
  subir nada.
- En la cuenta de Intelix: `tms-frontend-dev` existía (último deploy 17-sep, sin repo) y el backend
  `oc26007-tms-backend-dev` es la versión vieja (16-sep), incompatible con el frontend actual. Se
  excluyó todo lo de "monitor" (es del Monitor de Integraciones OLO, otro proyecto).
- Verificado: home y ruta SPA 200, bundle con el API `pmc95jqekl`, preflight CORS 204 (el API
  permite `*`).
- `src/__tests__/db-connectivity.test.ts` se salta sin `.env.local` (no bloquea el CI); en local falla
  porque busca nombres de tabla viejos (sin `tbl_`).

## Follow-ups

- Infra de Intelix: usuario IAM de despliegue (política en la guía) y runner del proyecto. El rol
  `CP-Developers-IntMAY` no tiene permisos de IAM.
- Variables CI/CD en GitLab: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (+ `VITE_GOOGLE_CLIENT_ID`).
- Google OAuth: agregar el origen `https://dev.d200vkxzilg7v5.amplifyapp.com`.
- Actualizar `db-connectivity.test.ts` a los nombres `tbl_*`.
