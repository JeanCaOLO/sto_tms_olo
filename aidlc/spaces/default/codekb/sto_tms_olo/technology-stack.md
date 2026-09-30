# Stack tecnológico — STO / TMS OLO

> Versiones reales observadas el 2026-09-30 en `package.json`,
> `backend/requirements-dev.txt`, `backend/pytest.ini` y los `template.yaml`.

## Backend

- **Python 3.13** (todos los `Runtime: python3.13` en los 8 `template.yaml`).
- **AWS SAM** (`Transform: AWS::Serverless-2016-10-31`), **API Gateway HTTP**
  (ApiGatewayV2), **Lambda** x86_64, **SSM Parameter Store**, **Secrets
  Manager**, **CloudWatch Logs** (LogFormat JSON), **EventBridge ScheduleV2**.
- **Aurora PostgreSQL** (`us-east-2`, `db-tms-olo`); driver `pg` en la Layer
  `tms_common`. Usuario app `tms_app` (sin DDL).
- **SQL Server** para EFLOW (`eflow_db` en la Layer; dep `mssql`), mock por
  defecto.
- **bcrypt** (auth, compilado en contenedor Lambda), JWT.
- **pytest 8.3.3** (`backend/requirements-dev.txt`; `pytest.ini` testpaths=tests;
  agrega los `requirements.txt` de la Layer, auth y admin).

## Frontend (`package.json`)

- **React 19.1.0**, react-dom 19.1.0, **react-router-dom 7.6.3**.
- **Vite 7.0.3**, **TypeScript ~5.8.3**, **Vitest 4.1.11**, Playwright 1.62.1.
- **decimal.js 10.4.3** (dinero exacto en tarifas), **zod 3.23.8** (schemas),
  date-fns 4.1.0.
- **i18next 25.4.1** + react-i18next (ES/EN), **leaflet / react-leaflet 5**
  (mapas de planificación), recharts 3.2.0, xlsx 0.18.5.
- Tailwind 3.4.17, ESLint 9, `@vitejs/plugin-react-swc`.
- Legacy/arrastre: `express 4.21.2` (server/ legacy), `pg`, `mssql`, `bcryptjs`,
  `jsonwebtoken`; `@stripe/react-stripe-js` y `firebase` **sin uso claro** en los
  módulos revisados (posible arrastre del prototipo).

## Despliegue

- `npm run deploy:sandbox` → `scripts/sandbox/deploy_backend.py` +
  `deploy_frontend.py`. Backend a Lambda/SAM (cuenta sandbox `758837481569`);
  frontend a Amplify. Producción la despliega Intelix.
- Dev local: `npm run api:local` (Lambdas locales en `:4000` vía
  `backend/local/serve.py`) + `npm run dev` (Vite) + túnel a Aurora
  (`scripts/tunel-aurora.ps1`, `localhost:15432`).

## Sources

- `package.json`, `backend/requirements-dev.txt`, `backend/pytest.ini`.
- `backend/admin/template.yaml` y demás `template.yaml` (runtime, servicios AWS).
- `backend/README.md` (despliegue, local).

## Assumptions & Open Questions

- `firebase`/`@stripe/react-stripe-js` sin uso evidente — candidatos a limpieza.
- Versión exacta de pytest tomada de `requirements-dev.txt`; otras libs de
  backend viven en los `requirements.txt` por módulo (Layer/auth/admin).
