# Despliegue del módulo Devoluciones

> **Guía histórica de la primera entrega.** Antes de ejecutar, consultar [estado reconciliado del 2026-11-11](docs/devoluciones/ESTADO_ACTUAL.md): también hay SQL 64–66, solicitudes Cliente, rechazo, filtro de país y permisos/bucket/CORS pendientes. No aplicar todas las migraciones por suposición. El archivo móvil comparado ya coincide con sandbox; no requiere redespliegue solo por esta auditoría.

Guía para quien despliega (Intelix). El módulo recibe en bodega la mercadería devuelta por los conductores, por viaje,
y **impide liquidar un viaje con devoluciones sin recibir**. Si se despliega en otro orden, el módulo queda a medias (ver
"Qué pasa si se invierte el orden").

> Quien desarrolló el módulo **no despliega**. Esta guía describe qué hay que desplegar y en qué orden.

## Qué se despliega

| # | Pieza | Dónde | Qué cambió |
|---|---|---|---|
| 1 | Migraciones de BD | `sql/60_devoluciones_recepcion.sql`, `sql/61_devoluciones_estado_completed.sql`, `sql/62_devoluciones_formularios_por_seleccion.sql` | Columnas de recepción en `tbl_returns`, tablas del formulario, vista `vw_return_trips`, rol "Devoluciones"; la 62 permite varios formularios por viaje (tabla `tbl_return_form_items`) |
| 2 | Backend `admin` | `backend/admin` (stack `dev-tms-admin`) | 8 rutas nuevas `/api/v1/devoluciones/*` (`admin_returns.py`, `admin_returns_sql.py`) |
| 3 | Backend `tarifas` | `backend/tarifas` (stack `dev-tms-tarifas`) | Bloqueo de liquidación (`returns_gate.py`) y variable `TMS_RETURNS_GATE` |
| 4 | Frontend | raíz del repo (Amplify) | Pantalla `/devoluciones` nueva (con casillas para armar formularios), aterrizaje por rol (`/`), mensaje de devoluciones sin recibir en Liquidaciones, se elimina `/devoluciones/legacy` |

No cambia la layer común `tms_common`, ni `backend/mobile`, ni la app del chofer.

## Orden obligatorio

1. **Migraciones** (si la BD del ambiente no las tiene).
2. **Backend `admin`.**
3. **Probar** que las rutas responden (sección "Verificación").
4. **Backend `tarifas`.** Desde aquí el bloqueo está activo.
5. **Frontend.**

### 1. Migraciones

La base `tms_olo` es la misma para local y sandbox: **60 y 61 ya están aplicadas allí** (2026-11-04). Para otra base:

```bash
node --env-file=.env.local scripts/run-migration.mjs sql/60_devoluciones_recepcion.sql             # simulación
node --env-file=.env.local scripts/run-migration.mjs sql/60_devoluciones_recepcion.sql --execute   # aplicar
node --env-file=.env.local scripts/run-migration.mjs sql/61_devoluciones_estado_completed.sql
node --env-file=.env.local scripts/run-migration.mjs sql/61_devoluciones_estado_completed.sql --execute
node --env-file=.env.local scripts/run-migration.mjs sql/62_devoluciones_formularios_por_seleccion.sql
node --env-file=.env.local scripts/run-migration.mjs sql/62_devoluciones_formularios_por_seleccion.sql --execute
```

Corre la simulación y el `--execute` en comandos separados. Son idempotentes. La 62 **recrea la vista `vw_return_trips`**
(deja de traer `form_id`/`form_number` y trae `forms_count`) y quita la restricción de un formulario por viaje, así que
va **antes** del backend `admin` nuevo. Rollbacks, en este orden: `sql/62_devoluciones_formularios_por_seleccion_rollback.sql`,
`sql/61_devoluciones_estado_completed_rollback.sql` y `sql/60_devoluciones_recepcion_rollback.sql` (el 62 y el 60 copian lo
capturado a tablas `*_bak` antes de quitar columnas o formularios).

El rol de la aplicación `tms_app` necesita permisos sobre las tablas nuevas; la migración 60 los otorga. Comprobar:

```sql
select table_name, string_agg(privilege_type, ',') from information_schema.role_table_grants
where grantee = 'tms_app' and table_name in ('tbl_return_forms', 'tbl_return_form_sections', 'vw_return_trips') group by 1;
```

### 2. Backend `admin`

Sandbox (con credenciales de AWS):

```bash
python scripts/sandbox/deploy_backend.py admin
```

o con SAM, como el resto de los stacks: `cd backend/admin && sam deploy --config-env <dev|qa|prod>`.

`backend/admin/template.yaml` agrega 8 rutas de API Gateway (`ReturnsSummaryRoute`, `ReturnsTripsRoute`, `ReturnsTripRoute`,
`ReturnsFormCreateRoute`, `ReturnsFormGetRoute`, `ReturnsFormUpdateRoute`, `ReturnsReceiveAllRoute`, `ReturnsReceiveRoute`). Las rutas **solo existen** si se despliega este
template: un `ROUTES` nuevo sin `RouteKey` da 404 de API Gateway.

### 3. Verificación (antes de tarifas)

Con un token de un usuario que tenga el módulo `devoluciones`:

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://<api>/api/v1/devoluciones/resumen   # 200 {"data": {...}}
curl -s -H "Authorization: Bearer $TOKEN" "https://<api>/api/v1/devoluciones/viajes?estado=pendientes"
```

Sin token debe dar 401. Un 404 con `Not Found` de API Gateway significa que las rutas no quedaron desplegadas.
Un usuario sin el permiso `devoluciones` recibe 403.

### 4. Backend `tarifas`

```bash
python scripts/sandbox/deploy_backend.py tarifas      # o: cd backend/tarifas && sam deploy --config-env <ambiente>
```

`backend/tarifas/template.yaml` deja `TMS_RETURNS_GATE: 'on'`. Con el flag activo, una liquidación nueva de un viaje con
devoluciones `pending`/`approved` se rechaza con 409: *"El viaje tiene N devolución(es) sin recibir…"*. Los viajes sin
devoluciones se liquidan igual que antes. Solo se mira el alta de la liquidación; anular o cambiar estado no se toca.

### 5. Frontend

Desplegar el frontend (Amplify desde GitLab, o `npm run deploy:sandbox:frontend`). Variables: ninguna nueva.

## Qué pasa si se invierte el orden

- **`tarifas` antes que `admin`:** el bloqueo ya rige pero no existe dónde recibir devoluciones. Un viaje con una
  devolución pendiente no se puede liquidar ni recibir, y las rutas `/api/v1/devoluciones/*` dan 404 de API Gateway.
  Remedio inmediato: poner `TMS_RETURNS_GATE` en `off` (abajo) y desplegar `admin`.
- **Frontend antes que `admin`:** la pantalla `/devoluciones` carga pero todas sus llamadas fallan con 404.
- **Sin migraciones:** `admin` falla con errores de columna/tabla inexistente (`received_at`, `vw_return_trips`…).

## Usuarios y permisos

El rol **"Devoluciones"** lo crea la migración 60 con permisos `view`, `edit` y `export` solo en el módulo `devoluciones`.
Quien lo tenga: entra directo a `/devoluciones` (sin Dashboard), ve el módulo, recibe devoluciones y llena el formulario.
Para dar el rol: Configuración → Usuarios. Si el rol debe limitarse a un país, usar el alcance por país del rol.

## Operación

- **Apagar el bloqueo sin redesplegar código:** cambiar la variable de entorno `TMS_RETURNS_GATE` de la Lambda `tarifas`
  a `off` (consola de Lambda o `aws lambda update-function-configuration`). Vuelve a regir con `on`.
- **Viajes que quedan bloqueados:** los que tengan devoluciones sin recibir. Búsqueda:

  ```sql
  select r.route_number, count(*) as abiertas
  from tbl_returns rt
  join tbl_dispatch_guides g on g.id = rt.dispatch_guide_id
  join tbl_routes r on r.id = g.route_id
  where coalesce(rt.status, 'pending') in ('pending', 'approved')
  group by 1 order by 2 desc;
  ```

## Rollback

1. `TMS_RETURNS_GATE=off` en `tarifas` (inmediato).
2. Volver a desplegar la versión anterior de `admin`, `tarifas` y frontend.
3. Las migraciones **no hace falta revertirlas** (son aditivas y no estorban). Si se quieren quitar: rollbacks 61 y 60.

## Pruebas de aceptación tras el despliegue

1. Con el rol Devoluciones: `/` lleva a `/devoluciones`; el menú muestra solo ese módulo.
2. Un viaje con 2 devoluciones: recibir una → "1/2 recibidas", sigue "por recibir"; recibir la otra → "Listo para liquidar".
3. En Liquidaciones, un viaje con una devolución sin recibir muestra "No se puede liquidar el viaje X porque tiene N devolución(es)
   sin recibir…" y no se puede liquidar; si se intenta por la API directa, el backend responde 409.
4. Recibirla y liquidar → se liquida. Un viaje sin devoluciones se liquida igual que antes.
5. Formularios: marcar 2 de las devoluciones de un viaje → "Crear formulario (2)" → guardar (toma número `DEV-AAAA-MM-####`). El viaje lista
   ese formulario con 2 devoluciones; las marcadas ya no se pueden elegir de nuevo. Crear otro con las demás, reabrir e imprimir.
6. Un usuario con otro rol que no tiene `devoluciones` no ve el módulo (403 en la API, "sin acceso" en la pantalla).

## Pendientes conocidos (no bloquean el despliegue)

- La app del chofer no envía foto ni firma al registrar una devolución (solo producto, cantidad y motivo).
- El formato impreso del formulario se armó a partir del PDF de ejemplo (`.test/devoluciones/`); conviene que bodega lo valide.
- Estado del trabajo y decisiones: `.test/NOTA-MODULO-DEVOLUCIONES.md`.
