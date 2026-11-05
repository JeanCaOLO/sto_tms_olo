# Tracking móvil — configuración y despliegue

## Variables

### App (`TRACKING_TMS/frontend`)

| Variable | Uso |
|---|---|
| `EXPO_PUBLIC_API_BASE` | URL base del API, **https y sin barra final** en release. Si falta, en desarrollo usa el host de Metro (que reenvía `/api/mobile/*` al backend local; `metro.config.js`); en web, el origen; si no, `http://localhost:4100` (`src/config.ts`). |

`eas.json` (perfil `preview`) la fija al sandbox `https://g5hlbyw7b5.execute-api.us-east-2.amazonaws.com`. Para correr local contra AWS: `frontend/.env.local` (no se sube; bórralo para volver al backend local).

Identificadores: Android `com.ologistics.trackingtms`; iOS `com.ologistics.tmsolo` (app «TMS App» en App Store Connect).

### Backend (`backend/mobile/.env.example`)

| Variable | Uso |
|---|---|
| `DB_SECRET_NAME` | Secreto de Secrets Manager con `host, port, username, password, dbname`. Sin él se usan las planas. |
| `DB_HOST`, `DB_PORT`, `DB_NAME` (def. `tms_olo`), `DB_USER`, `DB_PASSWORD` | Desarrollo local. |
| `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD` | Dueño de las tablas, **solo migraciones** (`config.admin_db_config`). |
| `JWT_SECRET_NAME` / `JWT_SECRET` | Secreto propio de la app (clave `jwt_secret`). |
| `EVIDENCE_BUCKET` | Bucket de evidencias (lo crea el stack). |
| `AWS_REGION` | `us-east-2`. |
| `DRIVER_ROLE_NAME` | `Chofer` por defecto. |
| `API_PORT` | `4100` en el servidor local. |

## AWS (sandbox)

| Recurso | Valor |
|---|---|
| Cuenta / región | 758837481569 / us-east-2 |
| Stack | `dev-tms-mobile` |
| Lambda | `dev-tms-mobile-mobile-api` (Python 3.13, arm64, en la VPC de Aurora) |
| Secretos | BD `/dev/tms/db-app` (usuario `tms_app`, no el admin); JWT `/dev/tms/mobile-jwt` |
| Bucket | `dev-tms-mobile-evidencias-758837481569` |
| ApiUrl | `https://g5hlbyw7b5.execute-api.us-east-2.amazonaws.com` |

**Aurora solo está disponible L–V de 5 am a 5 pm (hora de Costa Rica).** Las pruebas escriben filas reales: usar solo choferes demo.

## Desplegar el backend

- Sandbox (desde `sto_tms_olo`): `python scripts/sandbox/deploy_backend.py mobile`.
- A QA/producción lo lleva **Intelix**: `sam build --use-container && sam deploy --config-env <dev|qa|prod>` en `backend/mobile`. `--use-container` es necesario por `bcrypt` (binario nativo).
- Migraciones: `backend/mobile/scripts/migrate.py` (credenciales admin).
- Contraseña de choferes demo: `scripts/set_demo_password.py` (credenciales admin).

## Construir la app

| Vía | Cómo |
|---|---|
| APK automático | GitHub Actions `.github/workflows/apk.yml` en cada push a `main` con cambios en `frontend/` (o a mano): typecheck + jest, `expo prebuild`, Gradle `assembleRelease` (arm64-v8a y armeabi-v7a). Sube `apk/tracking-tms.apk` + `apk/build-info.txt` (commit, fecha, API, sha256). Firmado con llave de depuración: sirve para instalar a mano; Play Store requiere llave propia. |
| IPA iOS | `.github/workflows/ios.yml`, **a mano** (macOS cuesta ~10×). Firma en la nube de Apple con llave de App Store Connect; deja `ios/tracking-tms.ipa`. Se instala por **TestFlight**. Secretos del repo: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`. Nunca subir `frontend/env.apple`. |
| EAS Build | `cd frontend && npx eas-cli@latest build -p android --profile preview` |

## Correr en local

1. Backend: `backend/mobile/local/serve.py` (puerto 4100; `local/env.py`, `local/dev_evidence.py` simula la subida sin S3).
2. App: `cd TRACKING_TMS/frontend && npx expo start`. Android: `scripts/android.ps1`; firewall de Windows: `scripts/firewall.ps1`.
3. Simular un recorrido: `backend/mobile/scripts/simular_recorrido.py`; ver presencia: `scripts/ver_presencia.py`.

Expo Go no incluye todos los módulos nativos: para GPS en segundo plano real se necesita **development build** (`npx expo run:android` o `eas build --profile development`).

## Antes de dar algo por terminado (app)

`npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` y `jest` (ver [pruebas.md](./pruebas.md)).

## Ruta antigua

El `README` de `backend/mobile` y algunos docs aún citan `mobile\backend`: la ruta vigente es `sto_tms_olo/backend/mobile` ([pendientes/01](./pendientes/01-contratos-y-docs-desactualizados.md)).
