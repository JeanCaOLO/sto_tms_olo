# CI/CD del frontend: GitLab → Amplify (cuenta AWS de Intelix)

Cada commit en GitLab se verifica; cada push a `main` además se publica en Amplify.

| Rama GitLab | Ambiente | Amplify | Backend que consume |
|---|---|---|---|
| `main` | DEV | `tms-frontend-dev` (`d200vkxzilg7v5`, rama `dev`, us-east-1, cuenta Intelix) — https://dev.d200vkxzilg7v5.amplifyapp.com | API del sandbox `dev-tms-common-services` (us-east-2), el mismo del frontend del sandbox |

El frontend del sandbox (`sandbox.d1q6tzcx0ew3rk`, cuenta del sandbox) es otro despliegue: lo publica
`scripts/sandbox/deploy_frontend.py` a mano, no este pipeline.

## Qué corre

Pipeline: `.gitlab-ci.yml` (propio) + `.gitlab/intelix-ci.yml` (administrado por INTELIX, no se edita).

| Job | Cuándo | Qué hace |
|---|---|---|
| `verificar` | todo commit y MR | `npm ci`, `tsc --noEmit -p tsconfig.app.json`, `npm test` |
| `dependencias` | MR y `main` (no bloquea) | `npm audit --omit=dev --audit-level=high` |
| `deploy-dev` | push a `main`, tras `verificar` | `npm run build` con las `VITE_*` del ambiente + `scripts/ci/deploy_amplify.py` (zip → `create-deployment` → `start-deployment`) |

Runner tipo shell (como la plantilla): necesita `node`/`npm`, `python3` y `aws` (CLI v2) en el
servidor. Si falta alguno, el job falla con `[ERROR] falta '<herramienta>' en el runner`.

## Lo que hay que configurar una vez

1. **Usuario IAM de despliegue** en la cuenta de Intelix (lo crea infraestructura de Intelix; el rol
   `CP-Developers-IntMAY` no tiene permisos de IAM). Política mínima:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["amplify:CreateDeployment", "amplify:StartDeployment", "amplify:GetJob"],
       "Resource": "arn:aws:amplify:us-east-1:484907500756:apps/d200vkxzilg7v5/branches/dev*"
     }]
   }
   ```

2. **Variables CI/CD** en GitLab (Settings → CI/CD → Variables), *Protected* + *Masked*:
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Opcional (no secreta): `VITE_GOOGLE_CLIENT_ID` (sin
   ella no aparece el botón de Google).
3. **Runner** asignado al proyecto `olo/tms/TMS-Frontend` con las herramientas de arriba.
4. **Login con Google:** agregar `https://dev.d200vkxzilg7v5.amplifyapp.com` a los *Authorized
   JavaScript origins* del cliente OAuth (Google Cloud Console).

## Probar sin pipeline

Mismo camino que el job, desde una máquina con el perfil SSO de Intelix:

```bash
VITE_API_BASE=https://pmc95jqekl.execute-api.us-east-2.amazonaws.com/dev \
VITE_WS_URL=wss://8f3g64dx4a.execute-api.us-east-2.amazonaws.com/dev VITE_MOCK_AUTH=false npm run build
AWS_PROFILE=CP-Developers-IntMAY-484907500756 AWS_DEFAULT_REGION=us-east-1 \
AMPLIFY_APP_ID=d200vkxzilg7v5 AMPLIFY_BRANCH=dev python scripts/ci/deploy_amplify.py
```

## Rollback

Amplify guarda los despliegues anteriores: volver a publicar el commit previo (re-correr el job
`deploy-dev` de ese pipeline) o, en la consola de Amplify, *Redeploy this version* sobre el job
anterior.

## Pendiente

- QA/PROD: ramas `qa`/`master`, sus apps de Amplify y su backend propio.
- Si el backend se despliega en la cuenta de Intelix, cambiar `VITE_API_BASE`/`VITE_WS_URL` del job.
