# Documentación de API — STO / TMS OLO

> Endpoints reales observados el 2026-09-30 en los dicts `ROUTES` de cada
> `app.py` y los `AWS::ApiGatewayV2::Route` de los templates. Auth = JWT
> authorizer salvo donde se indique.

## auth (`backend/auth/src/app.py`)

| Método / ruta | Auth | Qué hace |
|---|---|---|
| `POST /api/auth/login` | pública | bcrypt contra `auth_credentials`+`app_users`; `is_active=false`→403; emite JWT. Registra login/login_failed/login_blocked en auditoría. |
| `POST /api/auth/signup` | JWT | crea credencial (mín 6 chars). |
| `GET /api/auth/session` | JWT | devuelve `{user}`. |
| `POST /api/auth/logout` | JWT | 204; registra logout. |

## data — API genérica (`backend/data/src/app.py`)

| Método / ruta | Qué hace |
|---|---|
| `GET /api/data/{table}` | lista/count; params `select`, `filters` (JSON), `order`, `limit`, `single`/`maybeSingle`/`head`/`count`. Filtra por países del rol y por `READ_MODULES`. |
| `POST /api/data/{table}` | insert (exige `create` del módulo dueño). |
| `PATCH /api/data/{table}` | update (exige `edit`). |
| `DELETE /api/data/{table}` | delete (exige `delete`). |

`app_users`, `roles`, `user_scopes` → **403** (`ADMIN_MANAGED`: solo por
`/api/v1/admin`).

## context — jerarquía por scope (`backend/context/src/app.py`)

| Método / ruta | Qué hace |
|---|---|
| `GET /api/v1/countries` | países filtrados por scope (Global ve todo). |
| `GET /api/v1/countries/{id}/warehouses` | almacenes del país. |
| `GET /api/v1/warehouses/{id}/customers` | clientes del almacén. |
| `GET /api/v1/customers/{id}/final-customers` | clientes finales. |
| `GET /api/v1/final-customers/{id}/delivery-points` | puntos de entrega. |
| `GET /api/v1/me/context` | scopes del usuario. |
| `POST /api/v1/delivery-points` · `PATCH\|DELETE /api/v1/delivery-points/{id}` | alta/edición/baja atómica, autorizada por scope del cliente. |

## eflow — read-only (`backend/eflow/src/app.py`)

Pública (heredado del Express; pendiente proteger). País por `?pais=cr|ve`.

| Método / ruta | Qué hace |
|---|---|
| `GET /api/health` | reporta `"mode": mock\|live`. |
| `GET /api/viajes` · `/api/viajes/{id}` · `/api/viajes/{id}/pedidos` | viajes EFLOW. |
| `GET /api/catalogos/{rutas,transportistas,conductores,vehiculos,rutas-dias}` | catálogos EFLOW. |

Errores con shape Express: 4xx `{error}`, fallo BD 502.

## admin (`backend/admin/src/app.py`) — JWT + rol administrador

| Método / ruta | Qué hace |
|---|---|
| `GET\|POST /api/v1/admin/users` · `PATCH\|DELETE /api/v1/admin/users/{id}` · `POST /api/v1/admin/users/{id}/password` | CRUD transaccional de usuarios (credencial+app_users+user_scopes en una transacción). |
| `GET\|POST /api/v1/admin/roles` · `PATCH\|DELETE /api/v1/admin/roles/{id}` | CRUD de roles. |
| `GET /api/v1/admin/permissions/catalog` · `GET\|PUT /api/v1/admin/roles/{id}/permissions` | matriz de permisos (PUT reemplaza la matriz completa en una transacción). |
| `GET /api/v1/me/permissions` | cualquier usuario: su matriz efectiva. |
| `GET /api/v1/admin/audit` · `GET /api/v1/admin/audit/{id}` | bitácora (exige `auditoria.view`; filtros from/to/actor/action/module/table, cursor). |
| `POST /api/v1/audit/events` | eventos de navegador (view/export/print/download). |

## planning (`backend/planning/src/app.py`) — JWT, exige `planificacion.view`

| Método / ruta | Qué hace |
|---|---|
| `GET /api/v1/planificacion/pedidos?fecha_entrega=YYYY-MM-DD` (o `?dia=manana`, default) | pedidos de `wms_expediciones` con situación `GENE`, sin viaje WMH, con `fecha_planificada` = esa fecha. Filtra por `organization_id`. Peso/volumen → `null` + `capacity_known:false`. `delivery_zone` = código de ruta del WMS. |

## Sources

- `backend/{auth,data,context,eflow,admin,planning}/src/app.py` (dicts `ROUTES`).
- `backend/admin/template.yaml` (rutas ApiGatewayV2).
- `backend/README.md` (mapa Express→Lambda, contratos).

## Assumptions & Open Questions

- Las tablas embebidas (`alias:tabla(...)`) en `/api/data` no se revisan por
  separado ni se filtran por país (solo la tabla raíz) — pendiente reconocido.
- Rutas EFLOW públicas (sin authorizer) — pendiente de seguridad.
