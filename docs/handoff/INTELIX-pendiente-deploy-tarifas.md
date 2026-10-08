# Pendiente de despliegue: backend del tarifador (módulo Tarifas)

Fecha: 2026-10-08. Rama de trabajo: `dylan-tarifas`. Nadie ha desplegado esto: todo se probó con el backend corriendo **en local** contra Aurora (sin tocar AWS). El despliegue lo hace el líder del equipo tras el merge a `main`.

## Qué hay que desplegar
Solo el stack `tarifas` (`backend/tarifas/`). Cambios entre lo que está desplegado (`628c083`) y la rama: 8 archivos, todos dentro de `backend/tarifas/`. El diff exacto está en `docs/handoff/tarifas-backend-pendiente.patch` (incluye las migraciones 26 a 28).

| Cambio | Archivo | Para qué |
|---|---|---|
| Rutas `POST /api/tarifas/batch` y `POST /api/tarifas/{table}/find` | `template.yaml`, `src/app.py` | El catálogo se lee en 2 llamadas en vez de ~11; consultas largas por POST |
| Caché de permisos 30 s por contenedor (`TMS_PERMS_TTL_SECONDS=30`) | `template.yaml`, `src/tarifas_perms.py` | Cada petición hacía ~4 consultas de permisos |
| `statement_timeout` 10 s y `lock_timeout` 5 s solo en la conexión del Lambda | `template.yaml`, `src/tarifas_db.py` | Una consulta colgada no agota los 15 s del Lambda |
| Paginación por cursor (`after`) y proyección `columns` | `src/tarifas_sql.py` | Historial por páginas; listados sin JSONB pesados |
| Métricas EMF por petición | `src/tarifas_metrics.py`, `src/app.py` | Duración, consultas y errores por ruta en CloudWatch |
| `settlement_date` como `date` | `src/schema_manifest.json` | Filtros y orden de fechas reales |

## Impacto en otros módulos: ninguno
Ningún otro stack importa nada de `tarifas`; la capa común (`tms_common`) y el rol del Lambda no cambian; las rutas nuevas se suman al API Gateway sin tocar las de otros módulos; los topes de tiempo se fijan por sesión y no cambian la base. Detalle en `docs/work/2026-10/2026-10-08-despliegue-tarifas-impacto-y-pasos.md`.

## Orden del despliegue (importa)
1. Merge de la rama a `main` y despliegue del stack `tarifas`.
2. Reaplicar la migración 28 en Aurora: `node --env-file=.env.local scripts/run-migration.mjs sql/28_tarifas_fecha_e_indices_sobrantes.sql --execute --force`. **Estado actual de la base de pruebas:** la contingencia de `settlement_date` a text está aplicada (`settlement_date` es `text`) porque el backend desplegado todavía manda `::text`. Con el backend nuevo la columna debe volver a `date`; solo la 28 la devuelve (solo cambia el tipo si la columna es `text`).
   - Si se aplica la 28 **antes** de desplegar, emitir liquidaciones falla (`column "settlement_date" is of type date but expression is of type text`).
   - Si se despliega y no se aplica la 28, funciona todo salvo el historial paginado por cursor y los filtros por fecha, que comparan `text` con `date`.
3. En `src/lib/tarifas/__tests__/aurora.manifest-esquema.test.ts` quitar `tarifas_settlements.settlement_date` de `KNOWN_DIVERGENCES` y correr `TARIFAS_AURORA_MANIFEST=1 npx vitest run src/lib/tarifas/__tests__/aurora.manifest-esquema.test.ts`.
4. Verificar en el navegador: `POST /api/tarifas/batch` responde 200 (hoy 404), emitir una liquidación de prueba y abrir el modal de un transportista que no se haya abierto antes.
5. Registrar el cambio en `docs/reference/aws-inventario-tms.md`.

Rollback: volver al commit anterior de `backend/tarifas`; la base se devuelve con `docs/handoff/contingencia-settlement-date-a-text.sql`.

## Qué se probó (backend en local, `127.0.0.1:4010`, Aurora por túnel)
Mismas pantallas y viajes que la auditoría del 2026-10-07. Los tiempos locales NO son los de AWS (el servidor local atiende una petición a la vez y cada consulta pasa por el túnel, ~85 ms), sirven para comparar versiones y contar llamadas.

| Escenario | Backend desplegado (anterior) | Backend nuevo, caché de permisos apagada | Backend nuevo con las variables de la plantilla |
|---|---|---|---|
| Abrir el modal, transportista ya visto | 6,0 s, 9 llamadas | 2,0 s, 3 llamadas | **1,0 s**, 3 llamadas |
| Abrir el modal, transportista nuevo | 14–15 s, 23–28 llamadas | 7,0 s, 6 llamadas | **5,0 s**, 6 llamadas |
| Marcar un pedido ("Liquidar después") hasta verlo | 4–7 s, ~8 llamadas | — | **2,0 s**, 4 llamadas |
| Tiempo por llamada | ~0,6 s | ~0,6 s | ~0,27 s |
| Emitir liquidación | falla (`settlement_date`) | OK | OK (3 s en total) |

Las cifras mejoran por tres causas independientes: `/batch` (menos llamadas), la caché de permisos (llamadas más baratas) y los cambios del frontend de esta rama (menos lecturas duplicadas; se ve en "transportista ya visto").

También se comprobó con `scripts/verify-tarifas-date-local.py` (transacción con ROLLBACK, la base no cambia) que el SQL del backend nuevo funciona con `settlement_date` como `date`: filtros Desde/Hasta, igualdad, orden y cursor.

## Para entregar sin hacer push
`docs/handoff/tarifas-backend-pendiente.patch` contiene el diff completo. Si el líder prefiere tomarlo de GitHub, hay que subir la rama `dylan-tarifas`: tiene commits locales que aún no están en el remoto.

## Nota sobre la contingencia de `settlement_date`
`docs/handoff/contingencia-settlement-date-a-text.sql` NO es parte de la secuencia `sql/NN`: es lo que se aplicó solo en la base de pruebas (columna a `text`) porque el backend desplegado era anterior. Está fuera de `sql/` a propósito: si un runner de migraciones la ejecutara después de la 28, devolvería la columna a `text` y el backend nuevo fallaría en el historial paginado y los filtros por fecha. Al desplegar, aplicar solo la 28.
