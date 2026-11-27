# Hallazgos TMS

Corte: 27/11/2026. P1: resolver antes de continuar los fixtures afectados; P2: bloqueo funcional o cobertura pendiente; P3: mejora por confirmar. Evidencia local bajo `.test/pruebasGenerales/`. No se han realizado pruebas adicionales para preparar esta carpeta.

## TMS-QA-001 — P1 — PENDIENTE: limpieza del último fixture HTTP móvil

**Responsable y coordinación:** el corrector reclamó el ID a las 17:16:02 -04:00 y publicó diagnóstico/bloqueos en e6f41525. El probador terminó el uso de las dos cuentas del fixture HTTP y aporta el extracto original del helper, el error y el resultado S3 en [TMS_QA_001_HANDOFF.md](TMS_QA_001_HANDOFF.md). El corrector mantiene su estado en ESTADO_AGENTE; el probador no ejecutará limpieza en paralelo.

**Retiro de acceso completado por el probador el 27/11/2026 a las 21:40:38 UTC (17:40:38 -04:00):** las dos cuentas temporales quedaron inactivas; credenciales y scopes eliminados; refresh tokens revocados. Se comprobó mediante una segunda transacción de solo lectura: 2 usuarios inactivos, 0 credenciales, 0 scopes y 0 refresh sin revocar. La devolución, ruta y tres evidencias siguen conservadas. No se eliminaron usuarios/historial ni se cambiaron permisos de roles, cuentas ajenas o credenciales de configuración. Se ejecutó únicamente el retiro del acceso QA que ya había terminado su uso, autorizado como parte del cierre de pruebas. Evidencia local `qa-mobile-retirar-acceso.py` y `.json`, salida 0. No se dispone de los access tokens originales para retest HTTP; el contexto móvil tiene caché máxima de 60 segundos según auth.py. Esto cierra el pendiente de acceso, no la limpieza del fixture ni TMS-QA-001 completo. Las observaciones anteriores de cuentas activas son históricas y quedan superadas por esta comprobación.

**Retest independiente parcial de la entrega e5d53575:** SQL recibido sin cambios y mismas aserciones del corrector, sustituyendo únicamente el adaptador PGlite por `pg` instalado contra PostgreSQL 17 local (`qa_cleanup`). Salida 0: se reprodujo la FK original, se bloqueó un hijo CASCADE ajeno al manifiesto, ROLLBACK restauró filas/auditoría y COMMIT sintético retiró 15 filas conservando las dos cuentas y un pedido ajeno. Evidencia `qa-001-retest.log` y `.exitcode.txt`. Se usaron tablas simplificadas de la regresión, no el esquema compartido completo. No se ejecutó limpieza ni COMMIT contra Aurora. Dos tests existentes de autenticación por usuario desactivado/caché también pasaron (2 passed, 28 deselected; salida 0), con mocks. TMS-QA-001 no se cierra por completo: falta validar el procedimiento sobre el esquema completo y la decisión de Jean sobre el residuo compartido.

**Retest posterior con esquema completo: APROBADO EN AISLADO.** Se ejecutó el mismo SQL original en PostgreSQL 17/PostGIS con el esquema clonado y un fixture sintético separado. Pasaron 5 comprobaciones: retiro transaccional de las filas del manifiesto; ROLLBACK restaura fixture y auditoría; COMMIT local conserva el pedido V2 ajeno; dos cuentas inactivas preservadas; auditoría real de triggers conservada. Evidencia `qa-001-retest-full-schema.cjs/.json`, salida 0. Esto supera la limitación de las tablas simplificadas en el párrafo anterior. No se operó contra Aurora ni S3. Queda pendiente únicamente la decisión/ejecución compartida de Jean y su verificación posterior por IDs; no confundir el retest aprobado del SQL con ausencia del residuo compartido.

**Revalidación 27/11, 17:16–17:19 America/Caracas:** probe con `SET TRANSACTION READ ONLY`, salida 0. Se confirmaron dos usuarios activos, dos credenciales, el resto del inventario y tres filas de evidencias. La tabla `tbl_returns` **no tiene columna route_id**: el helper omite su DELETE al consultar information_schema. Queda la devolución recibida `954aed29-67ce-439d-9f3d-03f01610f846`, ligada a la guía y línea propias. La causa ya no es hipótesis. Revisar además FKs desde plan_stops, return_form_items, return_incidents, return_incident_resolutions y return_collection_results antes de retirar. No se ejecutó ninguna mutación durante esta revalidación. Evidencia local nueva: `qa-reanudacion-probe.py` y `.json`. Prioridad inicial del corrector: retirar acceso de esas dos cuentas QA y preparar limpieza compatible; no afirmar que ya ocurrió.

**Evidencia:** `qa-mobile-http.json`, `qa-mobile-http-s3.log`, `qa-mobile-http-s3.exitcode.txt=1`. Marcador exclusivo `QAFL-20261127-HTTP-590570`.

**Comprobación S3 posterior, solo lectura:** cuenta y propietario verificados; `list-object-versions` de cada clave exacta dio 0 versiones y 0 delete markers para los tres client_id del informe. Las tres filas seguían en BD al consultar el fixture. Se confirma el estado parcial tras la limpieza fallida: referencias QA conservadas y objetos propios ausentes. Evidencia `qa-reanudacion-s3.json`, salida 0. No se subieron, borraron ni restauraron objetos durante esta comprobación. Coordinar con el corrector que tomó este ID antes de repetir el probe o intervenir en el lote.

**Observado:** pasaron las 30 comprobaciones funcionales HTTP, incluida subida S3 real, persistencia e idempotencia de tres evidencias, contracamión, entrega/cierre y recepción. La limpieza SQL se revirtió: `tbl_returns_order_item_id_fkey` impide borrar líneas referenciadas. Los conteos `removed_children` corresponden a una transacción revertida; no prueban retiro. El helper intenta borrar objetos S3 antes del SQL: comprobar si quedaron referencias a objetos ya retirados. No afirmar ausencia sin consultarla.

**Acción:** inspeccionar relaciones por guía y línea, además de ruta. Hipótesis por confirmar: las devoluciones no se encuentran mediante el filtro exclusivo por route_id. Preparar un plan por IDs con prevalidación, transacción y verificación posterior; preservar auditoría. Revisar primero si las dos cuentas QA siguen activas y retirar exclusivamente su acceso autorizado. No reejecutar el generador de fixtures ni ampliar selectores a otros usuarios, fechas o países.

**Inventario QA:**

| Entidad | IDs |
|---|---|
| Usuarios | `48f64d51-170b-4272-89b9-79f1c08a935b`, `fb79e737-e79b-4276-abe3-15794f7bbfc0` |
| Credenciales | `fedc54e5-a7dd-4121-b21b-1971262d0632`, `89192dcf-f19b-4d12-9168-79cd42964bbd` |
| Chofer | `1997e511-f3ff-44ed-8931-cb3da19b2d0e` |
| Vehículo | `7a082387-2966-43b1-9e34-495b5a73f89c` |
| Pedido | `c0a25168-0fb4-4c52-b5c9-b942bbd25957` |
| Líneas | `c365ee15-96dd-41a6-86ee-d8be0a11363a`, `0ae40778-4475-4da8-b90e-28eff1768057` |
| Ruta | `2e345292-5315-4e2b-a37d-d156dc4bf288` |
| Guía | `dc64a19b-4a0f-4184-9330-45b11bd8ce74` |

Las tres claves de objetos están en `qa-mobile-http.json`, restringidas al pedido y marcador indicados. Descubrir y comprobar propiedad de todos sus descendientes antes de actuar.

**Aceptación:** acceso QA retirado y comprobado; dependencia causante identificada; retiro compatible de registros/objetos o residuo legítimo documentado; ningún registro ajeno afectado. El helper debe detectar dependencias antes de operaciones irreversibles y demostrar el caso con una BD aislada. La BD y S3 no comparten una transacción: documentar recuperación ante fallo parcial.

## TMS-QA-002 — P1 — BLOQUEADO: historial inmutable de solicitud QA

**Evidencia:** `qa-solicitud-http.json`, `qa-solicitud-retirar-acceso.py`, migración `sql/76_return_request_origin_balance.sql`. El trigger `tr_return_origin_76` impide UPDATE/DELETE: `El origen operativo es historial inmutable`.

**Observado:** saldo 3 sobre 2 rechazado con 409 y `RETURN_BALANCE_EXCEEDED`; creación 201, replay 200, una solicitud y snapshot completo (`UNIDAD`, 5 kg, 0,0200 m³). No hubo planificación ni recolecta. La limpieza del historial se revirtió. El usuario está inactivo, sin scopes ni credencial, verificado en la prueba anterior.

**Propiedad:** marcador `QAFL-20261127-SOL-ff8198`; pedido `cac89599-ebe6-4cab-afb3-13d0345ced13`; línea `745769b0-7528-44c9-92d0-4824a493080f`; solicitud `f4838b9e-e22a-5c71-b0b4-1a876a3bd334`; usuario inactivo `61898cdd-3b5d-4c88-92b4-55187c3a17d0`.

**Acción y aceptación:** preparar pruebas en BD aislada o procedimiento compatible de retención/retiro para Jean, con validación y rollback. No desactivar el trigger ni modificar historia para facilitar QA. No crear nuevas solicitudes persistidas en BD compartida mientras no exista un procedimiento seguro. El script actual aborta al detectar la restricción; conservar esa protección.

## TMS-QA-003 — P2 — BLOQUEADO: fase 2 con rol Liquidador

**Evidencia:** `qa-liquidador.json`, `cleanup=removed_and_verified`. Login 200 y alcance solo Costa Rica; administración de usuarios 403 correcto. Aprobar fase 2 devuelve 403: `Tu rol no tiene permiso para "edit" en "tarifas.proformas".`

**Caso:** `PRO-CR-009` / `pro_mwzc4m4i_sc5zx3`, fase pendiente `prp_mwzc4m4i_klngve`, con `LIQ-CR-023` / `stl_mwzc4gvr_dwejoc` por 50000 CRC. Fase 1 ya aprobada. La cuenta temporal se eliminó; no reutilizarla.

**Acción:** Jean debe revisar la política del rol y su configuración, según `sql/46_proformas.sql`. No conceder permisos para forzar el caso ni sustituirlo por SuperAdministrador. Después, cuenta QA autorizada y retest de fase 2 sin pagos ni correos. Aceptación: autorización esperada y transiciones/auditoría correctas; retirar la cuenta temporal.

## TMS-QA-004 — P2 — PENDIENTE: recorrido integrado de recolecta V2

**Avance aislado del 27/11:** se preparó PostgreSQL 17 con PostGIS, solo esquema y metadatos; sin datos reales. Los handlers y SQL vigentes crearon una solicitud sintética completa, aceptaron su replay y asignaron una recolecta V2 real mediante `recolectas.agendar`. Se comprobaron snapshot completo y una asignación. El inicio del viaje falló antes de continuar: TMS-QA-007. Evidencia local `qa-v2-isolated-flow.py` y `.json`. No se ejecutó optimizador completo, HTTP/UI ni subida de evidencias en ese flujo. No cerrar el recorrido por estas comprobaciones parciales.

**Retest posterior: integración de backend APROBADA EN AISLADO.** Tras aplicar localmente la línea entregada en 46c69524 para TMS-QA-007, una BD nueva `qa_v2_fixed` completó 14 comprobaciones con handlers y SQL reales: solicitud/replay, snapshot, asignación V2, inicio/replay, guías delivery/collection, bloqueo inicial, recogida sin recepción implícita, bloqueo de mercancía en tránsito, entrega a almacén con cierre, replay de entrega, bloqueo hasta recepción, recepción/replay con liberación y replay de recogida en viaje cerrado. Salida 0 en `qa-v2-isolated-flow.json`. El fallo anterior queda en `qa-v2-isolated-flow-start-42703.json`. Límites: plan base sintético, sin optimizador completo; handlers directos, sin HTTP/UI; evidencias preinsertadas como metadatos sintéticos, sin cámara/S3. No certificar por esto el recorrido de pantalla de MOB-QA-002 ni un despliegue. No se crearon solicitudes compartidas.

**Observado:** `SOL-2026-11-0003` tiene snapshot congelado sin presentation; la parada collection histórica no acredita asignación V2. La solicitud completa de TMS-QA-002 solo probó creación. La recepción HTTP de contracamión no sustituye recolecta V2.

**Dependencia:** TMS-QA-002 y coordinación con MOB-QA-002. En entorno seguro, recorrer solicitud completa, planificación, asignación V2, aparición en Tracking, cantidades/motivos/evidencias, entrega a almacén y recepción. Comprobar bloqueo y liberación de liquidación, recarga e idempotencia. No alterar snapshots históricos. Aceptación: IDs y resultados de cada etapa, persistencia real y retiro/retención compatible.

## TMS-QA-005 — P2 — PENDIENTE: cierre del lote histórico

**Novedad de Tracking:** el usuario autorizó el reintento de las tres acciones históricas de la primera parada. Se intentó y la imagen web falló por blob ausente (`ERR_FILE_NOT_FOUND`), antes de persistir. Cotejo BD: 0→0 evidencias y eventos de esa guía; parada pendiente y ruta 1/3 sin cambio. MOB-QA-001 en mobile/QA contiene reproducción y aceptación. No limpiar ese lote ni su cola hasta coordinar recuperación/retest; el permiso de reintentar no autoriza descartarla automáticamente.

**Evidencia:** manifiesto y sección de inventario de `pruebaFlujoGeneral.mjs`, originales `.test/pruebaFlujoGeneral.*`. Lote `QAFL-20261127`, viajes `QAFL-20261127-04` y `QAFL-20261127-T-1`. No se certifica limpieza.

**Acción:** coordinar MOB-QA-001 antes del retiro. Descubrir descendientes propios de solicitudes, formularios, recolectas, tracking, liquidaciones y proformas. El helper histórico tiene límites por revisar: tablas no previstas, orígenes por request_id, claves compuestas, tracking_last_positions sin id e IDs de liquidación de texto. No ejecutar `clean` sin un `clean-check` válido. No usar scripts genéricos de seeds para retirar este lote. Conservar auditoría e historial inmutable. Aceptación: manifiesto reconciliado, cola propia controlada, ausencia por ID o residuos justificados, sin efectos ajenos.

## TMS-QA-006 — P3 — PENDIENTE DE CONFIRMAR: fallos históricos de interfaz

El informe original conserva `Failed to fetch` al emitir liquidación y un aviso de orden de hooks previo a recargar. Los servicios estaban caídos en parte de esa secuencia; posteriormente se completaron emisión y reliquidación. No hay evidencia suficiente para atribuir hoy un bug vigente. Reproducir de forma segura con servicios disponibles antes de proponer cambios. El desglose extendido tampoco quedó certificado. No emitir de nuevo para investigar sin revisar estado e idempotencia.

## TMS-QA-007 — P1 — RESUELTO LOCAL, RETEST APROBADO: iniciar viaje falla por columna inexistente

**Resultado posterior:** la corrección entregada por el corrector en 46c69524 cambia únicamente el origen del alias a a `vw_return_collection_assignments`. Se aplicó esa línea al archivo local, que no tenía cambios ajenos. El SELECT pasó contra Aurora en transacción READ ONLY con UUID cero, salida 0; integración V2 sobre esquema completo clonado: 14 comprobaciones aprobadas, incluida creación/replay de ruta con recolecta. Suite afectada: 172 passed, 23 skipped, salida 0 (`retest-v2-mobile-backend.log/.exitcode.txt`). No se publicó código, aplicó migración ni desplegó. El proceso API local ya iniciado puede mantener la constante anterior hasta un reinicio coordinado; esta prueba ejecutó procesos nuevos. La entrega del corrector cubre además 12 casos de estados/bloqueo, cuya ejecución propia se documenta en ESTADO_AGENTE; no se suman como pruebas independientes del probador.

**Responsable:** backend móvil TMS; código `backend/mobile/src/mobile_api/sql.py`, constante `UNFINISHED_ROUTE_SQL`, usada por `start.start_trip`.

**Prueba real:** tras crear y asignar una solicitud V2 en PostgreSQL/PostGIS aislado, iniciar el viaje falla con `column a.route_id does not exist`. Se confirmó además en la BD compartida mediante **solo el SELECT**, en transacción `SET TRANSACTION READ ONLY`, con UUID cero sintéticos: mismo error, SQLSTATE `42703`, salida 1. No se inició ningún viaje ni se modificó dato compartido. Evidencia `qa-v2-start-contract-probe.py/.json`.

**Causa comprobada:** la consulta toma `tbl_return_collection_assignments a` y filtra `a.route_id`. La tabla contiene `attempt_id` y referencia allocation_id, pero no route_id; la vista `vw_return_collection_assignments` sí expone route_id y attempt_id mediante el join con allocations. PostgreSQL resuelve columnas aunque no haya filas, por lo que la condición no depende de encontrar una recolecta previa. No confundir con los fallos de preparación de Docker/PostGIS.

**Acción:** corregir la consulta en su capa responsable, revisar otros usos de la tabla física que requieran columnas de la vista y conservar organización, chofer, estados activos y bloqueo por mercancía pendiente. No requiere alterar el esquema compartido para agregar una columna duplicada. Ver detalles y reproducción en [TMS_QA_007_INICIO_VIAJE.md](TMS_QA_007_INICIO_VIAJE.md).

**Aceptación:** SELECT compila contra esquema real; inicio con/sin recolecta funciona; otro viaje con mercancía sin entregar sigue bloqueado; reenvío devuelve la misma ruta. Regresión sobre PostgreSQL real y retest independiente del flujo V2. No publicar código fuera de QA_CAMBIOS con la autorización actual.

## Corregidos o comprobados; no reabrir sin regresión

- Moneda y proformas: histórico confirmó reemplazo de `LIQ-CR-022` por `LIQ-CR-023`, una vigente de 50000 CRC y un ítem en `PRO-CR-009`. Se integró Josef conservando formato monetario entrante y diseño local. Fase 2 sigue bloqueada, no confundir con asignación.
- Saldo/409: corrección local en backend y cliente; edición solo para `RETURN_BALANCE_EXCEEDED`; otros 409, red, 408 y 5xx conservan idempotencia. Evidencia rojo/verde, 43 regresiones aprobadas.
- Correcciones locales de pruebas SQL, mapa físico de tablas, aria-pressed y tzdata de desarrollo Windows. No son cambios de permisos ni de zona horaria de países.
- Web: 1932 aprobadas/19 omitidas; backend: 1014/3; backend móvil: 172/23; salida 0 en registros finales. Tipos TMS aprobados. Son resultados del árbol local, no del remoto ni del despliegue.
- Bucket local corregido y API reiniciada: última corrida prueba S3 real, tres evidencias, entrega/cierre, replay, recepción y pending_returns 1→0. El bloqueo antiguo por bucket quedó superado. La limpieza sigue fallida (TMS-QA-001).

Las correcciones de código locales no están incluidas en la publicación documental. Los informes antiguos que aún dicen «falta reiniciar/subir» quedaron superados por `qa-mobile-http-s3.log`.
