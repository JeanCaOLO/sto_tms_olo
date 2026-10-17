# Pendientes de Tracking que necesitan túnel (o AWS)

Todo lo de abajo quedó **preparado pero sin ejecutar** porque requiere el túnel SSM a Aurora, el backend local contra la BD o el despliegue en AWS. Cada punto dice qué es, cómo hacerlo, cómo verificarlo y cómo deshacerlo.

> **Orden obligatorio:** el backend v2 (`backend/tracking`) lee la columna `routes.departed_at`. **Aplicar `sql/44` (T2) ANTES** de levantar o desplegar el backend v2 contra una base; si no, `GET /viajes` falla con `column r.departed_at does not exist`.

## Resumen

| # | Pendiente | Requiere | Estado |
|---|---|---|---|
| T0 | Abrir túnel y levantar el backend de tracking en local | túnel | — |
| T1 | Verificar qué migraciones de tracking (40–43) están aplicadas | túnel | sin verificar |
| T2 | Aplicar `sql/44_tracking_rendimiento.sql` | túnel + rol DDL | escrita, no aplicada |
| T3 | Verificar el contrato v2 contra el backend real | túnel | script listo |
| T4 | Pasar la web de mock a API | túnel | listo (solo configuración) |
| T5 | Probar la ingesta real (seed, iniciar, posiciones por calles) | túnel | scripts listos |
| T6 | Revisar los planes de consulta con los índices nuevos | túnel | — |
| T7 | Medir costo y latencia antes/después | túnel / AWS | script listo |
| T8 | Evidencias en S3 (subida, URL firmada estable) | AWS (stack desplegado) | probado solo con fakes |
| T9 | Desplegar el stack `tracking` (Intelix) | AWS | — |
| T10 | Retención y partición de `tracking_positions` | túnel + rol DDL | propuesta |
| T11 | Limpiar datos de prueba | túnel | script listo |

---

## T0 — Túnel y backend local

1. **Túnel SSM** a Aurora en `localhost:15432` (perfil y datos en `HANDOFF.md` §3 y `docs/guides/tunel-ssm-a-rds.md`; en Windows, `scripts/tunel-aurora.ps1`):
   ```
   aws ssm start-session --target i-062fc98e8e26c0f79 --document-name AWS-StartPortForwardingSessionToRemoteHost \
     --parameters '{"host":["db-tms-olo.cluster-cjo2ss6io0lb.us-east-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}' \
     --profile ext-claude --region us-east-2
   ```
   Aurora y el bastión solo están encendidos L–V 05:00–17:00 (hora CR). El túnel se cae por inactividad.
2. **Backend con tracking:** `npm run api:local:base` (`backend/local/serve.py`, puerto 4000).
   **Ojo:** `npm run api:local` corre `backend-planif/serve.py`, que **no** incluye el stack `tracking`. Si se necesitan ambos a la vez, levantar el de tracking en otro puerto (`EFLOW_API_PORT=4001 npm run api:local:base`) y apuntar Vite a ese (`EFLOW_API_URL=http://localhost:4001 npm run dev`).
3. Requiere `.env.local` con `TMS_DB_*` y `JWT_SECRET`. Aurora exige SSL.

## T1 — Migraciones de tracking aplicadas

Solo está confirmada la 40 en dev (`.test/tracking_nuevo/03`). Verificar:
```sql
select filename, applied_at from schema_migrations where filename like '4%tracking%' order by 1;
-- y, por si se aplicaron a mano:
select column_name from information_schema.columns where table_name = 'drivers' and column_name = 'app_user_id';  -- 41
select to_regclass('tracking_reviews');                                                                            -- 42
select column_name from information_schema.columns where table_name = 'tracking_events' and column_name = 'distance_m'; -- 43
```
Faltantes, en orden: `node --env-file=.env.local scripts/run-migration.mjs sql/4X_....sql` (dry-run) y luego con `--execute`.

## T2 — Aplicar `sql/44_tracking_rendimiento.sql`

Agrega `routes.departed_at`, índice `lower(status)`, índice de orden/cursor `(organization_id, coalesce(actual_start_time, created_at) desc, id desc)`, `pg_trgm` + índices trigram (número de viaje, placa, conductor) y `tracking_events(route_id, event_time desc)`.

1. Dry-run (transacción con ROLLBACK): `node --env-file=.env.local scripts/run-migration.mjs sql/44_tracking_rendimiento.sql`
2. Aplicar: igual con `--execute`.
3. **Permiso:** `create extension pg_trgm` necesita un rol con CREATE en la base (`olo_db`, credenciales `TMS_DB_ADMIN_*` de `env.download`). Si `tms_app` no puede, correr con el rol admin.
4. Verificar:
   ```sql
   select indexname from pg_indexes where indexname in ('ix_routes_status_lower','ix_routes_org_sort','ix_routes_route_number_trgm','ix_vehicles_plate_trgm','ix_drivers_full_name_trgm','ix_tracking_events_route_time');
   select extname from pg_extension where extname = 'pg_trgm';
   ```
5. **Rollback:**
   ```sql
   drop index if exists ix_routes_status_lower, ix_routes_org_sort, ix_routes_route_number_trgm, ix_vehicles_plate_trgm,
     ix_drivers_full_name_trgm, ix_tracking_events_route_time;
   alter table routes drop column if exists departed_at;   -- antes, volver al backend anterior (v1)
   delete from schema_migrations where filename = '44_tracking_rendimiento.sql';
   ```
6. En índices grandes de producción usar `create index concurrently` fuera de transacción (el archivo usa `create index` normal: válido en dev/qa con poco volumen).

## T3 — Verificar el contrato v2 contra el backend real

Contraparte real de `__tests__/mock-backend.test.ts`.
1. T0 + T2 hechos.
2. Obtener un JWT: iniciar sesión en la web (modo API) y copiar el token de la sesión en localStorage, o `POST /api/auth/login`.
3. `TMS_TOKEN=<jwt> node scripts/tracking-contract-check.mjs --api http://localhost:4000 --pais CR`
4. Debe terminar en **"Contrato v2 OK."**. Comprueba: forma de lista/detalle/parada, KPIs, país y 400 por país inválido, KPIs solo en la 1.ª página, evidencias solo factura + firma, `next_stop_id` por secuencia, URLs firmadas estables, recorrido ordenado ≤ 2000, y mide tiempos/tamaños.
5. Si algo falla: corregir **backend o mock** para que digan lo mismo (el contrato es [contrato-api-v2.md](./contrato-api-v2.md)).

## T4 — Pasar la web de mock a API

No hay código que cambiar: el cliente ya es el real.
1. `.env.local`: `VITE_MOCK_AUTH=false` (o quitarlo). Sin el mock, `api.ts` usa `apiFetch` → `/api/v1/tracking/*` → proxy de Vite → `localhost:4000`.
2. T0 levantado, iniciar sesión real (usuario con `tracking:view`).
3. Comprobar: no aparecen los controles de simulación ni "Iniciar viaje (pruebas)", los KPIs y el selector de país funcionan, el panel muestra evidencias de S3 (si hay) y el replay carga `/recorrido`.
4. Para iniciar viajes de prueba sin la app, ver T5 (el botón de pruebas solo existe en mock).

## T5 — Probar la ingesta real

1. Datos: `node --env-file=.env.local scripts/seed-tracking-demo.mjs` (dry-run) y `--execute`. Requiere `sql/41` y `DEMO_DRIVER_PASSWORD`.
2. Iniciar un viaje (en modo API la web no tiene botón: lo hará la app / Planificación). Con el token:
   ```
   curl -X POST -H "Authorization: Bearer $TMS_TOKEN" -H 'Content-Type: application/json' -d '{}' \
     http://localhost:4000/api/v1/tracking/viajes/<plan_trip_id>/iniciar
   ```
3. Mover el camión por calles:
   `TMS_TOKEN=<jwt> node scripts/simular-posiciones.mjs --route <route_id> --ruta-paradas --por-calles --paso-m 150 --interval 2000`
4. Verificar en la web (modo API) y en SQL:
   - `select departed_at from routes where id = '<route_id>';` se llena al salir > 300 m de la sede.
   - `tracking_last_positions` avanza; un punto con `is_mock = true` o `accuracy_m > 200` se guarda pero no mueve el camión.
   - Reenviar el mismo lote → `duplicates` (idempotencia por `client_id`).
   - Cerrar la última parada (`POST /paradas/{id}/transicion`) → el viaje sigue activo ("Sin paradas pendientes").
   - Enviar posiciones dentro de las 2 h siguientes al cierre → se aceptan (no se pierden) sin mover la última posición.
   - Dos `iniciar` simultáneos → uno `created: true`, otro `created: false` (no 500).
   - Completar o cancelar ese viaje en Planificación → en Tracking aparece completado/anulado y sale de "Activos" (lectura de `plan_trips`; `routes.status` no cambia).

## T6 — Planes de consulta con los índices nuevos

Con datos reales (tras T2), revisar que se usan los índices:
```sql
explain (analyze, buffers) select r.id from routes r
  where r.organization_id = '<org>' and lower(r.status) = any(array['active','en ruta','en transito','en tránsito','en_ruta','in_progress'])
  order by coalesce(r.actual_start_time, r.created_at) desc, r.id desc limit 31;
explain (analyze, buffers) select r.id from routes r join vehicles v on v.id = r.vehicle_id
  where v.plate ilike '%ABC%';
```
Esperado: `Index Scan` / `Bitmap Index Scan` sobre `ix_routes_org_sort`, `ix_routes_status_lower`, `ix_vehicles_plate_trgm`. Los valores exactos del filtro de estado están en `tracking_logic.ACTIVE_STATUS_SQL_VALUES`. Si la tabla es chica, Postgres puede preferir un seq scan (es correcto); repetir cuando haya volumen.

## T7 — Costo y latencia antes/después

- **Local:** `scripts/tracking-contract-check.mjs --veces 10` da p50, máximo y bytes por endpoint (lista + KPIs, detalle, recorrido).
- **AWS (tras T9):** CloudWatch del Lambda `tracking`: `Invocations`, `Duration` p50/p95, `Errors`; comparar una semana antes/después. Esperado por pestaña abierta: de 3 invocaciones cada 10 s a 1 cada 15 s (+1 si el panel está abierto), es decir ~70 % menos.
- Ajustar `MemorySize` del Lambda midiendo `Duration` (estándar Intelix: medir, no dejar por defecto).

## T8 — Evidencias en S3

Requiere el bucket del stack `tracking` (T9) o uno de pruebas.
1. Con un viaje activo: `POST /paradas/{id}/evidencias/upload-url` con `{ "kind": "photo_invoice", "mime_type": "image/jpeg" }` → subir a `url` con `fields` (POST de formulario, ≤ 5 MB) → `POST /paradas/{id}/evidencias` con `key` y `client_id`.
2. Verificar: `photo_other` → 422; en la web el pedido muestra la miniatura; dos `GET /viajes/{id}` seguidos devuelven **la misma URL** (caché de firmas de ~1 h; se re-firma con < 10 min de vida).
3. Revisar `AllowedOrigins` (CORS) del bucket con los orígenes reales del frontend.

## T9 — Desplegar el stack `tracking` (lo despliega Intelix)

1. Antes: T2 aplicada en el ambiente destino, T3 en verde contra local.
2. `cd backend/tracking && sam build && sam deploy --config-env <dev|qa|prod>` (o `npm run deploy:sandbox:backend` para el sandbox). Crea el Lambda, las rutas en el API Gateway compartido (incluida la nueva `GET /viajes/{id}/recorrido`; se retiran `novedades` y `devoluciones`) y el bucket privado de evidencias (`DeletionPolicy: Retain`).
3. Confirmar la Layer `tms_common` y los parámetros SSM de red del ambiente.
4. **Gzip:** verificar con `curl -H 'Accept-Encoding: gzip' -I .../viajes?limit=30` → `content-encoding: gzip` (API Gateway HTTP API pasa el cuerpo base64 del Lambda).
5. Dar permisos del módulo `tracking` a los roles operativos (`view` para monitorear; el rol Chofer ya tiene `create`/`edit` con `sql/43`).
6. Registrar el cambio en `docs/reference/aws-inventario-tms.md`.
7. **Rollback:** redesplegar la versión anterior del stack (la web v2 necesita el contrato v2: revertir ambos juntos).

## T10 — Retención y partición de `tracking_positions`

Hoy crece sin límite (~360 000 filas/día con 200 camiones según el blueprint). Propuesta, a decidir antes de tráfico real:
1. Política: conservar 90 días en caliente; exportar a S3 (Parquet o CSV comprimido) antes de borrar.
2. Convertir a tabla particionada por mes (`partition by range (recorded_at)`), migrando los datos existentes en una migración nueva (`sql/45_...`) con ventana de mantenimiento.
3. Job mensual (EventBridge + Lambda) que crea la partición siguiente, exporta y elimina la más vieja (`drop table` de la partición: instantáneo, sin `vacuum`).
4. Referencia: `.test/blueprint/backend/sql/004_locations_partitioning.sql`.

## T11 — Limpiar datos de prueba

`node --env-file=.env.local scripts/limpiar-tracking-prueba.mjs --route VJ-...` (dry-run) y `--execute`. Ya no borra `returns`: si un viaje de prueba tuviera devoluciones, el script aborta (FK) y hay que revisarlas a mano. No borra objetos de S3.

---

## Pendiente: cierre automático y sincronización entre módulos

Diseñado y probado el 2026-10-17, **retirado** por la restricción de no alterar otros módulos. Queda para cuando se acuerde con los dueños de Planificación y Liquidaciones.

**Situación actual:** el viaje lo termina Planificación (`plan_trips`) y Tracking lo refleja leyendo ese estado. `routes.status` queda "En tránsito", así que Liquidaciones (`tarifas_v_viajes`), Dashboard y Reportes no lo ven completado.

**Qué se propuso (y cómo implementarlo):**
1. **Cierre automático en Tracking:** en `POST /paradas/{id}/transicion` (`backend/tracking/src/app.py`, función `transition_stop`), dentro de la misma transacción, si quedan 0 paradas pendientes y la transición no es a `pending`:
   ```sql
   UPDATE routes SET status = 'Completada', actual_end_time = %s /* occurred_at del cierre */, completed_stops = %s, updated_at = now()
   WHERE id = %s AND actual_end_time IS NULL;
   ```
   más el evento `route_completed` y `route_completed: true` en la respuesta. Solo toca Tracking, pero cambia lo que ve Liquidaciones: acordarlo.
2. **Tracking → Planificación:** en la misma transacción,
   `UPDATE plan_trips SET status = 'completed', updated_at = now() WHERE id = (SELECT plan_trip_id FROM routes WHERE id = %s) AND status = 'pending';`
   **Toca Planificación** (su tabla): requiere acuerdo.
3. **Planificación → Tracking:** en `backend-planif/src/adapters/outbound/aurora/plan_repo.py` (`actualizar_estado_viaje` y `actualizar_estado`), dentro de una `pg.transaction()`:
   ```sql
   UPDATE routes SET status = %s /* 'Completada' | 'Anulada' */,
          actual_end_time = coalesce((SELECT max(g.actual_arrival_time) FROM dispatch_guides g WHERE g.route_id = routes.id), now()),
          updated_at = now()
   WHERE plan_trip_id = %s AND actual_end_time IS NULL;
   ```
   (y la variante por plan: `UPDATE routes r ... FROM plan_trips pt WHERE pt.plan_id = %s AND r.plan_trip_id = pt.id AND r.actual_end_time IS NULL`). Guardarlo con la sonda `tabla_existe("tracking_last_positions")` para ambientes sin `sql/40`. **Toca Planificación.**
4. **Cuidados que salieron al revisarlo** (efecto en Liquidaciones):
   - Escribir `Anulada`, no `Cancelada`: la vista `tarifas_v_viajes` solo traduce `anulado/anulada/cancelled` a `cancelled`; con `Cancelada` el viaje aparece entre los pendientes de liquidar.
   - `actual_end_time` = hora de la última entrega, no la del clic: Liquidaciones calcula la duración (tarifas por hora) con `actual_start_time → actual_end_time`.
   - Reabrir en Planificación no debería reabrir la ruta sin revisar qué pasa con una liquidación ya hecha.
5. Al implementarlo, la lectura de `plan_trips` que hoy hace Tracking (`tracking_sql.STATUS_EXPR` / `END_EXPR`) puede quedar como respaldo o retirarse.

## Otros pendientes (sin túnel)

| Pendiente | Cómo |
|---|---|
| App móvil | Ajustarse al contrato v2: sin novedades/devoluciones/`photo_other`; brechas B1–B10 en `.test/blueprint/mobile-tracking-tms/05-brechas-y-checklist.md`. |
| Caché de permisos | Cada request hace 2–3 consultas de permisos (`tms_common/permissions.py`). Cachearlas por usuario 60 s en el contenedor Lambda; toca la capa común de todos los módulos: coordinarlo con el dueño de backend. |
