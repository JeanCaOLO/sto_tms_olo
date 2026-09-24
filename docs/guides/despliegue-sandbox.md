# Despliegue al sandbox de AWS

> Decisión del usuario (2026-09-24). El ambiente de AWS conectado (cuenta `758837481569`, región `us-east-2`) es un
> **sandbox para probar apps**. Intelix toma lo que está en el sandbox y lo despliega en producción.

## El proceso

1. **Se trabaja y se prueba en local**: `npm run dev` (frontend) + `npm run api:local` (backend Lambda en local,
   contra Aurora por el túnel `scripts/tunel-aurora.ps1`). Tests: `npm test`, `npm run type-check`,
   `cd backend && pytest`.
2. **Cuando el usuario lo indica**, se sube al sandbox:

   ```bash
   npm run deploy:sandbox            # backend completo y después frontend
   npm run deploy:sandbox:backend    # solo backend (o: python scripts/sandbox/deploy_backend.py data admin)
   npm run deploy:sandbox:frontend   # solo frontend
   ```

3. Se revisa en el sandbox (URL de Amplify que imprime el script).
4. Intelix lo pasa a producción.

Las **migraciones de BD** (`sql/NN_*.sql`) van aparte y siempre con el runner:
`node --env-file=.env.local scripts/run-migration.mjs sql/NN_x.sql` (simulación) y luego `--execute`.
La base Aurora `tms_olo` es la misma para local y sandbox.

## Qué hace cada script

- `scripts/sandbox/deploy_backend.py`
  - Prepara el ambiente: secretos `/dev/tms/jwt` y `/dev/tms/eflow`, parámetros SSM de red
    `/dev/tms/network/subnets` y `/dev/tms/network/lambda-sg`, endpoint VPC de Secrets Manager (la VPC de Aurora
    no tiene NAT) y el bucket de artefactos `tms-sandbox-artifacts-758837481569`. Todo idempotente.
  - Arma la Layer `tms_common` y cada Lambda con dependencias **compiladas para Linux** (`pip --platform
    manylinux2014_x86_64`), así no hace falta SAM CLI ni Docker (clave para `bcrypt`).
  - `aws cloudformation package` + `deploy` de los stacks `dev-tms-*` en orden: `common-services`, `auth`, `data`,
    `context`, `eflow` (en modo mock), `admin`, `planning`.
  - La BD se usa con el rol de la app `tms_app` (secreto `/dev/tms/db-app`, ver `sql/18`), nunca con el dueño.
- `scripts/sandbox/deploy_frontend.py`: toma la `ApiUrl` de `dev-tms-common-services`, buildea con
  `VITE_API_BASE`, y publica en Amplify (app `dev-tms-frontend`, rama `sandbox`; la crea si no existe, con la regla
  de SPA).

## Permisos

El usuario IAM `ext.claude` necesita la política `infra/iam/ext-claude-sandbox-deploy-policy.json` (acotada a
`us-east-2` y a los recursos `dev-tms-*`), además de lo que ya tiene (lectura, S3, secretos `/dev/tms/*`, túnel SSM).

## Red

| Qué | Valor |
|---|---|
| VPC de Aurora | `vpc-0a8252dbb12741364` |
| Subnets de las Lambdas | `subnet-0bb5505fe97ac8064`, `subnet-0f1b05bea67e94ebe`, `subnet-0394ed09a2cdb0520` (privadas, las de Aurora) |
| Security group de las Lambdas | `sg-06b3986a1f95d2f19` (default de la VPC; ya permite 5432 a Aurora) |
| Salida a AWS | Solo por endpoints VPC: S3 (gateway, ya existía) y Secrets Manager (interface, lo crea el script) |
