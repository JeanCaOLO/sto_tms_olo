# Estado del agente corrector

Inicio de sesión **EN CURSO** desde 2026-11-27 17:16:02 -04:00.
Identificador de sesión: 01a21ec4-ada0-7780-bbb5-07bf97c52427.
Entorno: Windows y PowerShell, con clon TMS de Josef. Rama de código: josef (2f47c06775bfef382bf6a32b2c3b55c58b6f9525).
Canal de coordinación: origin/dylan-tarifas, base 79158744d31e76f870d03eadd8a7fa6c4e9b1137.

| ID | Estado | Responsable | Inicio real | Cambios y pruebas | Bloqueo / siguiente paso |
|---|---|---|---|---|---|
| TMS-QA-001 | LISTO PARA RETEST | Corrector | 2026-11-27 17:16:02 -04:00 | Acceso retirado y limpieza probada en PostgreSQL aislado. | Retest independiente. Jean decide sobre la limpieza del fixture en Aurora. |
| TMS-QA-007 | LISTO PARA RETEST | Corrector | 2026-11-27 18:08:35 -04:00 | Consulta corregida y verificada en PostgreSQL. | Repetir inicio y replay del flujo V2 en el entorno aislado del probador. |

El retest y la aprobación humana permanecen pendientes.

## TMS-QA-001 — diagnóstico del 2026-11-27 17:22:40 -04:00

- Consulta con `rtk proxy python -`, Aurora en transacción `BEGIN READ ONLY` y cierre con `ROLLBACK`, salida 0. Los dos usuarios QA siguen activos y asociados a sus credenciales. Existen dos credenciales y el chofer QA está vinculado a uno de esos usuarios.
- Una devolución coincide con el pedido, la guía y una de las líneas publicadas. Coincidencias en esa fila por ruta directa: 0. El probador confirmó en 2321bec que tbl_returns carece de route_id. El helper omite el DELETE al buscar esa columna. La devolución recibida 954aed29-67ce-439d-9f3d-03f01610f846 conserva la referencia a la línea. El error previo de `tbl_returns_order_item_id_fkey` consta en HALLAZGOS.
- Persisten tres referencias de evidencia. Las claves coinciden con el marcador, el pedido, la guía y la ruta del fixture. `aws s3api head-object` devolvió salida 253 para foto de factura, foto de devolución y firma por falta de credenciales disponibles en esta sesión. La existencia de los objetos sigue sin verificar.
- Cambios: solo `QA_CAMBIOS/ESTADO_AGENTE.md`. Sin cambios de código, datos ni objetos. El generador no se ejecutó.
- El probador debe confirmar el fin de uso de ambas cuentas. Jean debe coordinar el retiro por los IDs publicados y verificar que queden inactivas y sin sesiones utilizables.
- El probador debe compartir el helper original y su error sanitizado. El corrector preparará la regresión en BD aislada. Antes de operar sobre S3, el helper debe validar el manifiesto y descubrir dependencias por línea, guía y ruta. El retiro en BD debe respetar restricciones e historial. Tras confirmar y verificar la transacción SQL, puede ejecutarse el retiro autorizado en S3 por clave. Registrar el resultado por objeto para reintentar errores de S3 sin repetir el retiro SQL.
- Retest independiente: verificar estado de las cuentas y sesiones por ID. Reproducir en BD aislada una devolución por guía y línea omitida por ruta directa y confirmar que una dependencia bloqueante impide tocar S3. Comprobar las tres claves de evidencia con el acceso autorizado.
- Mobile: pendiente lectura y acuse en `origin/QA`. `git ls-remote` salió con 128 al pedir autenticación en TRACKING_TMS. La base `db3fc68` no está en el clon local.

## TMS-QA-001 — reanudación 2026-11-27 17:38:30 -04:00

El probador confirmó en 913c3e0 que las dos cuentas QA ya no se usan y entregó el helper sanitizado. Su consulta S3 del commit 7fed04a verificó que no quedan versiones ni marcadores de borrado para las tres claves exactas. Se retoma el retiro de acceso por los IDs publicados, la inspección de dependencias y la corrección local del helper. No se recreará el fixture ni se intervendrá la cola histórica de Tracking.

## TMS-QA-001 — listo para retest 2026-11-27 17:45:59 -04:00

- Causa: el helper omitía tbl_returns porque no tiene route_id. La devolución referenciaba la línea del pedido y la FK rechazaba el borrado. El helper ya había eliminado las tres claves S3 cuando SQL revirtió. El probador confirmó cero versiones y marcadores en 7fed04a.
- Acceso QA: desactivamos las dos cuentas exactas y revocamos una sesión móvil en una transacción, con salida 0. La verificación posterior dio 2 cuentas inactivas y 0 refresh vigentes. La consulta de auditoría registró 2 eventos de la baja. La comprobación independiente del probador en 36b37d6 confirmó además 0 credenciales y 0 scopes. Se conservan las cuentas y el historial.
- Corrección local: scripts/sandbox/tms_qa_001_cleanup.sql verifica propiedad, conteos y FKs entrantes por línea, guía, ruta y otros IDs propios. Rechaza dependencias fuera del manifiesto, incluso CASCADE o SET NULL. Retira las filas en orden explícito con los triggers normales. La transacción queda abierta para revisión y rollback o confirmación explícita por Jean. No contiene operaciones S3.
- Comprobaciones: probes de solo lectura con rtk proxy python -, salida 0. Se inspeccionaron 41 FKs hacia entidades raíz y los 10 selectores del manifiesto dieron los conteos esperados, 15 filas. Regresión con rtk proxy node $env:TEMP/tms-qa-001-isolated-pg/cleanup-regression.cjs, salida 0 en PostgreSQL en memoria. Reprodujo la FK, el aborto con un hijo adicional, el rollback y el commit de prueba de 15 filas, conservando un pedido ajeno y las dos cuentas, con trigger de auditoría.
- Retest: en PostgreSQL aislado, repetir la regresión y comprobar la dependencia bloqueante, ROLLBACK y las 15 filas. Antes de decidir sobre Aurora, Jean debe revalidar el inventario y que las tres claves exactas sigan ausentes. Si autoriza el ensayo en Aurora, usar una sesión dedicada y terminar con ROLLBACK hasta revisar todos los conteos. Confirmar solo tras esa revisión y volver a consultar los IDs, cuentas y auditoría en solo lectura. Si hubiera objetos reaparecidos, detenerse y reconciliar el manifiesto por clave antes de decidir sobre S3.
- El SQL y la regresión están en el equipo del corrector. La limpieza de filas en Aurora y el retest independiente siguen pendientes. El generador del fixture no se ejecutó. Este commit publica solo el estado.

## Ajuste de saldos de Liquidaciones y Proformas — listo para retest

El formateador común presentaba subtotales de monedas históricas junto al saldo operativo. El cambio local suma solo los registros en la moneda operativa y muestra un total. Venezuela usa USD y Costa Rica CRC. Los comprobantes conservan la moneda original. Suite focal de Vitest: 148 pruebas, salida 0. npm run type-check: salida 0. Retest: usar registros USD y VES para Venezuela y verificar que el saldo muestre solo USD y que el detalle histórico siga intacto. Revisar CRC en Costa Rica. Código local, sin publicación.

## TMS-QA-007 — inicio 2026-11-27 18:08:35 -04:00

Sesión del corrector en Windows, copia de código TMS josef en 2f47c06 y canal documental origin/dylan-tarifas en 73fd183. Se retoma el inicio de viaje antes de MOB-QA-001 porque el hallazgo bloquea el recorrido V2. El contenedor y la cola del probador quedan a su cargo.

## TMS-QA-007 — listo para retest 2026-11-27 18:11:34 -04:00

- Causa: UNFINISHED_ROUTE_SQL consultaba la tabla física de asignaciones, que no tiene route_id. PostgreSQL rechaza la consulta incluso sin asignaciones, antes de que start_trip pueda crear una ruta.
- Corrección local en backend/mobile/src/mobile_api/sql.py, base 2f47c06. La subconsulta de recolecta usa vw_return_collection_assignments, igual que las consultas hermanas. Se conservan los filtros de organización, chofer, estados del plan y mercancía pendiente de entrega. La corrección no requiere migración.
- Reproducción y prueba: rtk proxy node .test/tms-qa-007-retest/check-start-contract.cjs . --expect-original comprobó 42703 antes del cambio y devolvió salida 0 al detectar el error esperado. La ejecución sin esa opción pasó 12 comprobaciones de rutas y estados en PostgreSQL aislado con datos sintéticos, salida 0. rtk proxy python -m pytest backend/mobile/tests -q dio 172 aprobadas y 23 omitidas, salida 0. La consulta corregida también compiló en Aurora con UUID cero, transacción READ ONLY y ROLLBACK, salida 0, sin iniciar viajes ni tocar datos.
- Retest del probador: en la constante indicada, usar la vista vw_return_collection_assignments como origen del alias a, conservando el resto de la consulta. Confirmar la compilación y volver a probar inicio sin recolecta, inicio con recolecta asignada, bloqueo cuando un viaje anterior lleva mercancía pendiente y replay que devuelve la misma ruta. Continuar la recogida, entrega y recepción de TMS-QA-004 en su entorno PostgreSQL/PostGIS aislado.
- El código y el paquete .test/tms-qa-007-retest.zip existen en el equipo del corrector. Git apply --check verificó que el parche aplica al árbol del canal documental. Este commit publica solo el estado. El flujo integral y la aprobación humana quedan pendientes.
