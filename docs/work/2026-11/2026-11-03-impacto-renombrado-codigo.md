# 2026-11-03 — Inventario del impacto del renombrado (sql/59) en el código

Inventario exhaustivo de dónde el código de este repo nombra un objeto que renombra
`sql/59_estandar_oltp_renombrado.sql` (tablas, vistas, constraints, índices), y qué se hizo con cada uso.
Base: `main-v2` en `6551778` (antes del cambio). Se generó con

```
python scripts/estandar-bd/inventario_codigo.py --ref 6551778 --solo-sql --md <salida>
```

que busca **cada** nombre viejo con límites de palabra (no muestreo) en `backend/`, `src/`, `scripts/` y
`server/` (`backend-planif/` no existe en este worktree; `sql/` son migraciones históricas y no se
reescriben). `audit.events` y `audit.tracked_tables` se buscan solo calificados.

## Cómo se clasificó cada aparición

| Uso | Qué es | Qué se hizo |
|---|---|---|
| `sql` | Dentro de SQL: tras `FROM`/`JOIN`/`INTO`/`UPDATE`/`TABLE`/`REFERENCES`/`TRUNCATE`, o nombre de constraint/índice | Reescrito a físico con `scripts/estandar-bd/reescribir_codigo.py` (agrega `AS <viejo>` cuando el SQL califica columnas con el nombre de la tabla, p. ej. `ON CONFLICT ... WHERE order_items.x`) |
| `qualified` | `public.<tabla>` / `audit.<tabla>` | Reescrito a físico |
| `api` | Nombre lógico del contrato HTTP (`.from('orders')`, `/api/data/orders`) o literal usado como clave | Sin cambio: el backend traduce lógico→físico en un solo lugar (`tms_common/db_names.py`; `server/tms-db-names.mjs` para el server Express legado) |
| `otro` | Comentario, ruta de UI, palabra común (`routes`, `returns`, `roles`...) | Sin cambio |

Totales en la base: 1174 `sql` + 28 `qualified` (las que importan), 1192 `api`, 1990 `otro`.
Después del cambio quedan 45 apariciones `sql`/`qualified` con el nombre viejo, todas a propósito:

- `backend/mobile/sql/m01..m05` (16+): migraciones móviles ya aplicadas (historia, como `sql/`).
- `src/lib/tarifas/data/schema.ts` y su `schema.test.ts`: es la fuente del DDL histórico de `sql/19`
  (`print-tarifas-ddl`); sus nombres de índice `*_uq` son nombres de DDL, no se usan en tiempo de ejecución.
  **No volver a correr** `print-tarifas-ddl` contra la base después de la 59 (ver follow-ups de la entrada de trabajo).
- `backend/context/src/app.py:16` (`from delivery_points import ...`: import de Python, falso positivo) y
  dos comentarios (`backend/admin/template.yaml`, `db_names.py`).

## Lo que no se pudo resolver de forma mecánica (y cómo quedó)

- **Nombres de tabla pasados como argumento** a un helper que arma el SQL (`presence_writes(fake_db, "tracking_positions")`
  en `backend/mobile/tests/test_presence.py`): el reescritor no los ve como SQL. Los encontró la suite y se
  corrigieron a mano (2 casos).
- **SQL armado dinámicamente** en la data API (`backend/data/src`), tarifas (`tarifas_sql.py`) y el server
  Express (`server/tms-select.mjs`, `tms-mutations.mjs`): ahí la tabla llega como nombre lógico del cliente;
  se traduce con `physical()` justo al interpolar (`table_ref`/`qt`), y el caché de columnas de
  `information_schema` se indexa por nombre lógico (`logical()`), así sirve antes y después de retirar las vistas.
- **Frontend (`src/`)**: no depende de ningún nombre físico. Solo se tocaron los tests que van directo a
  Aurora (`src/__tests__/db-connectivity.test.ts`, `multi-tenant-isolation.test.ts`,
  `src/lib/tarifas/__tests__/aurora.*.test.ts`); esos quedan en rojo hasta aplicar la 59 (consultan `tbl_*`).
- **eFlow** (`backend/eflow*`, consultas SQL Server en `ingest_*`): no se tocó.
Total: 4384 apariciones ({'otro': 1990, 'sql': 1174, 'qualified': 28, 'api': 1192}).

### Por archivo

| Archivo | sql | qualified | api | otro | Acción (sql) |
|---|---|---|---|---|---|
| `backend/admin/src/admin_access.py` | 2 | 0 | 0 | 2 | reescrito a físico |
| `backend/admin/src/admin_audit.py` | 1 | 2 | 0 | 0 | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 8 | 0 | 0 | 2 | reescrito a físico |
| `backend/admin/src/admin_roles.py` | 0 | 0 | 0 | 1 | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 29 | 0 | 0 | 2 | reescrito a físico |
| `backend/admin/src/admin_users.py` | 1 | 0 | 0 | 3 | reescrito a físico |
| `backend/admin/src/app.py` | 0 | 0 | 0 | 7 | reescrito a físico |
| `backend/admin/src/audit_maintenance.py` | 0 | 2 | 0 | 0 | reescrito a físico |
| `backend/admin/template.yaml` | 0 | 1 | 0 | 2 | reescrito a físico |
| `backend/alerts/src/app.py` | 0 | 0 | 0 | 2 | reescrito a físico |
| `backend/alerts/src/expirations.py` | 6 | 0 | 0 | 8 | reescrito a físico |
| `backend/auth/src/app.py` | 4 | 0 | 0 | 0 | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/audit.py` | 2 | 2 | 0 | 0 | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/handler.py` | 0 | 0 | 0 | 4 | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/permissions.py` | 5 | 0 | 1 | 6 | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/pg.py` | 0 | 1 | 0 | 0 | reescrito a físico |
| `backend/context/src/app.py` | 1 | 0 | 0 | 1 | reescrito a físico |
| `backend/context/src/context_queries.py` | 7 | 0 | 0 | 0 | reescrito a físico |
| `backend/context/src/delivery_points.py` | 1 | 0 | 0 | 3 | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 13 | 0 | 0 | 0 | reescrito a físico |
| `backend/context/src/scopes.py` | 5 | 0 | 0 | 0 | reescrito a físico |
| `backend/data/src/app.py` | 0 | 0 | 4 | 6 | traduce db_names |
| `backend/data/src/relations.py` | 0 | 0 | 196 | 6 | traduce db_names |
| `backend/data/src/select_parser.py` | 0 | 0 | 1 | 1 | traduce db_names |
| `backend/data/src/select_query.py` | 0 | 0 | 1 | 5 | traduce db_names |
| `backend/data/src/table_modules.py` | 0 | 0 | 50 | 3 | traduce db_names |
| `backend/documents/src/app.py` | 2 | 0 | 0 | 0 | reescrito a físico |
| `backend/documents/src/contract_files.py` | 0 | 0 | 0 | 2 | reescrito a físico |
| `backend/eflow-sim/src/app.py` | 0 | 0 | 0 | 1 | sin cambio (eFlow / migración) |
| `backend/eflow-sim/src/sim_source.py` | 0 | 0 | 0 | 1 | sin cambio (eFlow / migración) |
| `backend/eflow/src/live_source.py` | 0 | 0 | 0 | 4 | sin cambio (eFlow / migración) |
| `backend/eflow/src/mock_data.json` | 0 | 0 | 5 | 0 | sin cambio (eFlow / migración) |
| `backend/eflow/src/mock_source.py` | 0 | 0 | 10 | 8 | sin cambio (eFlow / migración) |
| `backend/local/activar_rol_tms_app.py` | 1 | 4 | 0 | 0 | reescrito a físico |
| `backend/local/create_admin.py` | 3 | 0 | 0 | 0 | reescrito a físico |
| `backend/local/delivery_points_csv.py` | 0 | 0 | 0 | 2 | reescrito a físico |
| `backend/local/ingest_delivery_points.py` | 0 | 1 | 0 | 6 | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 15 | 0 | 0 | 0 | reescrito a físico |
| `backend/local/serve.py` | 0 | 0 | 0 | 4 | reescrito a físico |
| `backend/mobile/local/dev_evidence.py` | 0 | 0 | 0 | 5 | reescrito a físico |
| `backend/mobile/local/serve.py` | 0 | 0 | 0 | 4 | reescrito a físico |
| `backend/mobile/scripts/set_demo_password.py` | 6 | 0 | 0 | 0 | reescrito a físico |
| `backend/mobile/scripts/simular_recorrido.py` | 0 | 0 | 0 | 3 | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 9 | 0 | 0 | 4 | reescrito a físico |
| `backend/mobile/sql/m01_mobile_base.sql` | 11 | 0 | 0 | 12 | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m02_mobile_indices.sql` | 5 | 0 | 1 | 3 | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m03_driver_presence.sql` | 6 | 0 | 0 | 5 | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m04_photo_product.sql` | 5 | 0 | 0 | 1 | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m05_stop_type.sql` | 3 | 0 | 0 | 2 | sin cambio (eFlow / migración) |
| `backend/mobile/src/mobile_api/audit.py` | 2 | 2 | 0 | 0 | reescrito a físico |
| `backend/mobile/src/mobile_api/auth.py` | 0 | 0 | 2 | 1 | reescrito a físico |
| `backend/mobile/src/mobile_api/evidence.py` | 0 | 0 | 1 | 0 | reescrito a físico |
| `backend/mobile/src/mobile_api/logic.py` | 0 | 0 | 1 | 0 | reescrito a físico |
| `backend/mobile/src/mobile_api/positions.py` | 1 | 0 | 0 | 4 | reescrito a físico |
| `backend/mobile/src/mobile_api/security.py` | 0 | 0 | 1 | 0 | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 86 | 2 | 0 | 14 | reescrito a físico |
| `backend/mobile/src/mobile_api/start.py` | 1 | 0 | 0 | 7 | reescrito a físico |
| `backend/mobile/src/mobile_api/stops.py` | 0 | 0 | 2 | 0 | reescrito a físico |
| `backend/mobile/src/mobile_api/trips.py` | 0 | 0 | 0 | 4 | reescrito a físico |
| `backend/mobile/template.yaml` | 0 | 0 | 0 | 1 | reescrito a físico |
| `backend/mobile/tests/conftest.py` | 1 | 1 | 0 | 2 | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 26 | 3 | 0 | 23 | reescrito a físico |
| `backend/mobile/tests/test_dev_evidence.py` | 5 | 0 | 0 | 5 | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 208 | 0 | 0 | 6 | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 15 | 0 | 2 | 8 | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 19 | 0 | 0 | 0 | reescrito a físico |
| `backend/oms/pruebas/verif_oms.py` | 6 | 0 | 0 | 3 | reescrito a físico |
| `backend/oms/run_local.py` | 0 | 0 | 0 | 1 | reescrito a físico |
| `backend/oms/src/app.py` | 0 | 0 | 0 | 4 | reescrito a físico |
| `backend/oms/src/cola_candidatos.py` | 2 | 0 | 0 | 1 | reescrito a físico |
| `backend/oms/src/handoff_pedidos.py` | 4 | 0 | 0 | 13 | reescrito a físico |
| `backend/oms/src/models.py` | 0 | 0 | 0 | 17 | reescrito a físico |
| `backend/oms/src/oms_log.py` | 1 | 0 | 0 | 2 | reescrito a físico |
| `backend/oms/src/regla_fecha.py` | 0 | 0 | 0 | 2 | reescrito a físico |
| `backend/oms/src/reglas_config.py` | 1 | 0 | 1 | 1 | reescrito a físico |
| `backend/oms/template.yaml` | 0 | 0 | 0 | 1 | reescrito a físico |
| `backend/planning/src/app.py` | 4 | 0 | 0 | 2 | reescrito a físico |
| `backend/planning/src/bandeja.py` | 5 | 0 | 2 | 0 | reescrito a físico |
| `backend/planning/src/cambio_fecha.py` | 3 | 1 | 0 | 1 | reescrito a físico |
| `backend/planning/src/ingest_items.py` | 4 | 0 | 1 | 2 | reescrito a físico |
| `backend/planning/src/ingest_orders.py` | 4 | 0 | 5 | 12 | reescrito a físico |
| `backend/planning/src/pedido_articulos.py` | 2 | 0 | 1 | 0 | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 7 | 0 | 1 | 4 | reescrito a físico |
| `backend/planning/src/planning_sql.py` | 3 | 0 | 0 | 0 | reescrito a físico |
| `backend/planning/src/plans_read.py` | 6 | 0 | 0 | 4 | reescrito a físico |
| `backend/planning/src/replan.py` | 6 | 0 | 0 | 1 | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 13 | 0 | 0 | 2 | reescrito a físico |
| `backend/planning/template.yaml` | 0 | 0 | 0 | 1 | reescrito a físico |
| `backend/tarifas/src/app.py` | 0 | 0 | 12 | 1 | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 16 | 0 | 4 | 0 | reescrito a físico |
| `backend/tarifas/src/proformas_flow.py` | 0 | 0 | 1 | 1 | reescrito a físico |
| `backend/tarifas/src/schema_manifest.json` | 0 | 0 | 32 | 0 | reescrito a físico |
| `backend/tarifas/src/tarifas_carrier.py` | 2 | 0 | 6 | 0 | reescrito a físico |
| `backend/tarifas/src/tarifas_sql.py` | 0 | 0 | 1 | 13 | reescrito a físico |
| `backend/tests/conftest.py` | 0 | 0 | 7 | 4 | reescrito a físico |
| `backend/tests/test_admin.py` | 19 | 0 | 1 | 0 | reescrito a físico |
| `backend/tests/test_alerts.py` | 0 | 0 | 0 | 1 | reescrito a físico |
| `backend/tests/test_audit.py` | 1 | 1 | 0 | 0 | reescrito a físico |
| `backend/tests/test_auth.py` | 1 | 0 | 0 | 0 | reescrito a físico |
| `backend/tests/test_context.py` | 3 | 0 | 0 | 0 | reescrito a físico |
| `backend/tests/test_data_app.py` | 0 | 0 | 10 | 0 | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 19 | 0 | 0 | 0 | reescrito a físico |
| `backend/tests/test_documents.py` | 2 | 0 | 0 | 7 | reescrito a físico |
| `backend/tests/test_eflow_mock.py` | 0 | 0 | 0 | 6 | reescrito a físico |
| `backend/tests/test_mutations.py` | 3 | 0 | 7 | 0 | reescrito a físico |
| `backend/tests/test_oms.py` | 6 | 0 | 0 | 2 | reescrito a físico |
| `backend/tests/test_permissions.py` | 2 | 0 | 14 | 13 | reescrito a físico |
| `backend/tests/test_planning.py` | 1 | 0 | 0 | 0 | reescrito a físico |
| `backend/tests/test_select_query.py` | 9 | 0 | 17 | 9 | reescrito a físico |
| `backend/tests/test_tarifas.py` | 6 | 0 | 81 | 5 | reescrito a físico |
| `backend/tests/test_tarifas_lecturas.py` | 3 | 0 | 17 | 1 | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 14 | 0 | 20 | 3 | reescrito a físico |
| `backend/tests/test_tracking.py` | 142 | 0 | 3 | 6 | reescrito a físico |
| `backend/tracking/src/app.py` | 3 | 0 | 0 | 20 | reescrito a físico |
| `backend/tracking/src/tracking_logic.py` | 0 | 0 | 2 | 3 | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 85 | 0 | 1 | 3 | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 23 | 0 | 0 | 4 | reescrito a físico |
| `scripts/backfill-wms-fechas.mjs` | 2 | 0 | 0 | 2 | reescrito a físico |
| `scripts/build-demo-seed.ts` | 0 | 0 | 7 | 77 | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 13 | 0 | 0 | 8 | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 7 | 0 | 0 | 10 | reescrito a físico |
| `scripts/create-dev-user.mjs` | 4 | 0 | 0 | 0 | reescrito a físico |
| `scripts/diccionario-datos.py` | 0 | 4 | 18 | 5 | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 15 | 0 | 1 | 8 | reescrito a físico |
| `scripts/lib/plan-viajes.mjs` | 1 | 0 | 0 | 7 | reescrito a físico |
| `scripts/limpiar-tracking-prueba.mjs` | 2 | 0 | 9 | 4 | reescrito a físico |
| `scripts/mark-flota-propia.mjs` | 1 | 0 | 0 | 1 | reescrito a físico |
| `scripts/mirror-github.mjs` | 0 | 0 | 1 | 4 | reescrito a físico |
| `scripts/preview-viaje-trigger.mjs` | 3 | 0 | 0 | 5 | reescrito a físico |
| `scripts/prueba_flujo_oms.py` | 4 | 0 | 0 | 4 | reescrito a físico |
| `scripts/run-migration.mjs` | 0 | 1 | 0 | 0 | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 7 | 0 | 2 | 1 | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 7 | 0 | 0 | 2 | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 14 | 0 | 0 | 22 | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 19 | 0 | 0 | 13 | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 15 | 0 | 6 | 3 | reescrito a físico |
| `scripts/seed-tarifas-base-change.mjs` | 4 | 0 | 1 | 2 | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 14 | 0 | 8 | 10 | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 43 | 0 | 1 | 9 | reescrito a físico |
| `scripts/seed-wms-expediciones.mjs` | 6 | 0 | 0 | 5 | reescrito a físico |
| `server/domain/context/authorizeOperationalContext.mjs` | 3 | 0 | 0 | 1 | reescrito a físico |
| `server/domain/context/resolveOperationalContext.mjs` | 2 | 0 | 0 | 1 | reescrito a físico |
| `server/queries.mjs` | 0 | 0 | 0 | 1 | reescrito a físico |
| `server/tms-auth.mjs` | 3 | 0 | 0 | 0 | reescrito a físico |
| `server/tms-context-routes.mjs` | 7 | 0 | 0 | 1 | reescrito a físico |
| `server/tms-relations.mjs` | 0 | 0 | 196 | 8 | reescrito a físico |
| `server/tms-select.mjs` | 0 | 0 | 1 | 1 | reescrito a físico |
| `src/__tests__/db-connectivity.test.ts` | 0 | 0 | 102 | 0 | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 17 | 0 | 5 | 6 | reescrito a físico |
| `src/components/feature/ContextSelector.tsx` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/components/feature/ViewAsToggle.test.tsx` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/components/tarifas/CalcBreakdownPanel.test.tsx` | 0 | 0 | 0 | 5 | reescrito a físico |
| `src/components/tarifas/CostStructureParts.tsx` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/components/tarifas/cost/groupLabels.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/hooks/useActiveCountry.ts` | 0 | 0 | 1 | 7 | sin cambio (comentario del frontend) |
| `src/hooks/useAuth.tsx` | 0 | 0 | 1 | 2 | sin cambio (comentario del frontend) |
| `src/hooks/useOperationalContext.tsx` | 0 | 0 | 0 | 18 | sin cambio (comentario del frontend) |
| `src/hooks/usePermissions.tsx` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/carriers.ts` | 0 | 0 | 0 | 30 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/countries.ts` | 0 | 0 | 0 | 23 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/customers.ts` | 0 | 0 | 0 | 18 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/deliveryPoints.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/drivers.ts` | 0 | 0 | 0 | 27 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/licenses.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/omsBandeja.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/omsPanel.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/omsQueue.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/omsRoutes.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/omsSimulator.ts` | 0 | 0 | 1 | 1 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/orders.ts` | 0 | 0 | 0 | 23 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/planning.ts` | 0 | 0 | 2 | 6 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/tracking.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/vehicles.ts` | 0 | 0 | 0 | 32 | sin cambio (comentario del frontend) |
| `src/i18n/local/en/zones.ts` | 0 | 0 | 0 | 39 | sin cambio (comentario del frontend) |
| `src/i18n/local/es/carriers.ts` | 0 | 0 | 0 | 28 | sin cambio (comentario del frontend) |
| `src/i18n/local/es/countries.ts` | 0 | 0 | 0 | 20 | sin cambio (comentario del frontend) |
| `src/i18n/local/es/customers.ts` | 0 | 0 | 0 | 17 | sin cambio (comentario del frontend) |
| `src/i18n/local/es/drivers.ts` | 0 | 0 | 0 | 24 | sin cambio (comentario del frontend) |
| `src/i18n/local/es/orders.ts` | 0 | 0 | 0 | 22 | sin cambio (comentario del frontend) |
| `src/i18n/local/es/vehicles.ts` | 0 | 0 | 0 | 30 | sin cambio (comentario del frontend) |
| `src/i18n/local/es/zones.ts` | 0 | 0 | 0 | 35 | sin cambio (comentario del frontend) |
| `src/lib/mock-auth.ts` | 0 | 0 | 1 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/__tests__/allocation.test.ts` | 0 | 0 | 0 | 3 | reescrito a físico |
| `src/lib/tarifas/__tests__/aurora.cr-load.test.ts` | 1 | 0 | 1 | 4 | reescrito a físico |
| `src/lib/tarifas/__tests__/aurora.e2e.test.ts` | 2 | 0 | 2 | 3 | reescrito a físico |
| `src/lib/tarifas/__tests__/baseMethods.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/__tests__/costStructure.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/costStructureCR.test.ts` | 0 | 0 | 1 | 5 | reescrito a físico |
| `src/lib/tarifas/__tests__/costTemplate.test.ts` | 0 | 0 | 3 | 0 | reescrito a físico |
| `src/lib/tarifas/__tests__/demoSeed.http.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/__tests__/evaluator.test.ts` | 0 | 0 | 0 | 17 | reescrito a físico |
| `src/lib/tarifas/__tests__/explain.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/f1Dinero.test.ts` | 0 | 0 | 0 | 4 | reescrito a físico |
| `src/lib/tarifas/__tests__/f2Resolver.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/fases.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/fixtures.ts` | 0 | 0 | 0 | 5 | reescrito a físico |
| `src/lib/tarifas/__tests__/fixtures/costaRicaFleet.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/__tests__/fixtures/seed.json` | 0 | 0 | 6 | 0 | reescrito a físico |
| `src/lib/tarifas/__tests__/liquidacionDePuntaAPunta.test.ts` | 0 | 0 | 1 | 3 | reescrito a físico |
| `src/lib/tarifas/__tests__/margin.test.ts` | 0 | 0 | 0 | 8 | reescrito a físico |
| `src/lib/tarifas/__tests__/missingLogic.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/parties.test.ts` | 0 | 0 | 0 | 3 | reescrito a físico |
| `src/lib/tarifas/__tests__/partiesDataSource.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/__tests__/partyVariablesValidation.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/__tests__/rateImport.ejemplos.test.ts` | 0 | 0 | 0 | 8 | reescrito a físico |
| `src/lib/tarifas/__tests__/rateImport.test.ts` | 0 | 0 | 0 | 17 | reescrito a físico |
| `src/lib/tarifas/__tests__/rateTable.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/rateTableBuilder.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/rateTableValueColumns.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/reglaIlegible.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/reglas-ejemplo.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/resolver.test.ts` | 0 | 0 | 0 | 13 | reescrito a físico |
| `src/lib/tarifas/__tests__/rule-builder.test.ts` | 0 | 0 | 0 | 4 | reescrito a físico |
| `src/lib/tarifas/__tests__/scope.test.ts` | 0 | 0 | 0 | 3 | reescrito a físico |
| `src/lib/tarifas/__tests__/settlementTotals.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/settlementsDataSource.test.ts` | 0 | 0 | 0 | 5 | reescrito a físico |
| `src/lib/tarifas/__tests__/simulaciones.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/tiers.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/trazabilidad.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/__tests__/tripOrders.test.ts` | 0 | 0 | 0 | 5 | reescrito a físico |
| `src/lib/tarifas/__tests__/tripSettlement.base.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/__tests__/vigencia.test.ts` | 0 | 0 | 0 | 3 | reescrito a físico |
| `src/lib/tarifas/allocation.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/baseOverride.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/carrierBase.ts` | 0 | 0 | 2 | 4 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/catalog-loader/fetch.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/catalog-loader/types.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/catalog-loader/zones.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/cost-template/fixed-parsing.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/cost-template/sheets.ts` | 0 | 0 | 4 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/cost/structure.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/__tests__/http-resilience.test.ts` | 0 | 0 | 2 | 0 | reescrito a físico |
| `src/lib/tarifas/data/__tests__/schema.test.ts` | 4 | 0 | 0 | 2 | sin cambio (DDL histórico de schema.ts) |
| `src/lib/tarifas/data/ddl.ts` | 0 | 0 | 0 | 9 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/memory/fakeBackend.test.ts` | 0 | 0 | 0 | 3 | reescrito a físico |
| `src/lib/tarifas/data/memory/fakeBackend/permissions.ts` | 0 | 0 | 3 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/memory/fakeBackend/schema.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/memory/memoryDataSource.test.ts` | 0 | 0 | 0 | 5 | reescrito a físico |
| `src/lib/tarifas/data/memory/mockIds.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/memory/seed.demo.json` | 0 | 0 | 78 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/memory/store.ts` | 0 | 0 | 7 | 6 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/schema.ts` | 7 | 0 | 56 | 8 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/format.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/index.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/localRules/carriers.ts` | 0 | 0 | 1 | 3 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/localRules/countries.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/localRules/testing.ts` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/localRules/zones.ts` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/missingLogic.ts` | 0 | 0 | 2 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/parties.ts` | 0 | 0 | 1 | 3 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/partiesDataSource.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/proformas/__tests__/autoAssign.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/proformas/__tests__/emailTemplate.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/proformas/__tests__/irregularity.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/proformas/__tests__/irregularityTestApi.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/lib/tarifas/proformas/__tests__/proformaData.test.ts` | 0 | 0 | 0 | 8 | reescrito a físico |
| `src/lib/tarifas/proformas/autoAssign.ts` | 0 | 0 | 0 | 9 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/proformas/createProforma.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/proformas/emailActions.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/proformas/groupByCarrier.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/proformas/irregularity.ts` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/proformas/loadIrregularities.ts` | 0 | 0 | 0 | 5 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/proformas/proformaQueries.ts` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/rateImport.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/resolver/context.ts` | 0 | 0 | 1 | 5 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/resolver/evaluation.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/returnsNote.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/settlementInput.ts` | 0 | 0 | 1 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/settlements/buildRowValues.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/settlements/mapToDomain.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/settlements/numberingAndIds.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/settlements/queryHelpers.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/settlementsDataSource.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/textosEtiquetas.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/lib/tarifas/tripContext.ts` | 0 | 0 | 1 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/tripOrders.ts` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/tripSettlement.ts` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/trips/queryHelpers.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/trips/returnHandling.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/tripsDataSource.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/cargo.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/cost.ts` | 0 | 0 | 1 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/geography.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/io.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/settlement-input.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/settlement.ts` | 0 | 0 | 2 | 6 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/trace.ts` | 0 | 0 | 1 | 3 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/types/trip.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/lib/tarifas/vehiclesDataSource.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/clientes/components/CustomerModal.tsx` | 0 | 0 | 2 | 2 | sin cambio (comentario del frontend) |
| `src/pages/clientes/page.tsx` | 0 | 0 | 3 | 29 | sin cambio (comentario del frontend) |
| `src/pages/companias/CompaniasView.tsx` | 0 | 0 | 0 | 5 | sin cambio (comentario del frontend) |
| `src/pages/companias/components/CompaniasTable.test.tsx` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/pages/companias/components/CompaniasTable.tsx` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/companias/components/RateTablesModal.tsx` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/conductores/components/DriverModal.tsx` | 0 | 0 | 6 | 1 | sin cambio (comentario del frontend) |
| `src/pages/conductores/page.tsx` | 0 | 0 | 5 | 35 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/admin/admin-api.ts` | 0 | 0 | 0 | 5 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/admin/use-admin-roles.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/admin/use-role-permissions.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/admin/use-scope-options.ts` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/components/CountriesPicker.tsx` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/components/PermissionsModal.tsx` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/components/RolesTab.tsx` | 0 | 0 | 1 | 6 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/components/ScopeEditor.tsx` | 0 | 0 | 0 | 8 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/components/UserModal.tsx` | 0 | 0 | 1 | 9 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/components/UsersTab.tsx` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/configuracion/page.tsx` | 0 | 0 | 5 | 0 | sin cambio (comentario del frontend) |
| `src/pages/contratos/components/ContractModal.tsx` | 0 | 0 | 2 | 0 | sin cambio (comentario del frontend) |
| `src/pages/contratos/components/DocumentsList.tsx` | 0 | 0 | 3 | 0 | sin cambio (comentario del frontend) |
| `src/pages/contratos/page.tsx` | 0 | 0 | 1 | 6 | sin cambio (comentario del frontend) |
| `src/pages/dashboard/page.tsx` | 0 | 0 | 5 | 3 | sin cambio (comentario del frontend) |
| `src/pages/devoluciones/components/ReturnModal.tsx` | 0 | 0 | 2 | 3 | sin cambio (comentario del frontend) |
| `src/pages/devoluciones/page.tsx` | 0 | 0 | 2 | 4 | sin cambio (comentario del frontend) |
| `src/pages/guias/guia-model.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/licencias/components/LicenciaModal.tsx` | 0 | 0 | 4 | 0 | sin cambio (comentario del frontend) |
| `src/pages/licencias/page.tsx` | 0 | 0 | 3 | 1 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/__tests__/useEmitTrip.test.ts` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/pages/liquidaciones/api/liquidacionesApi.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/components/CalculationContent.tsx` | 0 | 0 | 0 | 9 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/components/LiquidarViajeBody.tsx` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/components/TripOrdersPanel.tsx` | 0 | 0 | 1 | 6 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/exportTripsWithOrders.ts` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/computeKPIs.ts` | 1 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/useEmissionState.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/useLiquidacionesController.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/useLiquidadorVista.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/useLiquidarViajeController.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/useOrderMarking.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/useSettlementsLoader.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/useTripReturnsPreload.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/page.tsx` | 0 | 0 | 0 | 7 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/parts/PedidosEmitidos.tsx` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/parts/ProformaImprimible.tsx` | 0 | 0 | 0 | 7 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/parts/ReturnsSection.tsx` | 0 | 0 | 0 | 14 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/parts/VerMasSection.tsx` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/parts/emission.ts` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/parts/settlementColumns.tsx` | 0 | 0 | 1 | 2 | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/parts/tripColumns.tsx` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/oms/api/omsApi.ts` | 0 | 0 | 5 | 25 | sin cambio (comentario del frontend) |
| `src/pages/oms/auditoria/logLabels.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/oms/auditoria/page.tsx` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/oms/bandeja/bandeja-api.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/oms/bandeja/page.tsx` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/oms/bandeja/useBandejaController.ts` | 0 | 0 | 0 | 11 | sin cambio (comentario del frontend) |
| `src/pages/oms/cola/page.tsx` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/oms/cola/useColaController.ts` | 0 | 0 | 1 | 16 | sin cambio (comentario del frontend) |
| `src/pages/oms/fecha.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/oms/mockData.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/oms/panel/page.tsx` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/pages/oms/panel/usePanelController.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/oms/simulador/simulate.check.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/oms/simulador/simulate.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/oms/types.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/paises/page.tsx` | 0 | 0 | 8 | 27 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/capacity-fit.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/eflow-api.test.ts` | 0 | 0 | 0 | 3 | reescrito a físico |
| `src/pages/planificacion/eflow-mappers.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/fallback-catalogos.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/fallback-pedidos.ts` | 0 | 0 | 1 | 3 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/fallback-rutas.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/fleet-split.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/plan-pedidos-api.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/planes-types.ts` | 0 | 0 | 0 | 5 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/route-geometry.test.ts` | 0 | 0 | 0 | 2 | reescrito a físico |
| `src/pages/planificacion/types.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/planificacion/use-zonas-nombre.ts` | 0 | 0 | 1 | 3 | sin cambio (comentario del frontend) |
| `src/pages/proformas/components/ProformaDocumento.tsx` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/proformas/config/FlowPhasesEditor.tsx` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/proformas/config/useFlowEditor.ts` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/api/tarifariosApi.audit.test.ts` | 0 | 0 | 3 | 0 | reescrito a físico |
| `src/pages/reglas-tarifa/api/tarifariosApi.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/api/tarifariosWrites.ts` | 0 | 0 | 5 | 0 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/RuleTester.tsx` | 0 | 0 | 0 | 7 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/TarifariosTab.test.tsx` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/pages/reglas-tarifa/components/TarifariosTab.tsx` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-modal/RuleFormSections.tsx` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-modal/RuleIdentificationSection.tsx` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-modal/ruleSubmit.contract.test.ts` | 0 | 0 | 1 | 0 | reescrito a físico |
| `src/pages/reglas-tarifa/components/rule-modal/ruleSubmit.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-tester/FreeTripPanel.tsx` | 0 | 0 | 0 | 6 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-tester/TesterLeftCard.tsx` | 0 | 0 | 0 | 5 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-tester/scenarioTrip.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-tester/useTesterBase.ts` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-tester/useTesterCatalog.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-tester/useTesterDefaults.ts` | 0 | 0 | 0 | 7 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/rule-tester/useTesterScenario.ts` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/tarifarios/RateRowForm.tsx` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/components/tarifarios/RateRowsCard.tsx` | 0 | 0 | 0 | 4 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/hooks/useReglasTarifaController.ts` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/hooks/useZones.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/page.tsx` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/reglas-tarifa/types.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/reportes/components/DriversRanking.tsx` | 0 | 0 | 0 | 5 | sin cambio (comentario del frontend) |
| `src/pages/reportes/page.tsx` | 0 | 0 | 4 | 19 | sin cambio (comentario del frontend) |
| `src/pages/seed/page.tsx` | 0 | 0 | 6 | 0 | sin cambio (comentario del frontend) |
| `src/pages/tiendas/components/DeliveryPointModal.tsx` | 0 | 0 | 2 | 2 | sin cambio (comentario del frontend) |
| `src/pages/tiendas/page.tsx` | 0 | 0 | 2 | 10 | sin cambio (comentario del frontend) |
| `src/pages/tracking/__tests__/components.test.tsx` | 0 | 0 | 0 | 1 | reescrito a físico |
| `src/pages/tracking/components/AlertDots.tsx` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/tracking/hooks/useTrackingCountry.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/pages/tracking/mock/sim.ts` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/pages/tracking/page.tsx` | 0 | 0 | 0 | 3 | sin cambio (comentario del frontend) |
| `src/pages/tracking/tracking-logic.ts` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/transportistas/components/CarrierModal.tsx` | 0 | 0 | 6 | 1 | sin cambio (comentario del frontend) |
| `src/pages/transportistas/page.tsx` | 0 | 0 | 6 | 38 | sin cambio (comentario del frontend) |
| `src/pages/vehiculos/components/VehicleModal.tsx` | 0 | 0 | 3 | 1 | sin cambio (comentario del frontend) |
| `src/pages/vehiculos/components/VehicleTypeDeleteModal.tsx` | 0 | 0 | 1 | 0 | sin cambio (comentario del frontend) |
| `src/pages/vehiculos/components/VehicleTypeModal.tsx` | 0 | 0 | 2 | 0 | sin cambio (comentario del frontend) |
| `src/pages/vehiculos/page.tsx` | 0 | 0 | 5 | 41 | sin cambio (comentario del frontend) |
| `src/pages/zonas/components/ZonaModal.tsx` | 0 | 0 | 4 | 19 | sin cambio (comentario del frontend) |
| `src/pages/zonas/components/ZoneMap.tsx` | 0 | 0 | 0 | 1 | sin cambio (comentario del frontend) |
| `src/pages/zonas/page.tsx` | 0 | 0 | 5 | 32 | sin cambio (comentario del frontend) |
| `src/router/config.test.tsx` | 0 | 0 | 0 | 4 | reescrito a físico |
| `src/router/config.tsx` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |
| `src/router/index.ts` | 0 | 0 | 0 | 2 | sin cambio (comentario del frontend) |

### Detalle (uso en SQL)

| Archivo | Línea | Objeto | Nuevo | Tipo de objeto | Uso | Acción |
|---|---|---|---|---|---|---|
| `backend/admin/src/admin_access.py` | 12 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_access.py` | 12 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_audit.py` | 22 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/admin/src/admin_audit.py` | 23 | `app_modules` | `tbl_app_modules` | table | sql | reescrito a físico |
| `backend/admin/src/admin_audit.py` | 83 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 12 | `app_modules` | `tbl_app_modules` | table | sql | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 13 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 14 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 15 | `role_permissions` | `tbl_role_permissions` | table | sql | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 16 | `role_permissions` | `tbl_role_permissions` | table | sql | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 17 | `role_countries` | `tbl_role_countries` | table | sql | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 18 | `role_countries` | `tbl_role_countries` | table | sql | reescrito a físico |
| `backend/admin/src/admin_permissions.py` | 19 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 15 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 16 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 17 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 18 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 20 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 21 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 22 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 27 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 28 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 29 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 30 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 31 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 32 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 34 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 36 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 40 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 43 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 44 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 45 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 46 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 47 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 50 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 51 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 53 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 54 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 55 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 57 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 58 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/admin/src/admin_sql.py` | 60 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/admin/src/admin_users.py` | 120 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/admin/src/audit_maintenance.py` | 2 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/admin/src/audit_maintenance.py` | 21 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/admin/template.yaml` | 63 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/alerts/src/expirations.py` | 20 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/alerts/src/expirations.py` | 24 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/alerts/src/expirations.py` | 24 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/alerts/src/expirations.py` | 28 | `driver_licenses` | `tbl_driver_licenses` | table | sql | reescrito a físico |
| `backend/alerts/src/expirations.py` | 29 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/alerts/src/expirations.py` | 30 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/auth/src/app.py` | 22 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/auth/src/app.py` | 22 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/auth/src/app.py` | 60 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/auth/src/app.py` | 66 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/audit.py` | 1 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/audit.py` | 21 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/audit.py` | 25 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/audit.py` | 26 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/permissions.py` | 20 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/permissions.py` | 20 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/permissions.py` | 23 | `app_modules` | `tbl_app_modules` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/permissions.py` | 24 | `role_permissions` | `tbl_role_permissions` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/permissions.py` | 25 | `role_countries` | `tbl_role_countries` | table | sql | reescrito a físico |
| `backend/common-services/layers/tms_common/tms_common/pg.py` | 19 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/context/src/app.py` | 16 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/context_queries.py` | 5 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/context/src/context_queries.py` | 10 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/context/src/context_queries.py` | 15 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/context/src/context_queries.py` | 20 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/context/src/context_queries.py` | 23 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/context/src/context_queries.py` | 29 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/context_queries.py` | 30 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points.py` | 125 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 8 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 9 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 10 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 14 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 15 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 17 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 19 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 22 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 28 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 31 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 36 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 42 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/context/src/delivery_points_sql.py` | 43 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/context/src/scopes.py` | 35 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/context/src/scopes.py` | 39 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/context/src/scopes.py` | 60 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/context/src/scopes.py` | 60 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/context/src/scopes.py` | 68 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/documents/src/app.py` | 29 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/documents/src/app.py` | 30 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/local/activar_rol_tms_app.py` | 8 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/local/activar_rol_tms_app.py` | 97 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/local/activar_rol_tms_app.py` | 98 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/local/activar_rol_tms_app.py` | 100 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/local/activar_rol_tms_app.py` | 101 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/local/create_admin.py` | 31 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/local/create_admin.py` | 32 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/local/create_admin.py` | 33 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points.py` | 95 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 12 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 12 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 25 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 33 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 34 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 38 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 51 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 57 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 68 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 70 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 71 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 73 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 79 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 84 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/local/ingest_delivery_points_sql.py` | 92 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/mobile/scripts/set_demo_password.py` | 43 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/scripts/set_demo_password.py` | 43 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/scripts/set_demo_password.py` | 44 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/mobile/scripts/set_demo_password.py` | 51 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/scripts/set_demo_password.py` | 53 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/scripts/set_demo_password.py` | 54 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 25 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 26 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 27 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 33 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 33 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 34 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 40 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 47 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/scripts/ver_presencia.py` | 48 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/sql/m01_mobile_base.sql` | 21 | `drivers` | `tbl_drivers` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 21 | `app_users` | `tbl_app_users` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 22 | `ux_drivers_app_user` | `uidx_drivers_app_user` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 24 | `tracking_events` | `tbl_tracking_events` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 27 | `tracking_consents` | `tbl_tracking_consents` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 29 | `organizations` | `tbl_organizations` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 30 | `app_users` | `tbl_app_users` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 36 | `ix_tracking_consents_org` | `idx_tracking_consents_org` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 38 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 40 | `app_users` | `tbl_app_users` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m01_mobile_base.sql` | 47 | `ix_mobile_refresh_user` | `idx_mobile_refresh_tokens_mobile_refresh_user` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m02_mobile_indices.sql` | 4 | `ix_routes_driver_org` | `idx_routes_driver_org` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m02_mobile_indices.sql` | 8 | `ix_mobile_refresh_expires` | `idx_mobile_refresh_tokens_mobile_refresh_expires` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m02_mobile_indices.sql` | 15 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m02_mobile_indices.sql` | 21 | `ix_routes_driver_org` | `idx_routes_driver_org` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m02_mobile_indices.sql` | 33 | `ix_mobile_refresh_expires` | `idx_mobile_refresh_tokens_mobile_refresh_expires` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m03_driver_presence.sql` | 16 | `driver_presence` | `tbl_driver_presence` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m03_driver_presence.sql` | 17 | `drivers` | `tbl_drivers` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m03_driver_presence.sql` | 18 | `organizations` | `tbl_organizations` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m03_driver_presence.sql` | 26 | `ix_driver_presence_org` | `idx_driver_presence_org` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m03_driver_presence.sql` | 28 | `tracking_events` | `tbl_tracking_events` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m03_driver_presence.sql` | 29 | `ux_tracking_events_client` | `uidx_tracking_events_client` | index | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m04_photo_product.sql` | 6 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m04_photo_product.sql` | 7 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m04_photo_product.sql` | 11 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m04_photo_product.sql` | 12 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m04_photo_product.sql` | 13 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m05_stop_type.sql` | 9 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m05_stop_type.sql` | 12 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/sql/m05_stop_type.sql` | 16 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | sin cambio (eFlow / migración) |
| `backend/mobile/src/mobile_api/audit.py` | 1 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/src/mobile_api/audit.py` | 14 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/src/mobile_api/audit.py` | 18 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/audit.py` | 19 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/positions.py` | 60 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 10 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 17 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 18 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 19 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 25 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 31 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 36 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 41 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 42 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 43 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 46 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 47 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 54 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 65 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 76 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 78 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 78 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 93 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 94 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 95 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 96 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 97 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 98 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 99 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 100 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 101 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 115 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 118 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 119 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 120 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 121 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 122 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 129 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 130 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 131 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 132 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 133 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 136 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 146 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 147 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 148 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 158 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 158 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 159 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 160 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 161 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 162 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 166 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 175 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 190 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 193 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 196 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 197 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 198 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 199 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 204 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 213 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 216 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 221 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 227 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 232 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 233 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 236 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 237 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 246 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 247 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 248 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 249 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 250 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 251 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 254 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 258 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 259 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 262 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 267 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 270 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 273 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 273 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 277 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 285 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 291 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 298 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 306 | `returns` | `tbl_returns` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 314 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 321 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 322 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 327 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/sql.py` | 332 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/mobile/src/mobile_api/start.py` | 87 | `ux_routes_plan_trip` | `uidx_routes_plan_trip` | index | sql | reescrito a físico |
| `backend/mobile/tests/conftest.py` | 72 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/tests/conftest.py` | 73 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 23 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 44 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 54 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 55 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 60 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 63 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 64 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 78 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 101 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 104 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 131 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 143 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 147 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 148 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 152 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 155 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 157 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 162 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 165 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 166 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 171 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 177 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 178 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 180 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 184 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 186 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 187 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 206 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_auth.py` | 220 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_dev_evidence.py` | 46 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_dev_evidence.py` | 46 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_dev_evidence.py` | 70 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_dev_evidence.py` | 74 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_dev_evidence.py` | 81 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 59 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 59 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 60 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 60 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 61 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 63 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 63 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 86 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 86 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 87 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 87 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 94 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 94 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 95 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 95 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 99 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 100 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 109 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 123 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 123 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 125 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 125 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 126 | `returns` | `tbl_returns` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 126 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 131 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 131 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 133 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 133 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 139 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 139 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 142 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 142 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 143 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 149 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 149 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 150 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 157 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 161 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 161 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 177 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 177 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 178 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 180 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 185 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 186 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 186 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 188 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 188 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 190 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 194 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 194 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 195 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 197 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 199 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 200 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 200 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 204 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 204 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 205 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 208 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 212 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 212 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 214 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 217 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 218 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 218 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 226 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 226 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 227 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 248 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 248 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 249 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 253 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 253 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 254 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 258 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 259 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 260 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 265 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 265 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 266 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 269 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 273 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 273 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 278 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 278 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 286 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 286 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 289 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 291 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 291 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 292 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 300 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 308 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 316 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 319 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 326 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 329 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 334 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 334 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 335 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 338 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 345 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 351 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 351 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 356 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 361 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 361 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 367 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 367 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 369 | `returns` | `tbl_returns` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 376 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 376 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 377 | `returns` | `tbl_returns` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 380 | `returns` | `tbl_returns` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 382 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 383 | `returns` | `tbl_returns` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 386 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 394 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 397 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 398 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 399 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 430 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 430 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 445 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 445 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 460 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 460 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 461 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 466 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 467 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 469 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 473 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 479 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 479 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 492 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 498 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 498 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 499 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 547 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 547 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 554 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 557 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 557 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 584 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 584 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 585 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 585 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 593 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 593 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 594 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 594 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 602 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 602 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 603 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 603 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 611 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 611 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 612 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 613 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 616 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 618 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 619 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 623 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 623 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 624 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 625 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 633 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 637 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 637 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 638 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 644 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 644 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 655 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 655 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 656 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 657 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 660 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 661 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 665 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 665 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 668 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 672 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 672 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 681 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 681 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 682 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 682 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 690 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 690 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 695 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 696 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 696 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 698 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 703 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 703 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 709 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 709 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 710 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 718 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 718 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 721 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 721 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 727 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 727 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 728 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 735 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_driver_api.py` | 736 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 92 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 103 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 109 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 119 | `mobile_refresh_tokens` | `tbl_mobile_refresh_tokens` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 134 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 134 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 138 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 168 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 168 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 175 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 178 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 179 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 187 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 198 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_presence.py` | 202 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 26 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 27 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 27 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 29 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 30 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 31 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 39 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 40 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 42 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 49 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 57 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 57 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 66 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 75 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 80 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 82 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 87 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 90 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/mobile/tests/test_start_trip.py` | 102 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/oms/pruebas/verif_oms.py` | 71 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/pruebas/verif_oms.py` | 76 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/pruebas/verif_oms.py` | 84 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/pruebas/verif_oms.py` | 91 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/pruebas/verif_oms.py` | 99 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/pruebas/verif_oms.py` | 107 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/src/cola_candidatos.py` | 55 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/src/cola_candidatos.py` | 56 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/oms/src/handoff_pedidos.py` | 69 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/src/handoff_pedidos.py` | 81 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/src/handoff_pedidos.py` | 166 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/src/handoff_pedidos.py` | 173 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/oms/src/oms_log.py` | 26 | `oms_logs` | `tbl_oms_logs` | table | sql | reescrito a físico |
| `backend/oms/src/reglas_config.py` | 41 | `oms_rule_configs` | `tbl_oms_rule_configs` | table | sql | reescrito a físico |
| `backend/planning/src/app.py` | 50 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/planning/src/app.py` | 117 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/planning/src/app.py` | 128 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/app.py` | 149 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/planning/src/bandeja.py` | 18 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/bandeja.py` | 19 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/planning/src/bandeja.py` | 32 | `returns` | `tbl_returns` | table | sql | reescrito a físico |
| `backend/planning/src/bandeja.py` | 33 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/bandeja.py` | 34 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/planning/src/cambio_fecha.py` | 5 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/planning/src/cambio_fecha.py` | 21 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/cambio_fecha.py` | 21 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/planning/src/cambio_fecha.py` | 25 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_items.py` | 21 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_items.py` | 24 | `order_items` | `tbl_order_items` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_items.py` | 33 | `order_items` | `tbl_order_items` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_items.py` | 41 | `order_items` | `tbl_order_items` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_orders.py` | 57 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_orders.py` | 61 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_orders.py` | 66 | `branches` | `tbl_branches` | table | sql | reescrito a físico |
| `backend/planning/src/ingest_orders.py` | 73 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/pedido_articulos.py` | 13 | `order_items` | `tbl_order_items` | table | sql | reescrito a físico |
| `backend/planning/src/pedido_articulos.py` | 13 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 62 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 63 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 73 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 112 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 119 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 125 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/planning/src/plan_builder.py` | 176 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/planning/src/planning_sql.py` | 16 | `wms_expediciones` | `tbl_wms_expediciones` | table | sql | reescrito a físico |
| `backend/planning/src/planning_sql.py` | 19 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/planning/src/planning_sql.py` | 19 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/planning/src/plans_read.py` | 15 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/planning/src/plans_read.py` | 25 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/planning/src/plans_read.py` | 26 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/planning/src/plans_read.py` | 35 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/planning/src/plans_read.py` | 36 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/plans_read.py` | 110 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/planning/src/replan.py` | 24 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/replan.py` | 32 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/planning/src/replan.py` | 32 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/planning/src/replan.py` | 70 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/planning/src/replan.py` | 72 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/replan.py` | 72 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 10 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 15 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 15 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 21 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 28 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 28 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 30 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 31 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 32 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 33 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 36 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 44 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/planning/src/viajes_liberados.py` | 44 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 48 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 53 | `tarifas_proforma_phases` | `tbl_tarifas_proforma_phases` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 61 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 73 | `tarifas_proforma_phases` | `tbl_tarifas_proforma_phases` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 76 | `tarifas_proforma_phases` | `tbl_tarifas_proforma_phases` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 83 | `tarifas_audit_log` | `tbl_tarifas_audit_log` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 112 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 117 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 118 | `tarifas_proforma_items` | `tbl_tarifas_proforma_items` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 122 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 123 | `tarifas_proforma_items` | `tbl_tarifas_proforma_items` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 129 | `tarifas_proforma_items` | `tbl_tarifas_proforma_items` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 132 | `tarifas_proforma_items` | `tbl_tarifas_proforma_items` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 148 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 153 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tarifas/src/proformas_api.py` | 160 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tarifas/src/tarifas_carrier.py` | 11 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `backend/tarifas/src/tarifas_carrier.py` | 19 | `tarifas_proforma_items` | `tbl_tarifas_proforma_items` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 29 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 29 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 31 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 33 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 35 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 37 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 39 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 41 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 43 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 79 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 81 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 82 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 113 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 114 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 127 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 134 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 181 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 187 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_admin.py` | 196 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_audit.py` | 55 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `backend/tests/test_audit.py` | 106 | `app_modules` | `tbl_app_modules` | table | sql | reescrito a físico |
| `backend/tests/test_auth.py` | 46 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `backend/tests/test_context.py` | 21 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_context.py` | 23 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/tests/test_context.py` | 25 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 21 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 23 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 26 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 26 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 28 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 30 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 34 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 64 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 65 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 67 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 99 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 100 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 108 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 116 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 124 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 134 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 142 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 149 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `backend/tests/test_delivery_points.py` | 150 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `backend/tests/test_documents.py` | 76 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/tests/test_documents.py` | 104 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/tests/test_mutations.py` | 14 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_mutations.py` | 20 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_mutations.py` | 26 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_oms.py` | 217 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_oms.py` | 240 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_oms.py` | 256 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_oms.py` | 309 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_oms.py` | 324 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_oms.py` | 325 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_permissions.py` | 133 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `backend/tests/test_permissions.py` | 137 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tests/test_planning.py` | 15 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 18 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 27 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 44 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 48 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 87 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 88 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 98 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 99 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/tests/test_select_query.py` | 100 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas.py` | 92 | `tarifas_v_viajes` | `vw_tarifas_viajes` | view | sql | reescrito a físico |
| `backend/tests/test_tarifas.py` | 148 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas.py` | 212 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas.py` | 303 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas.py` | 403 | `tarifas_rate_table_rows` | `tbl_tarifas_rate_table_rows` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas.py` | 556 | `tarifas_rate_table_rows` | `tbl_tarifas_rate_table_rows` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_lecturas.py` | 60 | `tarifas_pricing_rules` | `tbl_tarifas_pricing_rules` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_lecturas.py` | 60 | `tarifas_zone_groups` | `tbl_tarifas_zone_groups` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_lecturas.py` | 110 | `tarifas_v_viajes` | `vw_tarifas_viajes` | view | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 30 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 32 | `tarifas_proforma_phases` | `tbl_tarifas_proforma_phases` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 34 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 69 | `tarifas_proforma_phases` | `tbl_tarifas_proforma_phases` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 69 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 77 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 79 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 129 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 246 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 272 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 280 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 282 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 295 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `backend/tests/test_tarifas_proformas.py` | 354 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 150 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 199 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 200 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 202 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 203 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 207 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 209 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 214 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 215 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 218 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 225 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 227 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 254 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 254 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 262 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 262 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 263 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 268 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 269 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 270 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 276 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 276 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 277 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 280 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 287 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 290 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 300 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 314 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 314 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 340 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 340 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 354 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 354 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 355 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 359 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 365 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 365 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 371 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 427 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 428 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 430 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 431 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 433 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 435 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 443 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 444 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 445 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 446 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 448 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 449 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 475 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 489 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 489 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 501 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 501 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 508 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 517 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 517 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 524 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 524 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 525 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 528 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 537 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 537 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 538 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 546 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 555 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 562 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 562 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 570 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 573 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 574 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 575 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 614 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 617 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 617 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 634 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 635 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 638 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 647 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 656 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 659 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 666 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 668 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 669 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 678 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 693 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 712 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 724 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 734 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 734 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 736 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 758 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 758 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 759 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 776 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 776 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 777 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 793 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 793 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 794 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 804 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 823 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 839 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 871 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 880 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 887 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 890 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 899 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 909 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 912 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 922 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 925 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 927 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 936 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 938 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 947 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 949 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 960 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 973 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 984 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1006 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1006 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1010 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1010 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1016 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1016 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1017 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1020 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1020 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1041 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1089 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1124 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1136 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1145 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1152 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1154 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1155 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1160 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1180 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1202 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tests/test_tracking.py` | 1202 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tracking/src/app.py` | 531 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tracking/src/app.py` | 596 | `ux_routes_plan_trip` | `uidx_routes_plan_trip` | index | sql | reescrito a físico |
| `backend/tracking/src/app.py` | 634 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 3 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 16 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 35 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 36 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 37 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 38 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 39 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 40 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 41 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 42 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 44 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 45 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 54 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 64 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 65 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 66 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 67 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 82 | `tracking_positions` | `tbl_tracking_positions` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 83 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 98 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 99 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 100 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 110 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 113 | `driver_presence` | `tbl_driver_presence` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 114 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 115 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 116 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 122 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 135 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 136 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 137 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 138 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 139 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 146 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 151 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 152 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 153 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 154 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 155 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 157 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 168 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 169 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 170 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 171 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 172 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 173 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 177 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 179 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 182 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 185 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 185 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 190 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 199 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 205 | `tracking_events` | `tbl_tracking_events` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 212 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 212 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 219 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 219 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 220 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 221 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 222 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 223 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 231 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 232 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 233 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 234 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 235 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 240 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 251 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 252 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 253 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 254 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 257 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 267 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 268 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 269 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 275 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 280 | `tracking_consents` | `tbl_tracking_consents` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 283 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 292 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 295 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 298 | `tracking_evidences` | `tbl_tracking_evidences` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 304 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 305 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `backend/tracking/src/tracking_sql.py` | 310 | `tracking_last_positions` | `tbl_tracking_last_positions` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 56 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 59 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 73 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 74 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 74 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 79 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 80 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 82 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 83 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 86 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 91 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 92 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 95 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 100 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 100 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 100 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 116 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 118 | `branches` | `tbl_branches` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 119 | `branches` | `tbl_branches` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 121 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 130 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 132 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `scripts/asignar-viajes-demo.mjs` | 139 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `scripts/backfill-wms-fechas.mjs` | 46 | `wms_expediciones` | `tbl_wms_expediciones` | table | sql | reescrito a físico |
| `scripts/backfill-wms-fechas.mjs` | 61 | `wms_expediciones` | `tbl_wms_expediciones` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 89 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 125 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 126 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 127 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 129 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 136 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 151 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 152 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 153 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 156 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 173 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 173 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/cargar-clientes-eflow.py` | 191 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 112 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 116 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 124 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 126 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 137 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 150 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/copy-eflow-snapshot.mjs` | 164 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/create-dev-user.mjs` | 24 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `scripts/create-dev-user.mjs` | 25 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `scripts/create-dev-user.mjs` | 35 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `scripts/create-dev-user.mjs` | 39 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/diccionario-datos.py` | 90 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `scripts/diccionario-datos.py` | 91 | `audit.tracked_tables` | `audit.tbl_tracked_tables` | table | qualified | reescrito a físico |
| `scripts/diccionario-datos.py` | 112 | `audit.tracked_tables` | `audit.tbl_tracked_tables` | table | qualified | reescrito a físico |
| `scripts/diccionario-datos.py` | 317 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 53 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 55 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 57 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 62 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 69 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 74 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 80 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 87 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 95 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 95 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 100 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 125 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 144 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 162 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `scripts/generar-viajes-automatico.mjs` | 173 | `wms_expediciones` | `tbl_wms_expediciones` | table | sql | reescrito a físico |
| `scripts/lib/plan-viajes.mjs` | 54 | `wms_expediciones` | `tbl_wms_expediciones` | table | sql | reescrito a físico |
| `scripts/limpiar-tracking-prueba.mjs` | 58 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/limpiar-tracking-prueba.mjs` | 67 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `scripts/mark-flota-propia.mjs` | 28 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/preview-viaje-trigger.mjs` | 34 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/preview-viaje-trigger.mjs` | 34 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/preview-viaje-trigger.mjs` | 37 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/prueba_flujo_oms.py` | 86 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/prueba_flujo_oms.py` | 92 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/prueba_flujo_oms.py` | 92 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/prueba_flujo_oms.py` | 120 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/run-migration.mjs` | 59 | `audit.events` | `audit.tbl_events` | table | qualified | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 101 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 103 | `order_items` | `tbl_order_items` | table | sql | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 104 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 115 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 146 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 164 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-bandeja-mock.mjs` | 178 | `order_items` | `tbl_order_items` | table | sql | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 54 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 63 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 71 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 85 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 89 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 93 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/seed-costa-rica.mjs` | 94 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 61 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 65 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 70 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 77 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 84 | `zones` | `tbl_zones` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 87 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 88 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 93 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 99 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 111 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 119 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 161 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 179 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-guias-despacho-demo.mjs` | 205 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 54 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 56 | `tarifas_audit_log` | `tbl_tarifas_audit_log` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 57 | `tarifas_proforma_claims` | `tbl_tarifas_proforma_claims` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 58 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 60 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 62 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 63 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 64 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 70 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 71 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 76 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 76 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 79 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 90 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 92 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 94 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 96 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 109 | `tarifas_proformas` | `tbl_tarifas_proformas` | table | sql | reescrito a físico |
| `scripts/seed-proformas-prueba.mjs` | 116 | `tarifas_proforma_phases` | `tbl_tarifas_proforma_phases` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 52 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 56 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 70 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 75 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 76 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 76 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 80 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 85 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 85 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 87 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 92 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 97 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 99 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 106 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-recolecta-demo.mjs` | 114 | `dispatch_guides` | `tbl_dispatch_guides` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-base-change.mjs` | 76 | `tarifas_pricing_rules` | `tbl_tarifas_pricing_rules` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-base-change.mjs` | 82 | `tarifas_settlement_parties` | `tbl_tarifas_settlement_parties` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-base-change.mjs` | 82 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-base-change.mjs` | 88 | `tarifas_pricing_rules` | `tbl_tarifas_pricing_rules` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 283 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 285 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 286 | `tarifas_settlement_parties` | `tbl_tarifas_settlement_parties` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 294 | `tarifas_country_settings` | `tbl_tarifas_country_settings` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 296 | `tarifas_margin_policies` | `tbl_tarifas_margin_policies` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 301 | `tarifas_pricing_rules` | `tbl_tarifas_pricing_rules` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 324 | `tarifas_settlement_parties` | `tbl_tarifas_settlement_parties` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 336 | `tarifas_rate_tables` | `tbl_tarifas_rate_tables` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 341 | `tarifas_rate_table_rows` | `tbl_tarifas_rate_table_rows` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 351 | `tarifas_party_variables` | `tbl_tarifas_party_variables` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 356 | `tarifas_party_variables` | `tbl_tarifas_party_variables` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 368 | `tarifas_cost_structures` | `tbl_tarifas_cost_structures` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 373 | `tarifas_cost_structure_rows` | `tbl_tarifas_cost_structure_rows` | table | sql | reescrito a físico |
| `scripts/seed-tarifas-demo.mjs` | 379 | `tarifas_cost_structure_rows` | `tbl_tarifas_cost_structure_rows` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 80 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 82 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 86 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 89 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 93 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 97 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 103 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 105 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 105 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 113 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 113 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 115 | `routes` | `tbl_routes` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 118 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 124 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 127 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 133 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 136 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 147 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 150 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 156 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 159 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 171 | `branches` | `tbl_branches` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 174 | `branches` | `tbl_branches` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 180 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 181 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 182 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 187 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 192 | `route_plans` | `tbl_route_plans` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 201 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 202 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 203 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 221 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 225 | `orders` | `tbl_orders` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 236 | `plan_trips` | `tbl_plan_trips` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 244 | `plan_stops` | `tbl_plan_stops` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 261 | `organizations` | `tbl_organizations` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 262 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 263 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 263 | `roles` | `tbl_roles` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 266 | `drivers` | `tbl_drivers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 267 | `vehicles` | `tbl_vehicles` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 268 | `carriers` | `tbl_carriers` | table | sql | reescrito a físico |
| `scripts/seed-tracking-demo.mjs` | 269 | `stores` | `tbl_stores` | table | sql | reescrito a físico |
| `scripts/seed-wms-expediciones.mjs` | 115 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `scripts/seed-wms-expediciones.mjs` | 116 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `scripts/seed-wms-expediciones.mjs` | 121 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/seed-wms-expediciones.mjs` | 122 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `scripts/seed-wms-expediciones.mjs` | 131 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `scripts/seed-wms-expediciones.mjs` | 154 | `wms_expediciones` | `tbl_wms_expediciones` | table | sql | reescrito a físico |
| `server/domain/context/authorizeOperationalContext.mjs` | 24 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `server/domain/context/authorizeOperationalContext.mjs` | 24 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `server/domain/context/authorizeOperationalContext.mjs` | 32 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `server/domain/context/resolveOperationalContext.mjs` | 24 | `app_users` | `tbl_app_users` | table | sql | reescrito a físico |
| `server/domain/context/resolveOperationalContext.mjs` | 34 | `user_scopes` | `tbl_user_scopes` | table | sql | reescrito a físico |
| `server/tms-auth.mjs` | 40 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `server/tms-auth.mjs` | 58 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `server/tms-auth.mjs` | 66 | `auth_credentials` | `tbl_auth_credentials` | table | sql | reescrito a físico |
| `server/tms-context-routes.mjs` | 48 | `countries` | `tbl_countries` | table | sql | reescrito a físico |
| `server/tms-context-routes.mjs` | 62 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `server/tms-context-routes.mjs` | 76 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `server/tms-context-routes.mjs` | 90 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `server/tms-context-routes.mjs` | 104 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `server/tms-context-routes.mjs` | 120 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `server/tms-context-routes.mjs` | 121 | `addresses` | `tbl_addresses` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 77 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 81 | `warehouses` | `tbl_warehouses` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 86 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 93 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 102 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 122 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 131 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 142 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 149 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 157 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 163 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 164 | `customers` | `tbl_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 172 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 178 | `final_customers` | `tbl_final_customers` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 183 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 189 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `src/__tests__/multi-tenant-isolation.test.ts` | 194 | `delivery_points` | `tbl_delivery_points` | table | sql | reescrito a físico |
| `src/lib/tarifas/__tests__/aurora.cr-load.test.ts` | 43 | `costos_variables` | `tbl_costos_variables` | table | sql | reescrito a físico |
| `src/lib/tarifas/__tests__/aurora.e2e.test.ts` | 70 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `src/lib/tarifas/__tests__/aurora.e2e.test.ts` | 102 | `tarifas_settlements` | `tbl_tarifas_settlements` | table | sql | reescrito a físico |
| `src/lib/tarifas/data/__tests__/schema.test.ts` | 119 | `routes` | `tbl_routes` | table | sql | sin cambio (DDL histórico de schema.ts) |
| `src/lib/tarifas/data/__tests__/schema.test.ts` | 120 | `carriers` | `tbl_carriers` | table | sql | sin cambio (DDL histórico de schema.ts) |
| `src/lib/tarifas/data/__tests__/schema.test.ts` | 121 | `countries` | `tbl_countries` | table | sql | sin cambio (DDL histórico de schema.ts) |
| `src/lib/tarifas/data/__tests__/schema.test.ts` | 133 | `tarifas_settlements_trip_vigente_uq` | `uidx_tarifas_settlements_trip_vigente_uq` | index | sql | sin cambio (DDL histórico de schema.ts) |
| `src/lib/tarifas/data/schema.ts` | 387 | `tarifas_trip_order_marks_uq` | `uidx_tarifas_trip_order_marks_uq` | index | sql | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/schema.ts` | 415 | `tarifas_trip_tender_awards_uq` | `uidx_tarifas_trip_tender_awards_uq` | index | sql | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/schema.ts` | 600 | `tarifas_settlements_trip_vigente_uq` | `uidx_tarifas_settlements_trip_vigente_uq` | index | sql | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/schema.ts` | 607 | `tarifas_settlements_country_number_uq` | `uidx_tarifas_settlements_country_number_uq` | index | sql | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/schema.ts` | 811 | `tarifas_proformas_country_number_uq` | `uidx_tarifas_proformas_country_number_uq` | index | sql | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/schema.ts` | 845 | `tarifas_proforma_items_settlement_incluida_uq` | `uidx_tarifas_proforma_items_settlement_incluida_uq` | index | sql | sin cambio (comentario del frontend) |
| `src/lib/tarifas/data/schema.ts` | 942 | `tarifas_proforma_email_config_country_uq` | `uidx_tarifas_proforma_email_config_country_uq` | index | sql | sin cambio (comentario del frontend) |
| `src/pages/liquidaciones/hooks/computeKPIs.ts` | 1 | `settlements` | `tbl_settlements` | table | sql | sin cambio (comentario del frontend) |
