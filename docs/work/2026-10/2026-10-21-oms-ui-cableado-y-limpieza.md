# 2026-10-21 — OMS: cableado de la UI a `orders` real, catálogo de reglas, logs y limpieza

Rama `oms`. Lote de cambios de UI/datos sobre el sandbox de OLO, pedidos por negocio.
El frontend NO usa Supabase: `src/lib/supabase.ts` es un cliente propio (fetch+JWT)
contra `/api/data` (server/tms-*.mjs) → Aurora `tms_olo` (misma BD que el backend).

## Hecho

1. **Vista de Pedidos eliminada** (`/pedidos`). La Cola del OMS ya cubre ver pedidos.
   - Quitada del router (`src/router/config.tsx`), del nav (`sidebar-nav-items.ts`),
     borrada la carpeta `src/pages/pedidos/`, y quitado `pedidos` del mapa de
     `src/__tests__/db-connectivity.test.ts`.

2. **Catálogo de reglas actualizado al backend real (ADR-013)** — `src/pages/oms/mockData.ts`
   `engineRules`. Antes reflejaba el modelo viejo (tiers 1..4, regla T-1, observaciones).
   Ahora: regla de fecha = `delivery_date − lead_time_days` (lead dinámico, default 1,
   fecha centinela 1900-01-01 → urgente); cliente-retira **por zona** (no observaciones);
   observaciones IA marcada **DIFERIDA** (D11); nueva regla **Liberación a eFlow por
   ventana** (`dias_prep_picking=1`, barrido 5×/día + acción manual); asignación de viaje
   = de Planificación; inventario/backorder = FUTURO (U2). Es catálogo de display; la
   lógica vive en `backend/oms/src/` (regla_fecha.py, score.py, handoff_pedidos.py).

3. **Cola cableada a `orders` real + estado priorizado/no-priorizado**:
   - `omsApi.ts`: `DEMO_POR_DEFECTO = false` (el demo del motor queda bajo `?demo=1`).
     `getQueue` devuelve datos reales de `orders` aunque vengan vacíos (solo cae al mock
     ante error de BD, no por cola vacía). Mapea `prioritized`/`released` desde
     `priority`/`oms_score`/`prioritization_run_id` y `oms_processed_at`/`wms_situation`.
   - `types.ts` `QueueOrder`: `prioritized?`/`released?` (opcionales; el mock los omite).
   - `cola/page.tsx`: columna **Estado OMS** (Priorizado / Liberado / Sin priorizar).
   - Mientras el backend no corra en vivo, todos salen "Sin priorizar" (nadie escribe
     esas columnas todavía) — coherente con "mientras tanto".

4. **Pestaña "Logs OMS" en Auditoría (solo developer)** — `auditoria/page.tsx` con
   pestañas Priorizaciones | Logs OMS. La pestaña Logs lee `oms_logs` vía `/api/data`
   (`omsApi.getOmsLogs`), gated con `can('oms.simulador','view')` (mismo criterio
   developer que el Simulador). Tipo `OmsLogEntry` en `types.ts`.
   - **Tabla nueva**: `sql/49_oms_logs.sql` (estándar OLTP Intelix: `pk_oms_log`,
     `ck_oms_log_level`, `idx_oms_log_*`). Añadida a la whitelist del backend genérico
     (`server/tms-relations.mjs`) y del test de conectividad.
   - **Escritura backend**: `backend/oms/src/oms_log.py` (best-effort, nunca lanza;
     no-op en modo mock). Cableada en `app.py` `correr()` (acción `barrido`) y
     `procesar_viaje()` (acción `procesar_viaje`); `warn` cuando hay `pendientes`.
     Solo escribe cuando `OMS_SOURCE=live`.

5. **Limpieza de `orders` del prototipo** — `sql/48_orders_delete_prototipo_store_id.sql`:
   borra las filas con `store_id` (pedidos viejos del prototipo) y conserva las de
   `store_id NULL` (modelo EFLOW). Borra también `order_items` hijos. Guard que aborta
   si la columna ya no existe. **DEBE correr ANTES de `sql/45`** (que elimina la columna).

## Verificación

- `npm run type-check`: sin errores en los archivos tocados (los errores restantes son
  de entorno: faltan `@types/node` y `@turf/*` en este `node_modules`, no de este cambio).
- `eslint` de los archivos tocados: 0 errores, 0 warnings.
- Backend: `py_compile` OK de los módulos OMS. La suite `test_oms.py` no se corrió aquí
  (sin pytest en este entorno); los cambios de `app.py` preservan todas las claves que
  los tests consultan y `oms_log.registrar` es no-op en mock. La respuesta de la acción
  manual ahora incluye `priorizados` (cierra el hallazgo cosmético previo).

## Aplicado en el sandbox (2026-10-21, túnel SSM en 127.0.0.1:15432)

Las tres migraciones se corrieron con `node --env-file=.env scripts/run-migration.mjs`
(dry-run primero, luego `--execute`), registradas en `schema_migrations`:

- **`sql/49_oms_logs.sql`** — tabla `oms_logs` creada.
- **`sql/48_...store_id.sql`** — CASCADA del prototipo (la cola de FKs apareció al
  correr los dry-run, se fue completando): borrado de `tracking_events` (15),
  `tracking_evidences` (12), `returns` (0), `dispatch_guides` (71), `plan_stops` (5),
  `order_items` (2526) y `orders` (**1249**). Se conservan los **402** pedidos con
  llave EFLOW.
- **`sql/45_orders_drop_store_id.sql`** — columna `store_id` eliminada de `orders`.

Estado final verificado: `orders`=402 (todos con `eflow_id_expedicion`), `store_id`
ausente, `dispatch_guides`=0, `order_items`=0, `plan_stops`=393 (paradas reales de
Planificación sobre los 402, intactas), `oms_logs` existe.

## Pendiente (despliegue AWS)

- Los **logs del OMS** solo se poblarán cuando el backend corra con `OMS_SOURCE=live`
  (hoy mock + no desplegado). Hasta entonces la pestaña de Auditoría sale vacía.
- Completar `backend/oms/template.yaml` (schedule W1, ruta manual W2, IAM W3) y poner
  `OMS_SOURCE=live` para que el motor lea los 402 orders reales y escriba prioridad/
  liberación + logs. Deploy por Intelix.
