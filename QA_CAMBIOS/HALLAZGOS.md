# Hallazgos TMS

Corte: 27/11/2026. P1: resolver antes de continuar los fixtures afectados; P2: bloqueo funcional o cobertura pendiente; P3: mejora por confirmar. Evidencia local bajo `.test/pruebasGenerales/`. No se han realizado pruebas adicionales para preparar esta carpeta.

## TMS-QA-001 — P1 — PENDIENTE: limpieza del último fixture HTTP móvil

**Evidencia:** `qa-mobile-http.json`, `qa-mobile-http-s3.log`, `qa-mobile-http-s3.exitcode.txt=1`. Marcador exclusivo `QAFL-20261127-HTTP-590570`.

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

**Observado:** `SOL-2026-11-0003` tiene snapshot congelado sin presentation; la parada collection histórica no acredita asignación V2. La solicitud completa de TMS-QA-002 solo probó creación. La recepción HTTP de contracamión no sustituye recolecta V2.

**Dependencia:** TMS-QA-002 y coordinación con MOB-QA-002. En entorno seguro, recorrer solicitud completa, planificación, asignación V2, aparición en Tracking, cantidades/motivos/evidencias, entrega a almacén y recepción. Comprobar bloqueo y liberación de liquidación, recarga e idempotencia. No alterar snapshots históricos. Aceptación: IDs y resultados de cada etapa, persistencia real y retiro/retención compatible.

## TMS-QA-005 — P2 — PENDIENTE: cierre del lote histórico

**Evidencia:** manifiesto y sección de inventario de `pruebaFlujoGeneral.mjs`, originales `.test/pruebaFlujoGeneral.*`. Lote `QAFL-20261127`, viajes `QAFL-20261127-04` y `QAFL-20261127-T-1`. No se certifica limpieza.

**Acción:** coordinar MOB-QA-001 antes del retiro. Descubrir descendientes propios de solicitudes, formularios, recolectas, tracking, liquidaciones y proformas. El helper histórico tiene límites por revisar: tablas no previstas, orígenes por request_id, claves compuestas, tracking_last_positions sin id e IDs de liquidación de texto. No ejecutar `clean` sin un `clean-check` válido. No usar scripts genéricos de seeds para retirar este lote. Conservar auditoría e historial inmutable. Aceptación: manifiesto reconciliado, cola propia controlada, ausencia por ID o residuos justificados, sin efectos ajenos.

## TMS-QA-006 — P3 — PENDIENTE DE CONFIRMAR: fallos históricos de interfaz

El informe original conserva `Failed to fetch` al emitir liquidación y un aviso de orden de hooks previo a recargar. Los servicios estaban caídos en parte de esa secuencia; posteriormente se completaron emisión y reliquidación. No hay evidencia suficiente para atribuir hoy un bug vigente. Reproducir de forma segura con servicios disponibles antes de proponer cambios. El desglose extendido tampoco quedó certificado. No emitir de nuevo para investigar sin revisar estado e idempotencia.

## Corregidos o comprobados; no reabrir sin regresión

- Moneda y proformas: histórico confirmó reemplazo de `LIQ-CR-022` por `LIQ-CR-023`, una vigente de 50000 CRC y un ítem en `PRO-CR-009`. Se integró Josef conservando formato monetario entrante y diseño local. Fase 2 sigue bloqueada, no confundir con asignación.
- Saldo/409: corrección local en backend y cliente; edición solo para `RETURN_BALANCE_EXCEEDED`; otros 409, red, 408 y 5xx conservan idempotencia. Evidencia rojo/verde, 43 regresiones aprobadas.
- Correcciones locales de pruebas SQL, mapa físico de tablas, aria-pressed y tzdata de desarrollo Windows. No son cambios de permisos ni de zona horaria de países.
- Web: 1932 aprobadas/19 omitidas; backend: 1014/3; backend móvil: 172/23; salida 0 en registros finales. Tipos TMS aprobados. Son resultados del árbol local, no del remoto ni del despliegue.
- Bucket local corregido y API reiniciada: última corrida prueba S3 real, tres evidencias, entrega/cierre, replay, recepción y pending_returns 1→0. El bloqueo antiguo por bucket quedó superado. La limpieza sigue fallida (TMS-QA-001).

Las correcciones de código locales no están incluidas en la publicación documental. Los informes antiguos que aún dicen «falta reiniciar/subir» quedaron superados por `qa-mobile-http-s3.log`.
