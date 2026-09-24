# Backend TMS — Lambdas Python + SAM

API del TMS migrada desde el Express de `server/` al estándar Intelix: **Python 3.13, AWS Lambda, API Gateway HTTP, SAM**. El contrato HTTP es el mismo que tenía el Express, así que el frontend no cambia; solo hay que apuntar `VITE_API_BASE` al API desplegado.

Decisión y cambios de comportamiento: [`docs/decisions/0002-backend-lambdas-python-sam.md`](../docs/decisions/0002-backend-lambdas-python-sam.md).

> **Despliegue:** al **sandbox** (cuenta `758837481569`) lo sube `npm run deploy:sandbox` cuando el usuario lo indica ([guía](../docs/guides/despliegue-sandbox.md), [inventario](../docs/reference/aws-inventario-tms.md)); a producción lo lleva Intelix. Los módulos toman la Layer `tms_common` del parámetro SSM `/<env>/tms/common-layer-arn` (no de un export de CloudFormation: un export en uso impide publicar versiones nuevas), así que tras `sam deploy` de `common-services` hay que actualizar ese parámetro con el output `CommonLayerArn` antes de desplegar los módulos.

## Estructura

```
backend/
  secrets/          Template aparte con los 3 secretos (valores se cargan en consola)
  common-services/  API Gateway HTTP compartido + Lambda authorizer JWT + Layer tms_common + rol IAM
    layers/tms_common/tms_common/   Código compartido: pg (Aurora), eflow_db (SQL Server), tokens, config, responses
    src/authorizer/                 Valida "Authorization: Bearer <jwt>"
  auth/             /api/auth/login | signup | session | logout
  data/             /api/data/{table}   CRUD genérico (lista blanca de tablas y columnas)
  context/          /api/v1/...         Jerarquía país → almacén → cliente, filtrada por scope
  eflow/            /api/health, /api/viajes..., /api/catalogos/...   Lectura de EFLOW por país (modo mock por defecto)
  admin/            /api/v1/admin/users|roles|permissions, /api/v1/me/permissions   Usuarios, roles y matriz de permisos
  planning/         /api/v1/planificacion/pedidos   Pedidos alistados por fecha de entrega (insumo de Planificación)
  local/            serve.py (Lambdas locales en :4000) y create_admin.py (primer administrador)
  tests/            pytest (sin AWS ni BD: todo con dobles)
```

Cada módulo es un stack SAM propio (`template.yaml` + `samconfig.toml` con dev/qa/prod) y cuelga sus rutas del API de `common-services` con `Fn::ImportValue`. Stacks: `<env>-tms-secrets`, `<env>-tms-common-services`, `<env>-tms-auth`, `<env>-tms-data`, `<env>-tms-context`, `<env>-tms-eflow`.

## Mapa Express → Lambda

| Express (`server/`) | Lambda | Auth |
|---|---|---|
| `tms-auth.mjs` (`requireAuth`) | `common-services/src/authorizer` | — |
| `POST /api/auth/login` | `auth` | pública |
| `POST /api/auth/signup`, `GET /session`, `POST /logout` | `auth` | JWT |
| `tms-routes.mjs` `/api/data/:table` (GET/POST/PATCH/DELETE) + `tms-select`/`tms-mutations`/`tms-relations`/`tms-schema` | `data` | JWT |
| `tms-context-routes.mjs` + `domain/context/*` (`/api/v1/*`) | `context` | JWT |
| `index.mjs` + `queries.mjs` + `db.mjs` (EFLOW) | `eflow` | pública (igual que antes) |
| — (nuevo) Configuración → Usuarios / Roles | `admin` | JWT + rol administrador |

## Usuarios, roles y login (siempre datos reales)

- El login usa `auth_credentials` (bcrypt) + `app_users` en Aurora. Un usuario con `is_active = false` no puede entrar (403); la API lo expone como `status: inactive`.
- **Administración** (`/api/v1/admin/*`, pantalla Configuración → Usuarios / Roles): crear un usuario escribe credencial + `app_users` + `user_scopes` en **una transacción**; borrar elimina las tres cosas. Solo pueden usarla los roles `SuperAdministrador`, `SuperUsuario`, `Administrador` y `Admin` (`admin/src/admin_access.py`). Un admin no puede borrarse ni desactivarse a sí mismo, y un rol asignado no se puede borrar.
- **Bitácora de auditoría** (`sql/16`, `tms_common/audit.py`, [ADR 0003](../docs/decisions/0003-bitacora-auditoria.md)): cada alta/edición/baja de filas la registra un trigger de BD en `audit.events` (solo inserción) con antes/después; `tms_handler` le pasa a la BD quién es el usuario en cada ruta que escribe (sin usuario = `system`). Login, login fallido/bloqueado y logout los registra `auth`; las acciones del navegador van por `POST /api/v1/audit/events` (`view`, `export`, `print`, `download`). Consulta: `GET /api/v1/admin/audit` (filtros `from`, `to`, `actor_type`, `app_user_id`, `email`, `action`, `module`, `table`, `entity_id`, `limit` ≤ 200, cursor `before_id` → `next_cursor`) y `GET /api/v1/admin/audit/{id}`; exigen `auditoria.view`. Una tabla nueva hay que registrarla en `audit.tracked_tables`. La tabla está **particionada por mes** (`sql/17`): sin `from` la consulta mira los últimos 3 meses; `AuditMaintenanceFunction` crea cada mes las particiones siguientes. **Usuario de BD:** la app debe usar `tms_app` (`sql/18`, sin DDL ni permiso para alterar la bitácora); el secreto `/<env>/tms/db` lleva `username: tms_app` y las migraciones usan el dueño.
- **Matriz de permisos** (`sql/15`, `tms_common/permissions.py`): cada rol tiene módulo × acción (`view, create, edit, delete, export`; un módulo por ítem del menú, tabla `app_modules`) y los países que ve (`roles.all_countries` o `role_countries`). Los roles administradores tienen todo por código. Endpoints: `GET /api/v1/me/permissions` (cualquier usuario: su matriz efectiva), `GET /api/v1/admin/permissions/catalog`, `GET|PUT /api/v1/admin/roles/{id}/permissions` (solo administradores; el PUT reemplaza la matriz completa en una transacción). **Enforcement:** la API genérica exige `create`/`edit`/`delete` del módulo dueño de la tabla (`data/src/table_modules.py`; tabla sin módulo → solo administradores) y filtra las lecturas por los países del rol en `countries` y en las tablas con `country_id` (las filas sin país son compartidas y se ven). **Leer** exige `view` en alguno de los módulos cuyas pantallas leen la tabla (`READ_MODULES` en `data/src/table_modules.py`, sacado del uso real en `src/pages/**`; si la tabla no figura, su módulo dueño); `countries` y `zones` los lee cualquier usuario; `app_users` sin un módulo lector (`conductores`, `transportistas`, `paises`, `configuracion`) se limita a la propia fila. `GET /api/v1/planificacion/pedidos` exige `planificacion.view`. **Pendiente:** las tablas embebidas (`alias:tabla(...)`) no se revisan por separado ni se filtran por país; solo la tabla raíz.
  Si una pantalla nueva lee una tabla, agregá su módulo a `READ_MODULES` o el rol recibirá 403.
- Alcance: `Global` (fila de `user_scopes` sin país/almacén/cliente) o una o más combinaciones país › almacén › cliente.
- La API genérica `/api/data` **ya no permite escribir** `app_users`, `roles` ni `user_scopes` (403): cualquier usuario logueado podía cambiarse el rol.
- **Primer administrador** (la API exige ya ser admin):

  ```bash
  # con el túnel a Aurora abierto (scripts/tunel-aurora.ps1) y TMS_DB_* en .env.local
  python backend/local/create_admin.py --email admin@ologistics.com --name "Administrador" --role SuperAdministrador
  ```

  Pide la contraseña por consola (o `ADMIN_PASSWORD`), crea el rol si no existe y le da alcance GLOBAL.

## EFLOW: modo mock (por ahora)

Mientras no haya red desde AWS hacia los SQL Server de EFLOW, el stack `eflow` se despliega con `EflowMode=mock` (default en `eflow/samconfig.toml`). En ese modo la Lambda:

- sirve datos fijos de `eflow/src/mock_data.json`, con las mismas formas de fila que la fuente real. Los datos salen de los fallbacks del frontend (`src/pages/planificacion/fallback-*.ts`): catálogo real de EFLOW QA más 20 paradas sintéticas en la GAM, agrupadas en 4 viajes;
- queda **fuera de la VPC** y no lee el secreto de EFLOW;
- responde también `GET /api/catalogos/rutas-dias`.

`GET /api/health` devuelve `"mode": "mock"`. Para pasar a datos reales: `EflowMode=live` en el samconfig del ambiente, con las subnets con ruta a EFLOW y el secreto `/<env>/tms/eflow` cargado. En modo live, `rutas-dias` responde 501 hasta que se porte su SQL.

> **Mock solo para EFLOW.** El login y los datos de Aurora (`auth`, `data`, `context`) son siempre reales.

## Planificación: pedidos a planificar

`GET /api/v1/planificacion/pedidos?fecha_entrega=YYYY-MM-DD` (sin parámetro = mañana, hora de Costa Rica). Devuelve los pedidos de `wms_expediciones` con `situacion = 'GENE'` (alistados por el OMS), sin viaje WMH, cuya `fecha_planificada` (fecha de entrega comprometida) es esa fecha. `delivery_zone` = código de ruta del WMS. **Gap:** `wms_expediciones` no trae peso ni volumen (vienen de `EXPEDICIONESCABECERA` en EFLOW): se devuelven `null` con `capacity_known: false`, nunca 0. Dirección y coordenadas salen del punto de entrega por defecto del cliente final, si existe.

## Puntos de entrega

Modelo: cliente (`customers`) → cliente final (`final_customers`) → punto (`delivery_points`) → dirección (`addresses`).
La lista va por la API genérica; **alta/edición/baja** van por `POST /api/v1/delivery-points`,
`PATCH|DELETE /api/v1/delivery-points/{id}` (módulo `context`, atómico, con la acción del módulo `puntos_entrega` de la matriz y autorizado por el scope del cliente).
`stores` queda solo para la bodega de origen (`CD-CR`).

## Carga de puntos de entrega desde el WMS

`backend/local/ingest_delivery_points.py` carga un CSV del WMS (`Codigo,Cliente,Zona,Ruta,Latitud,Longitud`) como
cliente final + dirección + punto de entrega de un cliente (`customers.code`). Restaura el cero de los códigos numéricos
(el WMS usa 9 dígitos), guarda coordenadas solo si están dentro de Costa Rica (`0,0` → `PENDING`, fuera del país →
`FAILED`) y liga la ruta a `zones.code`. Es idempotente y trabaja en bloque (tabla temporal):

```bash
python backend/local/ingest_delivery_points.py --csv <archivo.csv> --customer COFERSA            # simulación
python backend/local/ingest_delivery_points.py --csv <archivo.csv> --customer COFERSA --execute  # aplica
```

## Correr los tests

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows; en Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

## Desplegar (Intelix)

**Región: `us-east-2`**, la misma de Aurora (`db-tms-olo`); todos los `samconfig.toml` la usan.

Requisitos: AWS SAM CLI, Docker (para `auth`: bcrypt se compila en el contenedor de Lambda) y credenciales de la cuenta. Parámetros SSM que deben existir por ambiente:

- `/<env>/tms/network/subnets`: subnets privadas (lista separada por comas) con ruta a Aurora (y a los SQL Server de EFLOW cuando `eflow` pase a `live`).
- `/<env>/tms/network/lambda-sg`: security group de las Lambdas.
- Salida a Secrets Manager desde esas subnets (VPC endpoint o NAT).

Orden (ejemplo `dev`):

```bash
# 1. Secretos (una sola vez por ambiente). Después, en la consola, cargar los valores reales.
#    JWT: usar el MISMO JWT_SECRET del Express para no invalidar sesiones.
cd backend/secrets && sam deploy --config-env dev

# 2. API compartida, authorizer y Layer
cd ../common-services && sam build && sam deploy --config-env dev

# 3. Módulos (en cualquier orden)
cd ../auth    && sam build --use-container && sam deploy --config-env dev
cd ../data    && sam build && sam deploy --config-env dev
cd ../context && sam build && sam deploy --config-env dev
cd ../eflow   && sam build && sam deploy --config-env dev
cd ../admin   && sam build --use-container && sam deploy --config-env dev
cd ../planning && sam build && sam deploy --config-env dev
```

El output `ApiUrl` de `common-services` es el valor de `VITE_API_BASE` del frontend (`deploy-frontend.ps1 -ApiBase <ApiUrl>`). En qa/prod, cambiar `CorsAllowOrigin` al dominio de Amplify en `common-services/samconfig.toml`.

### Formato de los secretos

| Secreto | Contenido |
|---|---|
| `/<env>/tms/db` | `{"host","port","username","password","dbname"}` (formato de secreto RDS) |
| `/<env>/tms/jwt` | `{"jwt_secret": "..."}` |
| `/<env>/tms/eflow` | `{"cr": {"host","port","user","password","db_wmh","db_sap"}, "ve": {...}}` |

## Desarrollo local

`backend/local/serve.py` ejecuta **las mismas Lambdas** detrás de un router que imita API Gateway y el authorizer, en `http://localhost:4000` (el destino del proxy de Vite):

```bash
pip install -r backend/requirements-dev.txt
powershell -File scripts/tunel-aurora.ps1   # otra terminal: Aurora en localhost:15432 (TMS_DB_PORT=15432); se reconecta solo si SSM corta la sesión
npm run api:local                           # Lambdas locales en :4000
npm run dev                                 # frontend
```

Sin variables `*_SECRET_NAME`, `tms_common.config` lee `.env.local` (`TMS_DB_*`, `JWT_SECRET`, `EFLOW_*`). EFLOW corre en mock salvo `EFLOW_MODE=live`. `npm run server` (Express) sigue existiendo pero **no** tiene la administración de usuarios; usar `api:local`.

## Agregar una tabla o un endpoint

- **Tabla nueva en `/api/data`**: agregarla a `TABLES` (y sus FKs a `FOREIGN_KEYS`) en `data/src/relations.py`. Las columnas se leen solas de `information_schema` en el cold start.
- **Endpoint nuevo**: función en el `app.py` del módulo + entrada en `ROUTES` + un `AWS::ApiGatewayV2::Route` en su `template.yaml` (con `AuthorizerId` salvo que sea público).
- **Módulo nuevo**: copiar la estructura de `context/` (template + samconfig + `src/app.py`).

## Pendientes

- EFLOW corre en modo mock. Para pasar a `live` hace falta la red hacia EFLOW (VPN/peering en us-east-2) y portar el SQL real de `GET /api/catalogos/rutas-dias` (`RUTA_DIA_AB` / `RUTA_PROMESA_AB`), que hoy vive solo en el repo `TMS-Backend`.
- Las rutas EFLOW son públicas (heredado del Express); protegerlas con el authorizer cuando `eflow-api.ts` mande el token.
- La conexión a Aurora no valida el certificado CA de RDS (paridad con `rejectUnauthorized: false`).
- Retirar `server/` cuando el deploy en dev esté validado de punta a punta.
