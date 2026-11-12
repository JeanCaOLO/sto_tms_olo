# Entrega a Jean: esquema de solicitudes y trazabilidad (T03)

**Actualizacion posterior: SQL 67 aplicada en sandbox por autorizacion explicita del usuario tras dry run correcto.** Ver [evidencia](auditoria/2026-11-12/t03-aurora-sql67.json). No reejecutar por suposicion. Los pasos siguientes documentan la preparacion y el procedimiento reservado para otras ejecuciones; no autorizan nuevos cambios. No se desplegaron aplicaciones; T04/E2E siguen pendientes.

Preparado el 2026-11-12. **Al preparar esta entrega no se habia aplicado a Aurora; el estado posterior figura arriba. Otros cambios y despliegues siguen reservados a Jean.** Esta entrega prepara el esquema; la API de revisión (T04), las pantallas y la integración de Planificación siguen pendientes.

## Cambios y compatibilidad

- [SQL 67](../../sql/67_roles_solicitudes_devolucion.sql) amplía `tbl_return_requests.status` conservando `pendiente_asignacion` y añadiendo `aprobada`/`rechazada`. No convierte datos existentes ni supone que fueron revisados.
- Añade `decided_by`, `decided_at` y `rejection_reason`. La decisión es de toda la solicitud; rechazo exige motivo no vacío de hasta 500 caracteres. La decisión final y la identidad histórica no se pueden reescribir. El actor pertenece a la organización; comprobar rol, permiso, países y scopes sigue siendo responsabilidad del backend T04.
- Reutiliza `tbl_app_users.customer_id`, el destino histórico `tbl_return_requests.customer_id` y `tbl_user_scopes`; no crea tablas de asignación. Las nuevas solicitudes exigen empresa/asignación/autor coherentes. Cambiar después la asignación del usuario no cambia el destino de solicitudes anteriores.
- Añade `tbl_returns.request_item_id`, nullable. Contracamión y devoluciones anteriores siguen con NULL y conservan su flujo. Un vínculo nuevo exige solicitud aprobada, tipo recolecta y pedido/guía/viaje/empresa de la misma organización. No se infiere el dueño por viaje completo, transportista o código simulado.
- El índice único `(request_item_id, dispatch_guide_id)` evita duplicar un artículo en la misma guía. Admite guías distintas; no implementa asignación, exclusión entre viajes activos, saldos, cierre ni reprogramación. Planificación debe controlar esos casos y la sincronización tardía.
- No cambia recepción, cantidades ni gate de Liquidaciones. No ejecuta UPDATE/DELETE de datos, no crea viajes, no aplica backfill. Registros físicos históricos sin vínculo no se clasifican por suposición; su acceso restrictivo corresponde a T07.

La FK del decisor usa `ON DELETE RESTRICT` para conservar la referencia de auditoría: un usuario con decisiones debe desactivarse, no borrarse. La FK del artículo vinculado también restringe eliminación; no añade cascadas. No se añade una API para editar/eliminar artículos aprobados; T04 debe conservar el contenido decidido.

## Requisitos y comprobaciones de Jean

1. Respaldar según el procedimiento operativo y confirmar base, organización de pruebas y versión PostgreSQL de destino. Revisar bloqueos y ventana: el DDL toma locks de tablas, con `lock_timeout=5s` y `statement_timeout=60s`; un timeout exige diagnosticar antes de reintentar.
2. Confirmar las estructuras de SQL 64 y las relaciones vigentes: `tbl_app_users.customer_id`, solicitudes/items/files, pedidos con `customer_id`, guías con `order_id/route_id/organization_id`, viajes y compañías con `organization_id`. No reejecutar SQL 64 ni su rollback para preparar esta entrega.
3. Verificar solo lectura antes de aplicar: estados y metadatos, referencias y asignaciones; no corregir datos reales automáticamente. Las filas anteriores a 67 no se validan retroactivamente contra la asignación actual del autor. Una nueva escritura incoherente será rechazada.
4. Confirmar que 67 sigue libre y revisar `schema_migrations`. SQL 65 (vista de pendientes) y 66 (rechazo físico) son entregas separadas; no son dependencias DDL de 67. El código que use rechazo físico necesita 66 antes de activarse.
5. Validar primero en staging controlado por Jean con su versión PostgreSQL, permisos reales y auditoría. Las pruebas locales no certifican IAM, RLS, triggers globales, locks de Aurora ni concurrencia entre conexiones.

Consultas orientativas de solo lectura para Jean:

```sql
select version();
select status, count(*) from public.tbl_return_requests group by status;
select table_name, column_name, data_type from information_schema.columns
where table_schema='public' and table_name in
 ('tbl_return_requests','tbl_returns','tbl_dispatch_guides','tbl_routes')
order by table_name, ordinal_position;
select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid in
 ('public.tbl_return_requests'::regclass,'public.tbl_returns'::regclass);
```

## Orden de ejecución reservado a Jean

Primero expandir esquema; después publicar consumidores T04/T07 cuando estén terminados y verificados. No activar endpoints que referencien columnas nuevas antes del DDL. El SQL de captura y lectura anterior sigue funcionando con las columnas nuevas y el estado inicial anterior.

Desde la raíz TMS, exclusivamente Jean, con el archivo de entorno autorizado del destino:

```powershell
node --env-file=.env.local scripts/run-migration.mjs sql/67_roles_solicitudes_devolucion.sql --execute
```

El runner sin `--execute` **también conecta y ejecuta DDL** antes de revertir: no es un análisis local ni está autorizado para el agente contra la BD compartida. Esta tarea no lo utilizó. SQL 67 empieza con `begin;` antes del encabezado para que las expresiones del runner retiren correctamente la transacción interna. Se verificó el rollback de la transacción exterior en memoria.

Después, Jean debe comprobar columnas/constraints/triggers/índice, conteos e identidad de filas previas y una operación sintética aislada en staging; comprobar captura anterior, aprobación con actor, rechazo con motivo y vínculo coherente. Aprobar no crea devolución física ni recepción. No introducir fixtures de esta suite en Aurora.

## Rollback sin pérdida de datos

[Rollback 67](../../sql/67_roles_solicitudes_devolucion_rollback.sql) solo retira columnas vacías y objetos de 67. Bloquea escrituras durante la comprobación y **rechaza toda la operación** si hay decisiones, metadatos o vínculos nuevos. No borra esos registros para permitir volver atrás. No usa CASCADE. Si otros objetos dependen de las columnas, PostgreSQL impide retirarlas y revierte la transacción.

Jean debe detener primero consumidores nuevos y verificar ausencia de uso. Solo entonces:

```powershell
node --env-file=.env.local scripts/run-migration.mjs sql/67_roles_solicitudes_devolucion_rollback.sql --execute
```

Si ya hubo uso, conservar el esquema y recuperar la aplicación compatible; preparar una corrección aditiva con Jean. No ejecutar el rollback de SQL 64: puede borrar solicitudes/evidencias.

El runner conserva el registro de la migración forward aunque se aplique su rollback. Tras revisar checksums, estado y autorización, Jean necesitaría `--force` para reaplicar el mismo forward; de otro modo el runner lo omite. Una repetición del rollback registrada también se omite sin `--force`. No editar ni eliminar registros del historial para ocultarlo.

## Verificación local reproducible

Suite: [tests/sql/67_roles_solicitudes_devolucion.test.mjs](../../tests/sql/67_roles_solicitudes_devolucion.test.mjs). Crea exclusivamente `new PGlite('memory://')`, no lee `.env` ni acepta URL de conexión. Las tablas base son fixtures mínimos; solicitudes/items/files usan el DDL real de 64. Verifica también SQL real de captura/consulta y de contracamión mobile.

Instalación opcional del motor de prueba en Temp, sin modificar dependencias de la aplicación ni ejecutar scripts de instalación:

```powershell
npm install --prefix "$env:TEMP/tms-t03-postgres-tools" --no-save --package-lock=false --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.16
node --test tests/sql/67_roles_solicitudes_devolucion.test.mjs
```

Por defecto usa ese módulo en Temp; `TMS_T03_PGLITE_MODULE` permite indicar otra ruta local del módulo. La prueba nunca toma esa variable como conexión de BD. Motor observado: **PostgreSQL 18.6, PGlite 0.5.16**; no equivale a verificar la versión/configuración de Aurora. Referencias del motor: [PGlite](https://pglite.dev/docs/) y [API](https://pglite.dev/docs/api).

Resultados y límites: [evidencia T03](auditoria/2026-11-12/t03-verificaciones.json). RED confirmó ausencia de `decided_by`; GREEN comprueba compatibilidad, estados, integridad, idempotencia y rollback. No se realizaron llamadas a AWS ni conexiones a BD externa.
