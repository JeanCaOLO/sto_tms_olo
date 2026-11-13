# 2026-11-05 — Login con Google (solo ologistics.com e intelix.biz)

## What changed

- **Google Cloud** (proyecto `sistema-tms-513814`):
  - pantalla de consentimiento externa, **publicada en producción** y sin logo, para no pedir la
    verificación de marca;
  - cliente OAuth web "TMS login" con los orígenes `https://sandbox.d1q6tzcx0ew3rk.amplifyapp.com` y
    `http://localhost:5173`, sin redirect.
- **`backend/auth/google/google_login.py`** (nuevo): Lambda `dev-tms-auth-google-login` **fuera de la
  VPC**. Valida el ID token con `oauth2.googleapis.com/tokeninfo` (`aud`, `iss`, `email_verified` y
  dominio) e invoca a `auth-api`.
- **`backend/auth/src/app.py`**: acción directa `google_login`.
  - Busca el usuario por correo o lo **crea sin rol** en la organización principal.
  - Bloquea a los usuarios inactivos y vuelve a validar el dominio.
  - Firma el JWT de siempre y deja auditoría con `method: google`.
- **`backend/auth/template.yaml`**: rol, log group, función, integración y ruta pública
  `POST /api/auth/google`. Parámetros `GoogleClientId` (SSM por ambiente) y `AllowedDomains`.
- **`backend/auth/samconfig.toml`**: `GoogleClientId=/<env>/tms/google-client-id`. Se creó en AWS el
  parámetro SSM `/dev/tms/google-client-id`.
- **Frontend:** `GoogleLoginButton.tsx` en `/login`, `src/lib/google-identity.ts` (carga GIS) y
  `src/lib/google-login.ts`. La variable `VITE_GOOGLE_CLIENT_ID` está en `.env.example` y en `.env.local`.
- **`scripts/sandbox/deploy_frontend.py`**: el build del sandbox lee `VITE_GOOGLE_CLIENT_ID` del mismo
  parámetro SSM. La app de Amplify no tiene repo conectado, así que una variable en la consola no
  llega al build. Igual se dejó cargada en la rama `sandbox`.
- **`backend/tests/test_auth_google.py`**: 11 pruebas.

## Why

Palencia pidió login con Google (reunión del 2026-11-05). Chus definió que solo entran `ologistics.com`
e `intelix.biz`, con aviso para cualquier otro dominio, y que la app quede "casi en producción", sin
usuarios de prueba.

## How

- La Lambda de auth está en la VPC sin NAT y no llega a Google. Se usó el patrón de `tarifas-mail`:
  una Lambda fuera de la VPC valida y le pide la sesión a la de adentro por invocación directa.
- El ID de cliente es público (va en el navegador), pero no se dejó fijo en el código porque hay uno
  por ambiente.
- **Verificación:**
  - `pytest` 560 en verde, `vitest` 1027 en verde y `sam validate` OK;
  - ya desplegado (PR #39): token falso → 401, sin token → 400;
  - la cuenta real `jaraujo@intelix.biz` entró y se creó sin rol, y luego se le asignó `SuperAdministrador`.

## Promoted knowledge

- Los usuarios creados por Google aparecen en Administración → Usuarios sin rol. Un admin les asigna uno.

## Follow-ups

- Crear `/qa/tms/google-client-id` y `/prod/tms/google-client-id` (con su cliente y sus orígenes) antes de desplegar en QA/PROD.
- El servidor local (`backend/local/serve.py`) no monta `POST /api/auth/google`. El login con Google solo se prueba desplegado.
