# Guía para Jean: configuración y verificación de Devoluciones

Revisión de código: 25/11/2026. Destinatario: Jean. Evidencia del navegador: 24/11/2026.

Actualizada contra `316629ad` en `dylan-tarifas`, después de integrar los cambios de Josef. Esta revisión sustituye la indicación anterior de aplicar toda la configuración como requisito pendiente. El plan y la descripción inicial del PR conservan el diagnóstico anterior; para decidir qué aplicar, usar esta guía y contrastarla con AWS. No se volvió a inspeccionar el sandbox ni AWS el 25/11.

## 0. Entrega propuesta para revisión de Jean

Esta entrega agrupa la propuesta de infraestructura y su documentación en un commit para revisión de Jean mediante PR. El commit no aplica configuración a AWS. Solo Jean decide y ejecuta cualquier aplicación después de revisar las diferencias con su arreglo operativo.

Archivos propuestos para ese commit:

- `backend/admin/template.yaml`.
- `backend/admin/samconfig.toml`.
- `backend/mobile/samconfig.toml`.
- `backend/requirements-dev.txt`: añade `PyYAML==6.0.3` para las pruebas locales de plantillas.
- `backend/tests/test_return_evidence_infrastructure.py`: dos pruebas de contratos locales de infraestructura.
- `docs/work/2026-11/2026-11-25-infraestructura-evidencias-devoluciones.md`: guía versionada para el PR.

El formulario y las consultas backend de Josef ya están en los commits anteriores. No volver a incluirlos como modificaciones de infraestructura. Tampoco incluir Liquidaciones, Graphify, el repositorio mobile ni las pruebas locales `test_returns.py` y `test_return_origins_relational.py` en este commit focalizado. La prueba de firma de `test_returns.py` es una ampliación independiente de cobertura de aplicación.

La propuesta todavía contiene el reemplazo de rol descrito en la sección 4. Preparar el commit o abrir el PR no demuestra compatibilidad con AWS ni resuelve automáticamente las discrepancias con la configuración de Jean.

## Objetivo y estado de entrega

Los cambios de infraestructura pendientes preparan bucket, permisos S3 y orígenes CORS para fotos de devoluciones y adjuntos de solicitudes. Las mejoras del formulario se entregaron por separado y posteriormente se integraron con el flujo de búsqueda de Josef.

El formulario actual selecciona cliente final, pedido y punto de recolecta mediante `useReturnDiscovery`. Usa el endpoint de asignación con `buscar=clientes`, `buscar=pedidos` y `buscar=puntos`, implementados en `backend/admin/src/admin_return_requests.py` y `admin_return_requests_sql.py`. El detalle filtra `remaining > 0` en el servidor; el vacío se presenta como «Este pedido no tiene artículos con saldo disponible», sin distinguir inexistencia de artículos y saldo agotado. Jean debe comprobar que esas modalidades del backend estén publicadas antes de publicar el frontend integrado. Este PR de infraestructura no añade ni sustituye dichas modalidades.

El agente no ha aplicado esta configuración a AWS ni ha realizado despliegues, reparaciones de datos o migraciones. Esto no significa que Jean no haya corregido el ambiente por su cuenta: la lectura de una foto ya funciona en lo publicado. No se inspeccionaron la configuración efectiva de IAM, las variables de Lambda ni las reglas CORS en esta nueva revisión.

Hay dos trabajos distintos:

1. Reconciliar bucket, permisos y CORS versionados con el arreglo operativo de Jean; aplicar únicamente diferencias necesarias y verificadas.
2. Completar datos operativos legítimos de los pedidos afectados, con el responsable de su fuente. El frontend no puede crear artículos o zonas que faltan.

## 1. Diagnóstico histórico y resultado de la nueva revisión

En la inspección inicial del sandbox del 24/11/2026 se encontró lo siguiente. No asumir que estas condiciones siguen vigentes:

| Hallazgo | Efecto |
| --- | --- |
| `MOBILE_EVIDENCE_BUCKET` vacío en la Lambda admin | El backend devuelve las fotos sin URL firmada y las rutas de carga que requieren bucket responden 503. |
| Rol de admin sin permisos S3 de evidencias | Aunque se configure el bucket, el acceso a los objetos sigue bloqueado. |
| CORS del bucket limitado a localhost | El navegador no puede completar la carga directa de adjuntos desde el dominio del sandbox. |

Las siete fotos referenciadas revisadas existían en S3; no se comprobó pérdida de esos objetos. No había archivos registrados en `tbl_return_request_files`: el diagnóstico de adjuntos web identifica bloqueos de configuración, no la recuperación de un adjunto existente.

### Comprobación posterior desde el navegador

- URL: `https://sandbox.d1q6tzcx0ew3rk.amplifyapp.com./devoluciones`, sesión SuperAdministrador.
- País seleccionado: Costa Rica; viaje `MOCKVJ-20261113-03`.
- La acción «Ver foto» de `DV-44c0ce8f-8190-4df4-b11a-2a52ef774fa8-1` abrió una imagen visible. Es un registro identificado como MOCK dentro del filtro Costa Rica, no una validación de todos los pedidos operativos del país.
- La imagen se sirvió mediante URL firmada desde `dev-tms-mobile-evidencias-758837481569`, región `us-east-2`. No se guardan aquí tokens ni URLs firmadas completas.
- La solicitud Cofersa `SOL-2026-11-0001` abrió correctamente y mostró «Sin evidencias adjuntas». No sirve para certificar lectura de adjuntos existentes ni carga de archivos nuevos.
- Las consultas realizadas en Venezuela mostraron cero viajes con devoluciones; no se comprobó una foto de ese país.

La lectura de la foto comprobada ya funciona sin aplicar nuestros cambios locales. El resultado es compatible con un arreglo de AWS realizado por Jean, pero el navegador no identifica qué rol, política o cambio de configuración lo resolvió. No se probaron nuevas cargas, videos, renovación de enlaces vencidos ni usuarios con otros alcances. Visualizar una imagen no demuestra que el POST de adjuntos y su CORS funcionen.

## 2. Ambiente al que corresponden los valores preparados

| Elemento | Valor dev documentado |
| --- | --- |
| Cuenta | `758837481569` |
| Región | `us-east-2` |
| Stack admin | `dev-tms-admin` |
| Stack mobile | `dev-tms-mobile` |
| Lambda admin | `dev-tms-admin-admin-api` |
| Bucket de evidencias | `dev-tms-mobile-evidencias-758837481569` |

Los valores específicos del sandbox están en la sección dev de los archivos `samconfig.toml`. QA y producción necesitan sus propios buckets y orígenes; no copiar los valores dev a esos ambientes.

## 3. Preservar la conexión de admin con el bucket existente

Archivo preparado: `backend/admin/samconfig.toml`.

```toml
"MobileEvidenceBucket=dev-tms-mobile-evidencias-758837481569",
```

`backend/admin/template.yaml` conecta ese parámetro con la variable de la Lambda:

```text
MOBILE_EVIDENCE_BUCKET=dev-tms-mobile-evidencias-758837481569
```

Jean debe confirmar que el nombre corresponde al bucket existente del stack mobile de ese ambiente. La solución reutiliza el bucket y sus objetos; no requiere crear otro bucket, mover fotos ni cambiar sus claves.

El bucket propuesto coincide con el de la foto publicada. Comparar el parámetro del stack y la variable efectiva antes de publicar: una modificación manual de Lambda puede no estar reflejada en CloudFormation. No volver a dejar el parámetro vacío en un despliegue posterior. El valor por defecto vacío sigue permitido por la plantilla; no constituye una configuración funcional de evidencias.

## 4. Rol propuesto: qué cambia y por qué se planteó

Archivo preparado: `backend/admin/template.yaml`.

El cambio local añade un recurso nuevo `AWS::IAM::Role` cuyo identificador lógico es `AdminApiRole`, y sustituye la referencia al rol compartido en `AdminApiFunction`. No se declaró un nombre físico fijo `admin`; CloudFormation asignaría el nombre físico al crear el recurso. El agente no ha creado este rol en AWS.

Antes, `AdminApiFunction` utilizaba el ARN exportado como `${CommonStackName}-LambdaRoleArn`. El código local no modifica ese rol compartido ni la asignación de `AuditMaintenanceFunction`. Tampoco crea ni modifica roles funcionales del TMS como Administrador o SuperAdministrador, sus permisos de aplicación o las cuentas de usuario.

**No es obligatorio cambiar de rol para que las fotos funcionen.** Lo necesario es que la identidad efectiva tenga los permisos adecuados y que admin apunte al bucket correcto. La foto ya abierta demuestra que la lectura funciona para ese caso. Se propuso un rol exclusivo para limitar los permisos S3 al API admin sin concederlos a todas las Lambdas que reutilizan el rol común. Es una decisión de aislamiento y mantenimiento, no una dependencia nueva del formulario ni un requisito demostrado del sandbox actual.

Si Jean ya resolvió el acceso sobre el rol actual, conservar inicialmente esa asignación y reconciliar su solución con la infraestructura versionada. No desplegar el reemplazo solo para volver a resolver una lectura que ya funciona. La plantilla local todavía contiene el rol nuevo: esta guía no lo retira ni modifica automáticamente.

El rol propuesto incluye:

- Confianza para el servicio Lambda.
- Lectura del secreto de BD referenciado por el stack common-services del ambiente.
- La política administrada `AWSLambdaVPCAccessExecutionRole` para su ejecución en VPC y registros.
- Acceso S3 limitado al bucket configurado y a los prefijos siguientes.

El diff también contiene `Metadata.AWSToolsMetrics.AWSAgentToolkit: aws-cloudformation@3`. Es metadato de la plantilla, sin cambios de permisos ni del flujo de aplicación; no es un requisito funcional de las evidencias.

| Recurso | Acciones | Necesidad |
| --- | --- | --- |
| `arn:aws:s3:::dev-tms-mobile-evidencias-758837481569/pedidos/*` | `s3:GetObject` | Consultar fotos capturadas por los choferes. |
| `arn:aws:s3:::dev-tms-mobile-evidencias-758837481569/solicitudes/*` | `s3:GetObject`, `s3:PutObject` | Consultar y cargar adjuntos de solicitudes; comprobar sus metadatos con HEAD. |

La plantilla construye estos ARN con la partición y el parámetro del bucket. La política de evidencias solo se incorpora si `MobileEvidenceBucket` tiene valor. En cambio, crear el rol y asignarlo al API no está condicionado al bucket ni al ambiente: también sucedería al desplegar esta plantilla en QA o producción.

### Alcance y riesgo del reemplazo

La Lambda admin atiende también usuarios, roles, permisos y auditoría. Por tanto, sustituir su rol de ejecución no queda limitado a Devoluciones, aunque los permisos S3 añadidos sí lo estén. El rol propuesto declara acceso al secreto de BD, VPC, registros y los prefijos S3 indicados; no hereda automáticamente otras políticas, límites de permisos o autorizaciones del rol que Jean utiliza actualmente.

Antes de considerar el reemplazo, comparar el ARN efectivo, políticas administradas e inline, límites de permisos y referencias al principal en políticas del bucket, claves KMS y endpoints VPC, si existen. Una autorización ligada al ARN anterior puede no admitir el nuevo. Comprobar las dependencias reales de la Lambda; no copiar permisos amplios ni añadir permisos hipotéticos. Si esa comparación no puede completarse, mantener pendiente el cambio de rol y separar el frontend de esta parte del PR.

Solo si se decide conservar el rol exclusivo después de reconciliar el arreglo de Jean, revisar en el changeset que:

- El API admin recibe el nuevo rol.
- El rol compartido de common-services no recibe permisos S3 adicionales.
- `AuditMaintenanceFunction` conserva su rol anterior.
- No se conceden permisos de borrado, listado general, acceso público ni acceso a otros buckets.
- Las llamadas administrativas a BD, la auditoría y los registros siguen funcionando después del cambio de rol.

Generar una URL firmada no demuestra por sí solo que el acceso S3 esté autorizado. La comprobación debe incluir la lectura efectiva de la foto y la carga efectiva del adjunto.

## 5. Reconciliar los orígenes CORS para las cargas web

Archivo preparado: `backend/mobile/samconfig.toml`.

El parámetro `EvidenceCorsOrigins` contiene estos cuatro orígenes:

```text
http://localhost:8081
http://localhost:3000
https://sandbox.d1q6tzcx0ew3rk.amplifyapp.com
https://sandbox.d1q6tzcx0ew3rk.amplifyapp.com.
```

La variante final lleva un punto después de `com` porque se observó en la sesión del usuario. El navegador trata ambas variantes como orígenes diferentes. Revisar que los valores coincidan con los orígenes realmente utilizados; no añadir rutas ni barras finales al valor del origen.

La plantilla mobile ya conecta ese parámetro con CORS del bucket. La regla local declara método `POST`, encabezados `*` y `MaxAge: 3000`. Esa configuración no añade reglas de forma acumulativa a las de AWS: una actualización puede sustituir la configuración CORS y eliminar otros métodos, orígenes o reglas legítimas que Jean haya incorporado. Comparar el conjunto completo, no solo los cuatro orígenes propuestos, y preservar lo necesario para los consumidores existentes. No se verificó el CORS efectivo durante esta revisión.

CORS habilita el envío del navegador; no sustituye IAM ni la autorización del backend. El bucket y los objetos deben permanecer privados. No se necesita cambiar el pool de usuarios ni las credenciales de acceso para este arreglo.

## 6. Interferencias posibles y orden seguro de integración

| Cambio local | Compatibilidad comprobada y riesgo | Acción para Jean |
| --- | --- | --- |
| Formulario y consultas de Josef, ya integrados | El formulario utiliza las nuevas modalidades `buscar` del endpoint de asignación; el detalle devuelve únicamente saldo positivo. No modifica el visor de fotos. | Fuera del diff de infraestructura. Confirmar compatibilidad del backend publicado con el frontend integrado y validar CR/VE. |
| `backend/admin/template.yaml` | Reasigna toda la Lambda admin a un rol nuevo. Puede dejar fuera permisos o referencias al principal que Jean configuró. El cambio alcanza cualquier ambiente donde se publique la plantilla. | No aplicar sin comparar y reconciliar el rol efectivo. Mantener el rol actual si el reemplazo no aporta una necesidad validada. |
| `backend/admin/samconfig.toml` | El bucket dev coincide con la foto observada. No demuestra coincidencia de todos los parámetros del stack. | Preservar los valores efectivos de Jean y evitar que un parámetro vacío deshaga su arreglo. |
| `backend/mobile/samconfig.toml` y plantilla mobile existente | Los orígenes propuestos pueden sustituir reglas CORS añadidas en AWS. Publicar el stack completo puede además aplicar otras diferencias respecto al estado efectivo. | Comparar reglas y changeset completo; conservar bucket, objetos y configuración legítima de los demás consumidores. |
| Pruebas y `backend/requirements-dev.txt` | PyYAML se añade como dependencia de desarrollo para inspeccionar plantillas; las pruebas no cambian los contratos de producción. El test de infraestructura exige actualmente el rol nuevo y los cuatro orígenes exactos. | Si se conserva el rol actual o se reconcilian más orígenes, ajustar esos tests a la decisión aprobada; no forzar AWS para satisfacer el test anterior. |

**No se ha certificado ausencia de interferencias con la configuración de Jean.** Se verificaron el código local y una lectura en navegador; falta comparar el estado efectivo de AWS. No desplegar los tres archivos de infraestructura tal como están solo porque el formulario pasa pruebas.

1. Revisar el alcance del PR usando la lista de la sección 0. Separar Liquidaciones, Graphify y el repositorio mobile. La aprobación del PR no sustituye la comparación del estado efectivo antes de desplegar.
2. Jean debe obtener y comparar, sin modificarlos, los parámetros y plantillas de los stacks, rol efectivo y sus políticas, variable del bucket y CORS actual. Documentar su arreglo sin incluir secretos. Distinguir cambios versionados de cambios manuales.
3. Conservar la configuración operativa y llevar al código únicamente la reconciliación necesaria. Si ya están resueltos bucket, permisos y CORS, no repetir su aplicación como si estuvieran pendientes. Revisar por separado cualquier propuesta de rol exclusivo y sus pruebas.
4. Si quedan diferencias necesarias, Jean revisa el changeset completo antes de aplicar. Debe conservar el bucket y objetos, los permisos necesarios y los consumidores actuales, sin cambios ajenos a la solución. Si no hay diferencias necesarias de infraestructura, omitir este paso.
5. Si también se publica el frontend integrado, confirmar primero las modalidades backend de Josef y aplicar únicamente las publicaciones aprobadas. Este commit no exige republicar el frontend para incorporar IAM/CORS.
6. Verificar el resultado en el navegador y registrar la evidencia de aceptación.

No hace falta aplicar migraciones de BD para estos cambios. Reflejar la solución operativa de Jean en las plantillas evita perderla en publicaciones futuras; no significa que deba sustituirse por nuestra propuesta anterior. Esta guía no ejecuta ni autoriza al agente a desplegar; la aplicación corresponde únicamente a Jean.

## 7. Verificación posterior

Usar un registro existente para lectura y datos de prueba identificables y aislados para cualquier creación. Si se crean datos de prueba, acordar su retirada sin afectar registros ajenos.

### Fotos de devoluciones existentes

- Abrir una devolución autorizada con referencia de foto válida.
- Confirmar que aparece la miniatura y abre la imagen ampliada.
- Si vence o falla el enlace, comprobar la recuperación mediante el mecanismo existente.
- Confirmar que un usuario sin alcance no puede consultar evidencias ajenas.

### Adjuntos de solicitudes

- Desde el dominio web aprobado, cargar una foto JPG/PNG y un video MP4/MOV de prueba dentro de los límites del formulario.
- Comprobar que el formulario firmado permite el POST a S3 sin error CORS ni AccessDenied.
- Registrar la solicitud de prueba y abrir sus adjuntos desde el detalle autorizado.
- Verificar la reproducción separada del video y la renovación de enlaces.
- Conservar la privacidad del bucket; no probar haciendo públicos los archivos.

### Pedidos y artículos

- En Venezuela y Costa Rica, seleccionar una empresa autorizada con un pedido operativo completo y artículos persistidos.
- Comprobar que aparecen el pedido y las líneas con saldo positivo.
- Verificar carga, fallo/reintento, ausencia de pedidos para la búsqueda y pedido sin artículos con saldo disponible. El contrato nuevo no diferencia artículos inexistentes de saldo agotado.
- Cambiar de país, empresa o pedido durante una consulta y comprobar que no aparecen resultados anteriores.
- Confirmar que un reintento conserva los archivos y las cantidades del borrador, y que un envío incierto no duplica la solicitud.

Registrar ambiente, versión, fecha, país e identificadores mínimos de los casos. No adjuntar credenciales, tokens ni URLs firmadas completas a la evidencia del PR.

## 8. Datos pendientes: trabajo separado de la configuración

| Caso diagnosticado | Qué debe confirmar el responsable de datos |
| --- | --- |
| Febeca / Venezuela: `DEMO-VN-MW22ZA6T-1`, `DEMO-VN-MW22ZA6T-2`, `DEMO-VN-MW22ZA6T-3` | La zona real del punto y la fuente legítima de sus artículos. En el diagnóstico, el punto tenía `zone_id = NULL` y los pedidos no tenían filas en `tbl_order_items`. |
| Beval / Venezuela: tres pedidos del diagnóstico | Los puntos de entrega legítimos de los clientes finales; no tenían puntos asociados. |
| Costa Rica | Verificar casos reales con el responsable del país. Se comprobó el recorrido común y fixtures locales, pero no se auditó su BD real. |

Identificar los casos por organización, país y empresa mediante sus IDs. Hay nombres de empresa repetidos entre Venezuela y Venezuela MOCK; el nombre por sí solo no identifica el registro correcto.

Completar únicamente la zona de Febeca no creará los artículos faltantes. Tampoco se deben relajar los JOIN de elegibilidad ni introducir captura manual para saltar `order_item_id` y el saldo del servidor.

No se identificó con evidencia un importador defectuoso responsable de esos datos. Costa Rica tiene una ingesta especializada de artículos desde EFLOW; no debe ejecutarse como si fuera una sincronización genérica para Venezuela. Cualquier reparación o cambio de ingesta necesita investigación y revisión separadas, sin ejecutar SQL de reparación desde esta entrega.

## 9. Validaciones locales ya realizadas y límites

### Revisión del código vigente del 25/11/2026

- Se contrastaron rol, permisos, condición de bucket, parámetros dev y la regla CORS existente con esta guía. Admin usa `AdminApiRole`; mantenimiento conserva el rol común; CORS declara `POST`, encabezados `*` y `MaxAge: 3000`. No se compararon contra el estado efectivo de AWS.
- Los parámetros del bucket y los orígenes se declaran solo en dev; la reasignación de rol está en la plantilla común a dev/qa/prod. QA/prod no declaran `MobileEvidenceBucket` en sus bloques actuales. No publicar esos ambientes con bucket vacío esperando que funcionen las evidencias.
- `scripts/sandbox/deploy_backend.py` lee `parameter_overrides` de `samconfig.toml`. Por tanto, los valores propuestos forman parte de ese flujo de publicación; no se ejecutó el script.
- Las 161 pruebas frontend en 12 archivos, typecheck y ESLint corresponden a la resolución anterior de la fusión `316629ad`; no prueban el IAM efectivo ni se volvieron a ejecutar como validación de esta documentación.
- Las dos pruebas de `test_return_evidence_infrastructure.py` describen la propuesta vigente, pero exigen el rol nuevo y los cuatro orígenes exactos. Si Jean cambia la estrategia, se deben actualizar esas expectativas. La prueba que menciona otros ambientes comprueba parámetros dev y la plantilla; no certifica ausencia de impacto en QA/prod.
- Se detectó que la prueba local no versionada `test_return_origins_relational.py` quedó desactualizada tras Josef: intenta `ast.literal_eval` sobre `ORIGINS_SQL`, ahora construido mediante concatenación con `ORIGIN_FROM_SQL`, y llama `.format(filters='')` sin el nuevo parámetro `limit`. Esa prueba no puede respaldar la integración actual tal como está. Se excluye de este PR y queda pendiente de adaptación por separado. El resultado histórico de 30 escenarios no se presenta como una comprobación del código vigente.
- No se ejecutó en esta revisión una nueva suite Python ni cfn-lint. Las ejecuciones anteriores de Python estaban bloqueadas por acceso al ejecutable. Los resultados históricos siguientes se conservan con fecha y alcance, sin certificar una ejecución nueva.
- No se ejecutaron despliegues, cambios de permisos, migraciones, cargas, consultas a BD compartida ni reparaciones de datos.

### Nueva revisión del 24/11/2026

- Formulario: `npx vitest run src/pages/mis-devoluciones/page.test.tsx --configLoader runner`, 31 pruebas pasadas, salida 0. La ejecución inicial sin ese cargador falló al leer directorios mediante esbuild; no fue un fallo de las pruebas del formulario.
- `git diff --check`: salida 0.
- No se pudieron repetir las pruebas backend: tanto el alias Python del sistema como `backend/.venv/Scripts/python.exe` devolvieron errores de acceso/ejecución. Los resultados backend siguientes son históricos, no una nueva ejecución.
- Revisión publicada manual: una foto visible en el caso descrito en la sección 1. No se ejecutó una suite E2E ni se publicaron cambios para esta comprobación.

### Validaciones de la implementación anterior

- Backend focalizado: 185 pruebas pasadas, incluyendo contratos de infraestructura y 30 escenarios relacionales CR/VE.
- Suite frontend de Devoluciones: 95 pruebas pasadas en 10 archivos. Después se amplió la cobertura: ejecución final del formulario con 31 pruebas pasadas.
- Type-check, ESLint de los archivos modificados, build y cfn-lint 1.43.1 de la plantilla admin: salida 0.
- Build con aviso de bundles mayores de 500 kB, fuera de este arreglo.
- Revisión independiente sin hallazgos bloqueantes.

Las pruebas locales no prueban el IAM/CORS efectivo de AWS. La nueva revisión confirma únicamente la lectura publicada descrita en la sección 1. No se ejecutó una suite E2E publicada, cfn-guard, auditoría completa de vulnerabilidades ni validación de CloudFormation contra la cuenta. Los casos relacionales utilizan SQLite en memoria, no integración PostgreSQL. La aceptación del conjunto del ambiente depende de las comprobaciones restantes de Jean.

## 10. Reversión y archivos de referencia

Si es necesario revertir una publicación futura, Jean debe recuperar el estado operativo reconciliado y documentado antes de esa publicación. No volver ciegamente a la plantilla anterior ni borrar permisos que forman parte de su arreglo. Conservar el bucket y todos los objetos. Una reversión de rol o bucket puede volver a dejar las evidencias inaccesibles; no hay cambios de esquema ni datos que deshacer en este arreglo.

La sección 0 enumera los archivos del commit de infraestructura propuesto. Los archivos del formulario y de las consultas de Josef pertenecen a los commits `212c197d` y `316629ad`; esta propuesta se apoya en el código integrado, sin rehacerlo.

Documentación local relacionada:

- `.test/2026-11-24/planDevolucionPedidosEvidencia.md`: diagnóstico y plan históricos; no sustituye esta revisión.
- `.test/2026-11-24/PRDevoluciones.md`: descripción original anterior a la separación de infraestructura; no usarla como descripción vigente del nuevo PR.
- `docs/work/2026-11/2026-11-24-mejoras-formulario-devoluciones.md`: entrega del formulario e integración posterior con Josef.

La guía completa para el PR se conserva en `docs/work/2026-11/2026-11-25-infraestructura-evidencias-devoluciones.md`. La ruta anterior de `.test` está ignorada por Git y remite a esa guía. El documento versionado debe acompañar al commit para que Jean pueda revisarlo desde el PR.
