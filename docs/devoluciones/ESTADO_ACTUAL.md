# Devoluciones — estado reconciliado

**Corte: 2026-11-11. Fuente de estado para el siguiente trabajo.** Alcance: checkout local de `TMS AHORA SI` y sandbox AWS `758837481569`, `us-east-2`. No verifica QA ni producción. Esta revisión no implementó funcionalidades, no desplegó ni aplicó migraciones.

**Restricción confirmada por el usuario:** solo Jean puede desplegar; ni el usuario ni el agente tienen permiso. Conservar datos reales. Pruebas con dobles o datos aislados e identificables; no aplicar migraciones a la BD compartida durante la preparación del código.

**Decisión posterior, 2026-11-12:** D05=A: empresa receptora del contracamión determinada por relación operativa inequívoca del viaje/almacén. Regla de negocio confirmada; relación técnica todavía por comprobar. Esto no constituye nueva auditoría de despliegue/BD ni implementación. D01=A, D02=A, D04=A y la responsabilidad de reasignación de Planificación en D03 también constan en `.test/pendienteCodex.md`.

**T01 comprobado posteriormente el 2026-11-12:** [validación técnica y evidencia](VALIDACION_RELACIONES_ROLES.md), mediante consultas de esquema y conteos en Aurora READ ONLY. Se reutilizan la empresa asignada al Cliente y los scopes operativos existentes. D05 se concreta por pedido de la guía de cada devolución: 71 de 75 viajes y 4 de 6 almacenes comprobados tienen varias empresas; las 29 devoluciones existentes tienen pedido/guía/empresa coherentes. No se modificó data ni se implementaron endpoints; no se repitió la auditoría AWS de despliegue del día 11.

**Definición funcional posterior:** Cliente solicita recolectas con productos/evidencias; Devoluciones aprueba o rechaza solicitudes y registra la recepción física de recolectas y contracamión. La planificación de otro viaje queda fuera de nuestra implementación. Contrato y entrega propuestos: [ENTREGA_PLANIFICACION_RECOLECTAS.md](ENTREGA_PLANIFICACION_RECOLECTAS.md). Queda resuelto quién atiende la bandeja (rol Devoluciones); falta desarrollar esa bandeja y definir el alcance por empresa.

## Cómo interpretar el estado

**T06 implementado y verificado localmente, 2026-11-12:** pesta?a Solicitudes en Devoluciones, separada de recepcion por viajes; filtros de estado/empresa/pais, paginacion, solicitante y detalle con evidencias. Decisiones completas autorizadas, rechazo con motivo, proteccion de reintentos y recarga sin exito falso ante409. Journal de intento por usuario/solicitud sobrevive al cierre del modal y cambio de pesta?a dentro de la pantalla. **114 frontend, 173 backend y 32 SQL memoria pasadas**, tipos0 y build correcto con advertencia existente de chunks grandes. Hallazgo de revision corregido y segunda revision sin regresiones importantes. [Evidencia T06](auditoria/2026-11-12/t06-verificaciones.json). Sin AWS/BD externa/DDL/despliegue. T07/T08/T09 siguen pendientes; no declarar el modulo completo ni publicado.


**T05 implementado y verificado localmente, 2026-11-12:** pantalla Cliente con empresa fija consultada por endpoint propio, etiqueta recolecta, nombre obligatorio, clave por envio/reintento, historial y detalle con decision/motivo/evidencias. Fotos/video se renuevan por IDs autorizados; cambio de usuario limpia estado e impide continuar una carga anterior. **93 pruebas frontend, 172 backend y 30 SQL memoria pasadas**, TypeScript sin errores y build correcto (advertencia existente de chunks grandes). Revision independiente sin hallazgos importantes. [Evidencia T05](auditoria/2026-11-12/t05-verificaciones.json). No publicado; sin AWS/BD externa ni DDL en esta etapa. Siguiente T06, bandeja Operador.


**T04 implementado y verificado localmente, 2026-11-12:** captura con nombre obligatorio, empresa/autor autenticados, idempotencia opcional por envio, bandeja paginada con scopes/paises, detalle y evidencias autorizados, aprobacion/rechazo atomicos y auditados. Cinco rutas nuevas preparadas con authorizer CUSTOM. **168 pruebas backend y 29 SQL en memoria pasadas**, revision independiente sin hallazgos. [Contrato API](CONTRATO_API_SOLICITUDES.md) y [evidencia](auditoria/2026-11-12/t04-verificaciones.json). No se accedio a AWS/BD externa, no hubo DDL ni despliegue en T04. Falta T05/T06 para pantallas y validar concurrencia multiconexion/IAM/E2E con Jean. La clave idempotente debe enviarla T05; clientes anteriores sin clave no garantizan deduplicar reintentos.


**SQL 67 aplicada posteriormente, 2026-11-12:** por autorizacion expresa del usuario para esta migracion concreta, dry run correcto y luego COMMIT en Aurora sandbox `db-tms-olo` / `tms_olo`, PostgreSQL 17.7. Registro `schema_migrations` a las `2026-11-12T12:57:43.053Z`; checksum verificado. Conteos y hashes antes/despues iguales: 29 devoluciones, 0 solicitudes/items/files; sin datos de prueba, decisiones ni vinculos nuevos. Columnas, constraints, dos triggers e indice verificados. [Evidencia de Aurora](auditoria/2026-11-12/t03-aurora-sql67.json). Esta excepcion no autoriza otras migraciones ni despliegues; estos siguen reservados a Jean. T04 continua pendiente.


**T03 preparado y verificado localmente el 2026-11-12:** [SQL 67 y entrega a Jean](ENTREGA_JEAN_SQL67.md) amplían estados/metadatos de decisión y añaden el vínculo nullable de artículo solicitado con devolución física. No convierten solicitudes anteriores ni crean viajes/recepciones. **18 pruebas pasadas** con datos sintéticos en PostgreSQL 18.6 en memoria (PGlite 0.5.16): SQL anterior compatible, integridad, idempotencia, datos preservados y rollback que rechaza pérdida de decisiones/vínculos. [Evidencia y límites](auditoria/2026-11-12/t03-verificaciones.json). No aplicado a Aurora ni probado con su versión/permisos/concurrencia; Jean debe verificar staging. Siguiente desarrollo: T04, API autorizada de captura, bandeja, detalle, decisión y evidencias.

**T02 verificado el 2026-11-12:** se corrigió el 503 sin bucket validando configuración antes de inicializar S3 tanto al firmar carga como al comprobar adjuntos; las dos regresiones se observaron primero fallar y luego pasar. La suite focalizada backend dio **83 pasadas**, frontend **59 pasadas**, TypeScript **0 errores** y Vite build correcto con advertencia de chunks mayores a 500 kB. Se declaró `@types/node@26.2.0` directamente y se sincronizaron lockfiles, sin relajar `tsconfig`. [Evidencia T02](auditoria/2026-11-12/t02-verificaciones.json). Esto sustituye los fallos técnicos históricos listados más abajo para el checkout local, no los pendientes de despliegue. No se accedió a AWS/BD ni se aplicaron migraciones en T02.

- **Código**: existe una implementación local; no significa que esté publicada.
- **Verificado**: se obtuvo evidencia concreta, con sus límites indicados.
- **Pendiente de despliegue**: el código o DDL local aún no se refleja en el sandbox.
- **Pendiente funcional / decisión**: falta implementación o definición del negocio.
- **Pendiente E2E**: no se recorrió el flujo real completo con usuarios y dispositivo.

Los requerimientos e historias del 2026-11-05 conservan su fecha de corte. `walkthrough_p2_p6.md` es un reporte histórico: su afirmación de pruebas verdes no sustituye los resultados de esta revisión.

## Revisión posterior al pull de josef

Revisado nuevamente el 2026-11-11 tras el merge `b48928c` en `dylan-tarifas`. La mejora nueva de Devoluciones de `43542ec` agrega miniatura, visor de foto, manejo de imagen vencida y recarga de URL firmada (`PhotoPreview.tsx`). Se conservó junto con el rechazo local al resolver el conflicto en `ReturnLinesTable.tsx`.

La última verificación posterior a esa integración dio **59 pruebas frontend pasadas** (las 54 anteriores y 5 de PhotoPreview) y **compilación Vite correcta**, con una advertencia reportada por el resumen. Compilar con Vite no equivale a aprobar el chequeo TypeScript; no se corrigieron ni reejecutaron en ese pull los 92 errores de tipos ni el fallo backend descritos más abajo.

La consulta AWS posterior al pull sigue mostrando admin modificado el `2026-11-05T21:03:45Z` y `MOBILE_EVIDENCE_BUCKET` vacío. Integrar código local no publicó funciones ni aplicó SQL 65/66. La evidencia de BD y permisos conservada abajo corresponde a la auditoría anterior de esta misma fecha; esta revisión posterior no abrió otro túnel ni volvió a consultar el esquema. La foto en el visor web está implementada, pero **no** la foto dentro del comprobante impreso ni el ciclo interno de solicitudes/recolecta.

## Matriz de código, BD y despliegue

| ID | Capacidad | Código local | Estado real del sandbox / verificación | Próximo paso |
|---|---|---|---|---|
| P2 | Historial en `/mis-devoluciones` | Implementado: pestaña y `listMyRequests()` | No operativo allí: el paquete admin no contiene `admin_return_requests.py` y API Gateway no tiene las tres rutas de solicitudes. El frontend publicado tampoco incluye la ruta `/mis-devoluciones` en su configuración de rutas inspeccionada. | Publicar backend y frontend después de resolver los gates técnicos; probar con rol Cliente. |
| P3 | Origen y motivo en impresión | Implementado en `formDocument.ts` y modal | Las pruebas de lógica frontend pasan. El diseño impreso no fue contrastado visualmente con el PDF. No se verificó esta función en el bundle de página publicado. | QA visual del comprobante; no rehacer origen/motivo. |
| P4 | Rechazo por bodega con motivo | Implementado: endpoint, modal, auditoría y pruebas | **No desplegado**: no existe la ruta de rechazo; el paquete admin no contiene `reject_return`. BD sin `rejection_reason`, `rejected_by`, `rejected_at` ni `fk_return_rejected_by`. | Aplicar 66 por el procedimiento autorizado, desplegar admin y frontend, probar permisos e idempotencia. |
| P5 | Conteo coherente de pendientes | SQL 65 y rollback presentes | **No aplicado**: `vw_return_trips` aún excluye received/rejected/cancelled y por tanto incluye completed como pendiente; recibidas cuenta solo received. | Aplicar 65 y comprobar la vista y los conteos. |
| P6 | País seleccionado en Devoluciones | Implementado en UI, cliente HTTP, backend y pruebas | **Backend no desplegado**: `admin_returns.py` publicado carece del filtro `pais`. El alcance por países del rol y el selector operativo son conceptos diferentes. | Publicar admin y frontend; probar selector y límites de permisos. |
| BD-01 | Recepción y formularios base | SQL 60–62 presentes | Existen columnas de recepción y tablas de formularios consultadas. No se certificó cada detalle de todas esas migraciones. | Conservar; incluir en E2E. |
| BD-02 | Solicitudes de cliente | SQL 64 presente | Existen `tbl_return_requests`, items, files y `tbl_app_users.customer_id`. La restricción de estado solo admite `pendiente_asignacion`. | No reejecutar 64 por suposición; verificar cualquier cambio futuro con migración propia. |
| MOB-01 | Contracamión con foto y artículos | Implementado | `mobile_api/stops.py` de Lambda coincide con el archivo local, normalizando saltos de línea. `ck_tracking_evidence_kind` admite `photo_return`: m08 no es un pendiente actual del esquema. | Probar app → API → S3 → bodega en dispositivo. |
| LIQ-01 | Bloqueo de liquidación | Implementado | `TMS_RETURNS_GATE=on`; `returns_gate.py` publicado coincide con el local. Esto no prueba un flujo E2E. | Mantener; contrastar con vista corregida por 65. |
| S3-01 | Fotos móviles visibles en administración | Implementado, pero falta configuración | Lambda admin tiene `MOBILE_EVIDENCE_BUCKET` vacío. El rol compartido solo tiene política inline de secretos y la administrada de VPC; no hay concesión S3. La política del bucket solo deniega HTTP. | Configurar bucket y conceder lectura mínima sobre `pedidos/*`. |
| S3-02 | Adjuntos de solicitudes desde la web | Firma de carga implementada localmente | Sin rutas admin publicadas; rol sin `PutObject`/`GetObject` sobre `solicitudes/*`. CORS del bucket solo permite POST desde localhost:8081 y localhost:3000. | Corregir permisos y origen web autorizado; desplegar; probar carga/consulta. |

**P4 no implementa una cancelación separada:** la acción nueva guarda `rejected`. Si el negocio requiere una acción que produzca `cancelled`, hay que acordarla; no declarar ambas acciones entregadas por el título histórico del plan.

## Trabajo funcional que sigue abierto

| ID | Pendiente | Tipo / dependencia |
|---|---|---|
| F01 | Bandeja interna para el rol Devoluciones, aprobación/rechazo, transiciones y vinculación con la devolución operativa | Responsable y decisiones definidos; T01 verificó asignación Cliente y scopes del operador. D02=A: decisión comercial completa. Falta implementación; los faltantes físicos de unidades siguen separados del transporte. |
| F02 | Integrar el ciclo de recolecta con Planificación: datos mínimos, parada, capacidad, ejecución y reasignación | Confirmado por el usuario: Planificación identifica las recolectas no realizadas y las asigna a otro viaje (10 asignadas, 5 realizadas, 5 pendientes). Implementación externa; contrato documentado. Las paradas collection existentes no resuelven todo el ciclo. |
| F03 | Validar artículo y cantidad contra pedido y acumulado ya devuelto, tanto en chofer como en solicitudes web | Falta control servidor; decidir tratamiento de artículos manuales fuera del pedido. No limitarlo a un máximo entero genérico. |
| F04 | Avisos al cliente y evolución del estado | Depende de F01; el historial local ya existe, las transiciones y avisos no. |
| F05 | Confirmar catálogo de motivos y verificar visibilidad por usuario | D04=A confirmada: cada Cliente solo ve sus propias solicitudes, incluso dentro de una empresa. Falta asegurar detalle/evidencias con esa regla; catálogo de motivos aún por confirmar. |
| F06 | Mercancía de varias empresas por solicitud/artículo | Futuro condicionado a necesidad; no confundir empresa dueña con transportista. |
| F07 | Foto en el comprobante impreso y contraste visual con PDF | Origen/motivo ya resueltos; decidir inclusión de la foto. `admin_media.py` solo firma `pedidos/*`, no evidencias de `solicitudes/*` para una futura bandeja. |
| F08 | Retención, limpieza de subidas huérfanas, tratamiento de videos grandes | Pendiente operativo / mejora; no bloquea la definición de F01. |
| F09 | Permisos efectivos de rol Cliente, comportamiento al crear usuarios y eliminación del usuario de prueba histórico | Verificar con usuarios autorizados; no se leyó PII ni se borraron usuarios durante esta auditoría. |
| QA01 | Recorrido completo Cliente → solicitud y adjuntos → atención interna; chofer → devolución offline/foto → recepción/rechazo → liquidación | Pendiente; depende de despliegue y de las funciones efectivamente disponibles. La atención interna futura no se puede certificar antes de F01. |

## Pruebas de la auditoría inicial del 2026-11-11 (histórico)

| Comando, desde raíz TMS | Resultado | Límite / acción |
|---|---|---|
| `npm test -- src/lib/devoluciones --reporter=dot` mediante RTK | **54 pasadas**, dos archivos | Lógica de formularios/solicitudes; no certifica componentes, navegador ni despliegue. |
| `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_returns.py backend/tests/test_return_requests.py backend/tests/test_returns_gate.py -q --tb=short` | **81 pasadas, 1 fallida** | Falla `test_upload_url_sin_bucket_es_503`: esperaba 503, recibió 500. `_client()` se evalúa antes de `_bucket()` y el entorno virtual no contiene boto3. Revisar el guard de configuración y dependencias de pruebas; no ocultar con un cambio de expectativa. |
| `npm run type-check` | **Falla: 92 errores** | 42 TS2580 y 50 TS2307, relativos a `process` / módulos Node y tipos. Ningún diagnóstico de este log apunta a `src/pages/devoluciones` ni `src/pages/mis-devoluciones`; eso no equivale a un chequeo global aprobado. |

No se ejecutó el lint global, Playwright, QA visual ni una prueba real con chofer/Cliente. No se modificaron dependencias o código de negocio para hacer pasar checks. La afirmación histórica de «0 errores TypeScript y todas las pruebas verdes» queda sustituida, para este checkout, por la tabla anterior.

## Evidencia de despliegue

Consultas de solo lectura con perfil `tms-sandbox` e identidad verificada de la cuenta indicada:

- Admin Lambda: última modificación `2026-11-05T21:03:45Z`; falta módulo de solicitudes y difieren app/returns/SQL de la copia local.
- Mobile stack: actualización del 2026-11-05; comparación de `mobile_api/stops.py` idéntica.
- Tarifas Lambda: última modificación `2026-11-05T21:06:05Z`, gate activado y archivo comparado idéntico.
- API Gateway contiene las ocho rutas base de Devoluciones, pero no `POST /api/v1/devoluciones/{returnId}/rechazar` ni las tres de solicitudes.
- Amplify sandbox: trabajo 30 `SUCCEED`, iniciado `2026-11-11T13:37:14.888Z`, sin commit asociado. Un deploy más reciente no prueba igualdad con el checkout. El entry público `/assets/index-BgzkRrBe.js` contiene la ruta `/devoluciones`, pero no `/mis-devoluciones`; las páginas están divididas en chunks, por lo que no se infiere el contenido de cada página solo desde el entry.
- Aurora disponible: la inspección se hizo con `BEGIN READ ONLY`, `transaction_read_only=on`, consultas de catálogo y ROLLBACK. El túnel SSM temporal se cerró. No hubo DDL, cargas, cambios de usuarios o escritura de datos de negocio.

Evidencia saneada: [AWS](auditoria/2026-11-11/aws.json), [BD](auditoria/2026-11-11/bd.json) y [verificaciones](auditoria/2026-11-11/verificaciones.json). No contienen credenciales, URL de descarga Lambda, archivos de clientes ni contenido de secretos.

Evidencia local adicional, ignorada por Git: `.test/devoluciones/typecheck-2026-11-11.log`, `.test/devoluciones/evidencia-aws-2026-11-11.json`, `.test/devoluciones/evidencia-bd-2026-11-11.json`. Script repetible: `node --env-file=.env.local .test/devoluciones/auditar-bd-solo-lectura.mjs`; requiere túnel existente y credenciales locales, nunca imprimir el archivo de entorno. Los archivos saneados versionables anteriores permiten consultar el estado sin depender de `.test/`.

## Orden de trabajo propuesto

1. **Gates locales de T02: verificados el 2026-11-12.** El fallo backend y los 92 errores TypeScript quedaron corregidos; resultados actuales y evidencia arriba. Mantener esos checks al continuar; el repositorio conserva cambios locales anteriores.
2. **Preparar entrega de lo ya implementado:** revisar diffs de P2–P6, plan de migraciones 65/66 y rollback, permisos mínimos, configuración de bucket y CORS. No rehacer esas funciones.
3. **Entrega a Jean, único autorizado a desplegar:** preparar esquema antes que consumidores, administración y frontend coordinados, junto con comprobaciones de rutas, variables, permisos y paquete publicado. Ni el usuario ni el agente ejecutarán ese despliegue.
4. **QA real:** comprobar origen/motivo impreso, filtro de país y alcance, rechazo, historial, adjuntos y bloqueo de liquidación. Añadir evidencia y actualizar esta matriz.
5. **Nueva funcionalidad:** tras las decisiones de F01/F02, construir bandeja y ciclo de solicitudes/recolecta. F03 requiere su propia definición y regresiones.

## Mantener una sola fuente

Actualizar este archivo y sus evidencias al cerrar un ítem. `docs/devoluciones/pendientes/` conserva detalles por tema; `.test/devoluciones/` conserva reportes históricos y evidencia local. Ningún reporte antiguo debe usarse como lista actual sin consultar esta matriz. Marcar pruebas como pasadas solo con una ejecución real, y despliegue solo con comprobación del ambiente correspondiente.
