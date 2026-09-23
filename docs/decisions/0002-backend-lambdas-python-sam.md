# 0002 — Correr el backend del TMS en Lambdas Python con SAM

- **Status**: Accepted
- **Date**: 2026-09-23
- **Owner role**: system-architect
- **Affects**: `server/` (Express), `backend/` (nuevo), `src/lib/supabase.ts`

## Context

El estándar Intelix (`docs/standards/desarrollo-aws-intelix.md` §6) y el `DECIDED` de `project.md` (2026-09-03) fijan el stack oficial: Python 3.13 + Lambdas + API Gateway + SAM. Aun así, el API del TMS corría en un Express de Node (`server/`), prohibido por el estándar salvo excepción justificada. ADR-009 (`docs/arquitectura-tms-oms/06-adr/`) proponía seguir evolucionando ese Express como monolito modular.

## Decision

Migrar todo el `server/` a Lambdas Python organizadas como monorepo SAM en `backend/`, manteniendo el mismo contrato HTTP para que el frontend no cambie.

- `backend/common-services`: API Gateway HTTP compartido (stage = ambiente), Lambda authorizer JWT, Layer `tms_common` (pg8000, python-tds, PyJWT) y un único rol IAM para las Lambdas del API.
- Un stack por módulo, con una Lambda por módulo que enruta por `routeKey`: `auth` (`/api/auth/*`), `data` (`/api/data/{table}`, CRUD genérico con lista blanca), `context` (`/api/v1/*`, filtrado por scope) y `eflow` (lectura de EFLOW por país). Los módulos cuelgan sus rutas del API compartido con `Fn::ImportValue`.
- `backend/secrets`: template aparte para los secretos (Aurora, JWT, EFLOW). Los valores se cargan en consola.
- Auth: se mantiene el mismo JWT HS256 + `auth_credentials` con bcrypt. Los tokens y hashes existentes siguen siendo válidos (hay tests de compatibilidad con `jsonwebtoken`/`bcryptjs`).

## Considered alternatives

- **Seguir con Express (ADR-009)**: monolito modular en Node. Rechazado porque contradice el runtime oficial (Python) y el despliegue serverless del estándar.
- **Repo aparte `tms-back`**: lo que describe el `DECIDED` de arquitectura de repos. Se pospone: `backend/` replica esa estructura (common-services + stack por módulo), así que se puede mover tal cual cuando exista el repo.
- **Migrar a Cognito**: rechazado por ahora porque obliga a migrar usuarios y a cambiar el login del frontend. Queda como evolución posible.
- **Reemplazar `/api/data/{table}` por endpoints por módulo**: rechazado por ahora porque obliga a reescribir cada pantalla. Los endpoints explícitos se agregan de forma incremental.

## Consequences

- **Positive**: el backend queda en el stack oficial; se despliega por IaC con dev/qa/prod; escala y cobra por invocación; los secretos salen de `.env` y pasan a Secrets Manager.
- **Negative**: más plantillas (una por módulo, con rutas explícitas); cold starts en la primera request; la Lambda de `auth` necesita `sam build --use-container` (bcrypt es binario).
- **Neutral**: `server/` se mantiene para desarrollo local hasta validar el deploy.

## Migration notes

Cambios de comportamiento frente al Express (intencionales):

- `UPDATE`/`DELETE` sin filtros → 400. Antes afectaban la tabla entera. Ningún call-site del frontend lo usa.
- Los errores 500 inesperados ya no exponen el mensaje interno; los errores de Postgres (FK, unique…) sí siguen llegando.
- Token inválido: 403 del authorizer (antes 401). Sin header `Authorization`: 401.
- `/v1/final-customers/{id}/delivery-points` autoriza con la misma regla que el resto de `/v1` (antes tenía una comparación más laxa).
- Errores de autorización en `/v1` devuelven JSON `{ data, error }` (antes caían al handler por defecto de Express).
- Violaciones de integridad de Postgres (FK, unique: SQLSTATE 23xxx) → 409 (antes 500).
- `app_users`, `roles` y `user_scopes` ya no se escriben por `/api/data` (403): la administración va por el módulo `admin` (`/api/v1/admin/*`, transaccional, solo administradores).
- Login de un usuario `inactive` → 403 (antes entraba).

Pasos: ver `backend/README.md`.

## Open coordination points

- **Región**: todo en `us-east-2`, la región de Aurora `db-tms-olo`.
- **EFLOW en modo mock** (`EflowMode=mock`, fuera de VPC) hasta que haya red hacia los SQL Server de EFLOW; el login y los datos de Aurora son siempre reales.
- **Intelix (despliegue)**: SSM de red (`/<env>/tms/network/subnets`, `/<env>/tms/network/lambda-sg`), VPC con ruta a Aurora y a los SQL Server de EFLOW, y endpoint/NAT hacia Secrets Manager.
- **Equipo `TMS-Backend`**: ya existen Lambdas EFLOW desplegadas (incluye `/api/catalogos/rutas-dias`, que no estaba en `server/` y falta portar). Definir cuál queda como fuente única.
- **Seguridad**: las rutas EFLOW siguen públicas (igual que antes) y la conexión a Aurora no valida el certificado CA de RDS. Las dos quedan pendientes.
