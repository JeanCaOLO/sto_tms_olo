# Resolución de Novedades de Devoluciones (D10) y cierre del gate

**Fecha:** 2026-11-13. **Tareas:** 2, 3 y 4 de `tunnel.md` (Kiro). Cambios locales sin commit. SQL 71 no aplicado a ninguna base.

## Regla acordada (D01)

Los mismos roles que pueden recibir devoluciones (permiso `edit` del módulo `devoluciones`) pueden sacar una devolución de Novedades. Ese permiso se exige en `admin_return_incidents.resolve`, igual que en `receive_return` y en `record`.

## Qué hace la resolución

`POST /api/v1/devoluciones/{returnId}/novedades/resolver` con `incident_id` (UUID de la novedad mostrada), `outcome`, `note` (1 a 1000 caracteres) e `idempotency_key` (UUID).

| Resultado | Efecto |
| --- | --- |
| `restored` | La devolución vuelve a su estado, cantidad y condición anteriores a la novedad. Si no estaba recibida, queda `pending` o `approved` y sigue bloqueando la liquidación hasta recibirse. |
| `accepted` | La devolución queda `received` (o conserva `completed`). Exige `received_quantity` y `condition` explícitos cuando no hubo recepción previa. No se infiere ninguna cantidad. Aquí se registran faltantes y averías aceptadas. |

Solo se resuelve la última novedad de una devolución que sigue en `in_review`. Un reintento con la misma clave y los mismos datos responde 200 sin duplicar. La misma clave con otros datos responde 409. Cada resolución queda en auditoría (`resolver-novedad`).

La corrección de auditoría del 16 de noviembre exige que `incident_id` siga siendo la novedad actual antes de una resolución nueva. Una pantalla antigua no puede cerrar otra novedad. Los reintentos comparan también el incidente y la cantidad/condición normalizadas; un reintento confirmado anterior puede responder 200 sin alterar una novedad posterior.

## SQL 71 (`sql/71_return_incident_resolutions.sql`, con rollback)

- Tabla nueva `tbl_return_incident_resolutions`. El historial de novedades del 70 no se modifica, porque su trigger lo declara inmutable.
- Una resolución por novedad, inmutable (trigger que rechaza `UPDATE` y `DELETE`).
- Trigger diferido: la devolución debe quedar con el estado, cantidad y condición de la resolución al terminar la transacción.
- Trigger en `tbl_returns`: una devolución solo sale de `in_review` con una resolución de su última novedad insertada en la transacción actual y con los valores registrados. Una resolución histórica no autoriza otra salida. `resolved_in_transaction` lo fija el servidor; las filas de preparaciones anteriores conservan NULL sin reescribir historial.
- El rollback rechaza si existe alguna resolución.

## Interfaz

Botón "Resolver novedad" en las líneas en revisión (solo con permiso de edición) y un modal con resultado, cantidad y estado (al aceptar) y motivo. Reintenta con la misma clave si los datos no cambian.

## Brecha encontrada y corregida en el gate (V01 parcial)

`returns_gate.check` leía las devoluciones abiertas con una consulta suelta y el `INSERT` de la liquidación iba aparte. Una novedad registrada entre ambos pasos permitía una liquidación con una devolución en revisión. Con `TMS_RETURNS_GATE` activo, el `INSERT` de liquidaciones ahora corre en una transacción que primero bloquea con `FOR SHARE` las devoluciones del viaje y repite la comprobación (`returns_gate.recheck`). `record`, la recepción y la resolución toman la fila con `FOR UPDATE`, así que quedan serializadas con la liquidación. Con el flag apagado no cambia nada.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `pytest backend/tests` completa | 846 pasan (incluye las pruebas nuevas de resolución y del gate) |
| `node --test tests/sql/70_*.test.mjs tests/sql/71_*.test.mjs` (PGlite) | 17 pasan |
| `vitest src/pages/devoluciones` (solo `TripCard.incidents`) | 13 pasan |
| `tsc --noEmit -p tsconfig.app.json` y `eslint` de los archivos tocados | sin errores |

**No ejecutado:** concurrencia real con dos conexiones PostgreSQL (V01). No hay PostgreSQL local y el daemon de Docker está apagado. PGlite de una instancia no prueba bloqueos entre sesiones. Tampoco se aplicó el 71 a ninguna base ni se probó contra el ambiente publicado. La ruta `ReturnsIncidentResolveRoute` en `backend/admin/template.yaml` la publica Intelix/Jean.

## Archivos

`sql/71_return_incident_resolutions.sql` y `_rollback.sql`, `tests/sql/71_return_incident_resolutions.test.mjs`, `backend/admin/src/admin_return_incidents.py`, `admin_return_incidents_sql.py`, `app.py`, `backend/admin/template.yaml`, `backend/tarifas/src/returns_gate.py`, `backend/tarifas/src/app.py`, `backend/tests/test_return_incidents.py`, `backend/tests/test_returns_gate.py`, `src/pages/devoluciones/components/ResolveIncidentModal.tsx`, `parts/ReturnLinesTable.tsx`, `parts/TripCard.tsx`, `parts/TripCard.incidents.test.tsx`, `api/devolucionesApi.ts`.
