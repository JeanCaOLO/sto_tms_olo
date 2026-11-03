# 2026-10-22 — OMS: refactor de Auditoría, `oms_logs` adelgazada (jsonb) y despliegue a sandbox

Rama `oms`. Continúa el lote del 2026-10-21 (`2026-10-21-oms-ui-cableado-y-limpieza.md`).
Commits: `b52e807`, `015759d`, `1da315b` (ajuste `oms_logs` + detalle jsonb), `714607a`
(normalización ASCII del template). Despliegues dev/QA los hace el equipo (Intelix); los
commits/push los hace Eduardo.

## Hecho

### 1. Refactor de la vista de Auditoría (`src/pages/oms/auditoria/`)

- **Pestaña "Acciones del OMS"** (cualquiera con permiso de auditoría): se **quitó el filtro**
  todos/automáticos/manuales. La tabla muestra TODAS las acciones de negocio (`barrido`,
  `procesar_viaje`, `override_manual`); el tipo (Automático/Manual) quedó como **filtro de
  columna** en la cabecera, no como botones aparte. Columnas: Fecha, Tipo, Acción, Detalle
  (truncado), Actor.
- **Clic en una fila → modal con el detalle completo** (`LogDetailModal.tsx`, nuevo): Fecha,
  Actor, Corrida, Mensaje y el `detail` jsonb pretty-printed. Resuelve que la columna "Detalle"
  va truncada por ancho (normal) pero el detalle completo debe poder verse.
- **Pestaña "Detalle" (solo developer)** = **consola** (fondo oscuro, monoespaciada) con TODOS
  los logs, **búsqueda** de texto (mensaje/acción/viaje/corrida/actor/level) y líneas clicables
  (abren el mismo modal). Gated con `can('oms.simulador','view')` (criterio developer).
- **Limpieza de logs por RANGO de fechas** (developer), no "borrar todos": selectores Desde/Hasta
  + botón "Limpiar rango". El rango es `[Desde 00:00, díaSiguiente(Hasta) 00:00)` ("Hasta"
  inclusive). Confirmación `danger` antes de borrar.
- **Relabeling en display** (`logLabels.ts`, nuevo): `barrido` → **"Corrida automática"**,
  `procesar_viaje` → "Procesar a Eflow", `override_manual` → "Override manual". `displayMessage()`
  además reescribe el prefijo "Barrido" del texto libre del mensaje (cubre las filas viejas sin
  tocar lo guardado). El término "barrido" se conserva solo como `action` interno/código.

### 2. `oms_logs` adelgazada — contexto variable a `detail` jsonb (`sql/53_oms_logs_slim.sql`)

- Decisión: en vez de columnas tipadas dispersas que no sabemos si usaremos, **un solo campo
  `detail` (jsonb) extensible**. Se **conservó `corrida_id` como columna** (se consulta/filtra).
- `sql/53` hace `DROP COLUMN IF EXISTS` de `numero_viaje`, `eflow_id_expedicion`, `country_id`,
  `company_code` (con validación + ROLLBACK documentado en el script). Aplicada al sandbox con
  `node --env-file=.env scripts/run-migration.mjs sql/53_oms_logs_slim.sql --execute`.
- Columnas finales: `id, created_at, level, action, corrida_id, message, detail, actor`.
  Filas intactas.
- Frontend alineado: `types.ts` `OmsLogEntry` sin `numeroViaje/eflowIdExpedicion/countryId/
  companyCode`; `omsApi.getOmsLogs` mapper y `clearOmsLogs(range?)` (borrado por rango, al
  menos un filtro — el cliente propio prohíbe DELETE sin WHERE).

### 3. Backend: `registrar` esbelto y contexto en `detail`

- `backend/oms/src/oms_log.py`: `registrar(action, message, *, level, corrida_id, detail, actor)`
  — INSERT de 6 columnas; `detail` se serializa a JSON. Sigue best-effort (nunca lanza) y
  **no-op salvo `OMS_SOURCE=live`**.
- `backend/oms/src/app.py`: `procesar_viaje` pliega `numero_viaje` dentro de `detail`
  (`{"numero_viaje": ..., "total"/"liberados"/"pendientes"/"subconjunto"}` y, en error,
  `{"numero_viaje": ..., "error": ...}`), ya no como columna.

### 4. `oms_logs` registrada en el backend genérico de datos

- `backend/data/src/relations.py`: `oms_logs` añadida a `TABLES` (antes daba 400 "Tabla
  desconocida" en `/api/data/oms_logs`).
- `backend/data/src/table_modules.py`: dueña = `oms.auditoria` → **leer exige `view`**,
  **limpiar (DELETE) exige `delete`** en ese módulo (fail-closed si no se mapea).

### 5. Modo mock fuera del camino en local

- `.env` (gitignored): `OMS_SOURCE=live` (la cola lee `orders` reales y las corridas escriben
  en `oms_logs` + `orders`). `EFLOW_MODE` se queda en `mock` (el SQL Server real de EFLOW no
  es alcanzable en local y es **solo lectura** — nunca escribir ahí). Son switches DISTINTOS.
- `backend/local/serve.py`: el banner de arranque ahora imprime también `OMS_SOURCE=...`.

## Despliegue a sandbox (2026-10-22, cuenta 758837481569, us-east-2, AWS_PROFILE=olo-tms)

- `python scripts/sandbox/deploy_backend.py data` y `... oms` — ambos OK.
- **Bloqueo resuelto (encoding cp1252)**: `aws cloudformation package` (aws.exe v2 congelado)
  lee el template con cp1252 y reventaba con `'charmap' codec can't decode byte 0x81`. Causa:
  `backend/oms/template.yaml` tenía "Á" (C3 81) y em-dashes (E2 80 94). `PYTHONUTF8`/
  `PYTHONIOENCODING` NO ayudan (el exe congelado los ignora). **Fix**: transliterar el template
  a ASCII (commit `714607a`). El stack `data` no falló porque sus acentos (é/á/ó) son bytes
  únicos válidos en cp1252.
- **Verificado end-to-end**: invoke de `dev-tms-oms-oms-api` → `{"modo":"live","total":12,
  "priorizados":0,...}` StatusCode 200; nueva fila `oms_logs` esbelta con `corrida_id` + `detail`
  JSON y sin error.

## Verificación

- `tsc` limpio en los archivos tocados. 43 tests OMS + 68 de data/permisos en verde.
- `oms_logs` = 8 columnas tras `sql/53`; filas intactas.

## Notas / pendientes

- Las corridas de prueba (de Claude y de la IA de Planificación) son **locales** contra la
  Aurora del sandbox vía túnel `127.0.0.1:15432`. El contrato OMS↔Planificación en
  `public.orders` **no cambió** con este lote (fue interno del OMS): un pedido entra al OMS con
  `planning_run_id IS NOT NULL AND oms_processed_at IS NULL` (+ `numero_viaje`, `dispatch_date`,
  `lead_time_days`).
- Si las pruebas locales escriben en la Aurora del sandbox, el Lambda `oms` desplegado corre en
  **vivo cada 15 min (dev)** sobre esa misma BD y tocará esos pedidos; se puede deshabilitar
  temporalmente el schedule de EventBridge mientras se prueba.
- El fix de encoding del template aplica a futuros deploys de otros stacks si tienen no-ASCII en
  comentarios/Description: transliterar o forzar UTF-8 en `deploy_backend.py` (ofrecido, no hecho).
