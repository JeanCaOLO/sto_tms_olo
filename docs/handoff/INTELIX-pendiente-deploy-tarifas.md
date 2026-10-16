# Despliegue del backend del tarifador (módulo Tarifas)

Fecha: 2026-10-08. Rama: `dylan-tarifas`. Hace falta **merge a `main` y el despliegue normal del stack `tarifas`** (`backend/tarifas/`). No hay ningún paso manual de base de datos ni de orden: la base ya está en el estado que el backend nuevo espera y es compatible con el backend anterior.

## Qué se despliega
Solo el stack `tarifas`. Cambios respecto de lo desplegado (`628c083`): 8 archivos de `backend/tarifas/` más sus tests.

| Cambio | Archivo | Para qué |
|---|---|---|
| Rutas `POST /api/tarifas/batch` y `POST /api/tarifas/{table}/find` | `template.yaml`, `src/app.py` | El catálogo se lee en 2 llamadas en vez de ~11; consultas largas por POST |
| Caché de permisos 30 s (`TMS_PERMS_TTL_SECONDS=30`) | `template.yaml`, `src/tarifas_perms.py` | Cada petición hacía ~4 consultas de permisos |
| `statement_timeout` 10 s y `lock_timeout` 5 s solo en la conexión del Lambda | `template.yaml`, `src/tarifas_db.py` | Una consulta colgada no agota los 15 s del Lambda |
| Paginación por cursor (`after`) y proyección `columns` | `src/tarifas_sql.py` | Historial por páginas; listados sin JSONB pesados |
| Métricas EMF por petición | `src/tarifas_metrics.py`, `src/app.py` | Duración, consultas y errores por ruta en CloudWatch |

## Base de datos: nada que hacer al desplegar
Las migraciones 26, 27, 28 y 29 (`sql/`) **ya están aplicadas** en la Aurora de pruebas. `settlement_date` es `text` (formato AAAA-MM-DD), igual que el backend anterior; el manifiesto del backend nuevo (`schema_manifest.json`), `schema.ts` y `sql/04_tarifas.sql` también dicen `text`. Por eso el backend anterior y el nuevo funcionan con la misma base y el orden de despliegue no importa. La prueba `src/lib/tarifas/__tests__/aurora.manifest-esquema.test.ts` (`TARIFAS_AURORA_MANIFEST=1`) comprueba que el manifiesto y Aurora coinciden, sin excepciones.

(En una base nueva, la secuencia 28 → 29 deja también `text`.)

## Impacto en otros módulos: ninguno
Ningún otro stack importa nada de `tarifas`; `tms_common` y el rol del Lambda no cambian; las rutas nuevas se suman al API Gateway sin tocar las de otros módulos; los topes de tiempo se fijan por sesión y no cambian la base. Detalle en `docs/work/2026-10/2026-10-08-despliegue-tarifas-impacto-y-pasos.md`.

## Verificación después de desplegar (opcional, 2 minutos)
`POST /api/tarifas/batch` responde 200 (con el backend anterior da 404; el frontend lo tolera y cae a lecturas sueltas); abrir el modal de un transportista nuevo en `/liquidaciones` (esperado ≈ 1–5 s en vez de 13–15 s) y registrar el cambio en `docs/reference/aws-inventario-tms.md`.

Rollback: volver al commit anterior de `backend/tarifas`. La base no necesita cambios.

## Qué se probó (backend nuevo en local contra Aurora, sin tocar AWS)
Los tiempos locales sirven para comparar versiones y contar llamadas; no son los de AWS.

| Escenario | Backend desplegado | Backend nuevo (variables de la plantilla) |
|---|---|---|
| Abrir el modal, transportista ya visto | 6,0 s, 9 llamadas | **1,0 s**, 3 llamadas |
| Abrir el modal, transportista nuevo | 14–15 s, 23–28 llamadas | **5,0 s**, 6 llamadas |
| Con el cursor sobre "Liquidar" y abrir | — | **0,84 s**, 3 llamadas |
| Marcar un pedido y verlo | 4–7 s | **2,0 s** |
| Tiempo por llamada | ~0,6 s | ~0,27 s |
| Emitir liquidación | OK solo con `text` | OK (2,5 s) |

Recorrido completo en el navegador: 16 viajes calculan, emitir, estados hasta Pagado, re-liquidar, anular, liquidar después, anular pedido, filtros por fecha en la bandeja y el historial (sin errores con `text`), exportar y enlaces de "sin lógica". Pasan 221 pruebas de backend y 787 del frontend. Informe completo: `docs/work/2026-10/2026-10-08-reprueba-backend-nuevo-local.md`.

## Entrega sin push
`docs/handoff/tarifas-backend-pendiente.patch` trae el diff de `backend/tarifas`, sus tests y las migraciones.
