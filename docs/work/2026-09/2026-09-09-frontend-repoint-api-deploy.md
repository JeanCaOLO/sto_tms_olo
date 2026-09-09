# 2026-09-09 — Frontend: base de API configurable + deploy Amplify

## What changed

- El cliente `eflow-api.ts` ahora antepone una **base de API configurable**
  (`import.meta.env.VITE_API_BASE`) a todas las llamadas. Vacío en dev (sigue el
  proxy de Vite `/api/* -> localhost:4000`); en build apunta al API Gateway del
  `TMS-Backend`.
- Para respetar el techo de líneas (`standards/code-quality.md`, 200), se
  extrajeron las formas de fila cruda y los mappers a **`eflow-mappers.ts`**;
  `eflow-api.ts` los re-exporta para no romper imports existentes.
- `.env.example` documenta `VITE_API_BASE`.

## Deploy — investigación y prueba

- El backend real ya vive en `olo/tms/TMS-Backend` (Python serverless, una Lambda
  por endpoint sobre EFLOW). Stack dev verificado:
  `https://0apkwluqye.execute-api.us-east-1.amazonaws.com/dev`.
- **Amplify no conecta git self-hosted** (`git.intelix.biz`). La org resuelve
  esto con apps Amplify sobre **CodeCommit** (patrón de Monitor). Para *probar*
  el deploy sin montar CodeCommit se usó el **deploy manual de Amplify** (subir
  el `out/` como zip):
  1. `aws amplify create-app --name tms-frontend-dev` + `create-branch planificacion`
     (con regla de rewrite SPA para deep-linking).
  2. `pnpm build` con `VITE_API_BASE` = URL del stage dev (queda horneada en el bundle).
  3. `create-deployment` -> subir el zip a la URL presignada (`curl -T`) -> `start-deployment`.
- **Resultado:** deploy `SUCCEED`. SPA servida en
  `https://planificacion.d200vkxzilg7v5.amplifyapp.com` (200 en root, deep-link y
  index; rewrite SPA OK). App Amplify `d200vkxzilg7v5` (dev, borrable).

## Why

Al separar el frontend del `server/` de Node, el módulo necesita apuntar a un API
desplegado en vez de al proxy local. Una sola var de entorno (`VITE_API_BASE`)
permite el mismo código en dev (proxy) y en cada ambiente desplegado.

## Follow-ups

- Para deploy repetible/CI: decidir CodeCommit + Amplify git (patrón Monitor) vs
  seguir con deploy manual por zip.
- Cuando exista un stack **qa** estable del backend, apuntar el build de qa a esa
  URL (no a la `dev` efímera).
- CORS del API: hoy `AllowedOrigin=*` en dev; en qa/prod fijarlo al dominio del
  frontend.
