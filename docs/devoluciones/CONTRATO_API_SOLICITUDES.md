# API de solicitudes de devolución — T04

Implementación local, 2026-11-12. Requiere SQL 67, ya aplicada en sandbox con autorización puntual: [evidencia](auditoria/2026-11-12/t03-aurora-sql67.json). **Estas rutas nuevas no se han desplegado.** Publicación y configuración operativa siguen a cargo de Jean. Esta etapa no accedió a AWS ni a una BD externa.

Se conserva el envelope `{data,error}`. Los errores tienen `data:null` y `error.message`; no encontrado o fuera del alcance devuelve el mismo 404. Falta de permiso de acción devuelve 403. Los identificadores de ruta y filtros de empresa deben ser UUID.

## Permisos y alcance

- Cliente: `devoluciones_solicitud:create` para cargar/crear; `view` para historial, detalle y evidencias. Empresa y organización se derivan del usuario autenticado, verificando que su empresa exista en esa organización. No se acepta cambiar el destino desde el cuerpo. Solo ve solicitudes de su organización/empresa de acceso y de su autoría; otro usuario de la misma empresa no obtiene detalle ni firma de archivos.
- Operador: `devoluciones:view` para bandeja, detalle y evidencias; `edit` para decisiones. Exige misma organización, cadena empresa/almacén válida, países permitidos por el rol y cobertura de al menos un `tbl_user_scopes` asignado.
- Scopes: empresa, almacén, país o global explícito, siguiendo la jerarquía existente de `context.scopes.covers`. Sin scopes no se ven solicitudes. Incluso un administrador necesita un scope operativo para estas consultas: su permiso de acción no fabrica un scope global. Un scope global no anula organización ni países del rol.
- Si hay almacén configurado, debe existir en la misma organización; si compañía y almacén tienen país, ambos deben coincidir. Cadenas incoherentes quedan excluidas. Sin país conocido no se cumple un filtro de países restringidos. No se corrige configuración real automáticamente.

## Endpoints

Base: `/api/v1/solicitudes-devolucion`.

| Método/ruta | Uso | Respuesta `data` |
|---|---|---|
| POST base | Crear solicitud Cliente | `{id,request_number,status}`; 201 nueva, 200 repetición idempotente |
| POST `/archivos/url` | Formulario de carga firmado Cliente, cuerpo `{mime_type}` | `{url,fields,key,kind,max_bytes}` |
| GET `/mias` | Historial propio, hasta 50, ordenado por fecha | Lista con ID, número, estado, fecha, cantidad de artículos y metadatos de decisión |
| GET `/asignacion` | Empresa fija del propio Cliente (T05), permiso view o create | `{id,name}`; 403 sin asignación válida; ignora filtros de otra empresa |
| GET base | Bandeja Operador | `{items,companies,limit,offset,has_more}` |
| GET `/{requestId}` | Detalle autorizado para Cliente u Operador | `{request,items}`; cada artículo incluye `files` con metadatos, sin llave S3 |
| POST `/{requestId}/aprobar` | Aprobar solicitud completa | Decisión con ID, estado, actor, fecha y motivo nullable |
| POST `/{requestId}/rechazar` | Rechazar solicitud completa, cuerpo `{reason}` | Misma estructura de decisión |
| GET `/{requestId}/archivos/{fileId}/url` | Firmar lectura del archivo persistido en la solicitud autorizada | `{url,kind,mime_type,expires_in}` |

Bandeja: `limit` de 1 a 100 (25 por defecto), `offset` de 0 a 1.000.000 (0 por defecto), `estado` opcional (`pendiente_asignacion`, `aprobada`, `rechazada`), `empresa` y `pais` opcionales UUID. Empresa y país filtran dentro del alcance, nunca lo amplían. Orden estable por fecha e ID descendente; se lee una fila adicional para `has_more`. No se calcula ni expone un total fuera del alcance. `/mias` conserva su contrato anterior; no es la bandeja del Operador.

T06 añade `companies: [{id,name}]`: empresas con solicitudes accesibles, usando exactamente el mismo scope y país seleccionado, sin limitarse a la página actual. No es un catálogo global y no sigue el filtro de estado/empresa, para permitir cambiar de filtro. Ningún scope, cadena incoherente o país excluido por el rol habilita opciones adicionales. Se amplía la respuesta del endpoint existente; no se crean rutas ni tablas nuevas.

## Captura e idempotencia

Ejemplo de cuerpo, con código manual mientras no haya catálogo real:

```json
{
  "idempotency_key": "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
  "items": [{
    "product_code": "CODIGO-MANUAL",
    "product_name": "Nombre del producto",
    "quantity": 2,
    "reason_code": "danado",
    "description": "Empaque deteriorado",
    "files": []
  }]
}
```

Nombre/código obligatorios, máximo 255/100 caracteres; cantidad entera de 1 a 1.000.000; motivos existentes `no_solicitado`, `danado`, `cantidad_de_mas`, `rechazado`, `otro`. Descripción de hasta 500 caracteres, obligatoria para `otro`. Hasta 50 artículos y 5 archivos por artículo. Mantiene fotos JPEG/PNG de hasta 5 MB y videos MP4/MOV de hasta 50 MB. Se comprueba el objeto real de S3 antes de abrir la transacción/bloqueo de numeración, sin confiar en el tipo/tamaño declarado por el navegador.

`idempotency_key` es un UUID en minúsculas, opcional para compatibilidad con el cliente anterior. **La pantalla T05 genera uno por envío lógico y lo conserva durante doble click, timeout y reintentos**, sin regenerarlo en cada llamada. Un nuevo envío intencional recibe otra clave. Se manda en el cuerpo, sin introducir un header CORS nuevo.

La identidad se deriva de organización, autor y clave (UUIDv5) usando la PK existente. Una transacción toma un advisory lock por organización, vuelve a comprobar la identidad y conserva la numeración existente protegida por su UNIQUE. Misma clave + artículos normalizados iguales devuelve el mismo ID (200), sin nuevas filas ni auditoría de creación. Cambiar producto, nombre, cantidad, motivo, descripción, orden de artículos o archivos con la misma clave devuelve 409. El orden de archivos dentro de un artículo no cambia el contenido lógico. No se crea tabla paralela ni otra migración.

Sin clave se conserva el comportamiento anterior: no se garantiza que un segundo envío sea la misma solicitud. La pantalla T05 siempre envía su clave; los clientes anteriores deben actualizarse para obtener esa protección. Un cambio de empresa asignada no redirige solicitudes históricas ni habilita leerlas desde otra empresa.

## Decisiones y auditoría

Se bloquea la solicitud autorizada con `FOR UPDATE OF r`, se actualiza condicionalmente solo desde `pendiente_asignacion` y se registra actor/fecha/motivo en la misma transacción. La bitácora explícita comparte conexión y transacción; si falla, la decisión revierte. Los triggers de auditoría existentes conservan su función.

La decisión es de toda la solicitud y sus cantidades; no hay aprobación parcial. Rechazar exige motivo de texto no vacío, máximo 500 caracteres. Repetir el mismo resultado y motivo devuelve 200 con la decisión original, sin sobrescribir actor/fecha ni repetir la auditoría. Una decisión opuesta o un motivo diferente devuelve 409. Los clientes no deciden solicitudes. La respuesta de reintento puede incluir metadatos adicionales de detalle; los campos de decisión siempre se conservan.

Aprobar no crea un viaje, una devolución física ni una recepción y no libera el gate de Liquidaciones. Los estados físicos y la integración con Planificación corresponden a T07/T08. No añadir edición/eliminación de artículos de una solicitud decidida como atajo.

## Evidencias y preparación de publicación

Las nuevas llaves de carga son `solicitudes/{org}/{empresa}/{app_user_id}/{uuid}.{ext}`. Solo su usuario puede adjuntarlas al crear. Las llaves antiguas sin autor no se aceptan para nuevas solicitudes porque no acreditan quién las subió; los archivos históricos ya persistidos se pueden consultar mediante la relación autorizada solicitud/artículo/archivo, conservando el prefijo org/empresa y sin migrar objetos.

Las URLs duran 300 segundos. Para renovar, consultar de nuevo el endpoint por ID; no enviar una llave S3 libre. Primero se autoriza la solicitud y la pertenencia del archivo; después se firma. Sin bucket configurado responde 503 antes de inicializar S3. El GET de URL usa el ID de archivo persistido y admite fotos/videos.

Las cinco rutas de T04 y la consulta de asignación añadida en T05 están declaradas en `backend/admin/template.yaml` con autorización CUSTOM y el authorizer compartido. No se amplió IAM en T04/T05. Jean debe coordinar antes de publicar: `MobileEvidenceBucket`, permisos `s3:PutObject` y `s3:GetObject` sobre el prefijo `solicitudes/*` del bucket autorizado (HeadObject usa GetObject), CORS del bucket para la carga directa y la configuración ya pendiente de fotos mobile. No hacer objetos públicos. Mantener la verificación de permisos/configuración en T08; estas etapas no validan un acceso S3 real.

Coordinar backend, T05 y T06 antes de activar el flujo: la pantalla Cliente T05 ya valida nombre, consulta la empresa fija, envía la clave idempotente, muestra detalle/decisión y renueva URLs por ID. La bandeja Operador T06 también está implementada localmente; nada de esto está publicado. El detalle añade `decided_by_name`, resuelto dentro de la misma organización, para mostrar quién decidió sin exponer su UUID como nombre.

## Pantalla Cliente T05

Solo captura recolectas; no tiene selector de empresa ni acciones de aprobación/rechazo. Nombre y código son obligatorios y el código se identifica como captura manual. Conserva los límites anteriores. Un usuario con solo view consulta su historial; no obtiene formulario de creación.

El bloqueo inmediato por referencia impide dos envíos antes del siguiente render. Tras comenzar el POST, guarda clave y contenido normalizado y bloquea edición ante un resultado incierto (red, 408, 409 o 5xx). El reintento usa exactamente el mismo contenido y clave; puede consultar Mis solicitudes mientras tanto. Rechazos confirmados 400/403/404/422 permiten corregir el borrador con clave nueva; un 403 también vuelve a consultar la empresa. No se anuncia registro si falla la carga o la API.

Los archivos subidos se conservan en memoria por ID del archivo local para no repetir una carga exitosa tras fallar otra. Una nueva solicitud intencional limpia clave y archivos. Borrador, resultados, claves y URLs se reinician al cambiar de usuario; una carga pendiente no continúa hacia el POST después de desmontar la pantalla. El estado no se persiste tras recargar/cerrar la pestaña; ante un envío incierto conviene consultar Mis solicitudes antes de iniciar uno nuevo.

El detalle se consulta por ID autorizado sin reutilizar datos de otra selección. Fotos/videos se abren por ID persistido; sus URLs se retiran al vencer y se pueden renovar tras expiración/error. Una aprobación comercial se presenta separada de la recepción en almacén. No se registran recepciones ni se programa transporte desde esta pantalla.

[Evidencia T05](auditoria/2026-11-12/t05-verificaciones.json): pruebas con API simulada, chequeo de tipos, build local y regresiones backend/SQL. No sustituye QA visual ni E2E real en staging, ni verifica permisos S3 de despliegue.

## Bandeja Operador T06

La pantalla Devoluciones tiene secciones «Recepción por viajes» y «Solicitudes». El contenido por viajes conserva sus filtros y estado al pasar a Solicitudes; sus consultas no determinan qué solicitudes comerciales aparecen. La bandeja consulta solicitudes directamente, incluidas las que no tienen viaje.

Requiere view y ofrece filtros por estado/empresa, país operativo seleccionado y páginas de 25 resultados, con anterior/siguiente según `has_more`. El backend intersecta todos los filtros con scopes y países del rol. Muestra número, solicitante, empresa, fecha, cantidad de artículos y estado; el detalle reutiliza fotos/videos y su renovación autorizada de T05. Errores y cambios rápidos de filtros no conservan resultados de respuestas anteriores. Cambiar usuario o país elimina el detalle/listado anterior.

Solo edit puede decidir, y solo mientras el detalle autorizado siga pendiente. La decisión incluye todos los artículos; el rechazo exige motivo no vacío de hasta 500 caracteres. No hay acciones de planificación ni confirmación física nueva en esta pestaña. El detalle de Cliente conserva su modo de consulta sin acciones de operador.

Mientras se envía, se bloquean ambas decisiones. Ante resultado incierto se conserva la acción y el motivo para repetir exactamente el mismo intento; la contraria queda bloqueada. El registro pendiente vive por usuario/solicitud en la pantalla Devoluciones, fuera del modal: cerrar/reabrir, cambiar de pestaña o de país no lo pierde. Si otro modal recibe la respuesta del POST, el detalle abierto concilia el estado. Una decisión confirmada, un 409 o una lectura final autorizada resuelven ese intento. Rechazos confirmados 400/403/404/422 permiten corregir; 403/404 vuelven a consultar acceso. Al salir de la pantalla, recargar o cambiar de cuenta, la memoria se pierde; volver a consultar el estado antes de otra decisión. El backend conserva su decisión única y atómica.

Un 409 recarga detalle/bandeja y no presenta un éxito falso. Una respuesta confirmada anuncia la decisión registrada y actualiza detalle y listado; esto no significa mercancía recibida. La bitácora/actor/fecha provienen del backend existente.

[Evidencia T06](auditoria/2026-11-12/t06-verificaciones.json): pruebas frontend/backend y PostgreSQL en memoria, TypeScript y build local. La revisión independiente detectó la pérdida del intento al cerrar el modal; se reprodujo con dos pruebas fallidas, se corrigió elevando su estado y ambas pasaron. La segunda revisión no halló regresiones importantes. Esta etapa no accedió a AWS ni a BD externa, no aplicó migraciones y no publicó código. T07/T08/T09 siguen pendientes.

## Evidencia histórica T04

[Evidencia T04](auditoria/2026-11-12/t04-verificaciones.json). Tests HTTP con dobles de BD/S3, permisos, idempotencia, rechazo de IDs ajenos, rollback de auditoría y perdedor de actualización condicional. SQL real de scopes, paginación, decisión y UNIQUE ejecutado en PostgreSQL 18.6 en memoria con PGlite 0.5.16. Se conserva la suite de SQL 67. No se prueba concurrencia multiconexión ni IAM/RLS/configuración de Aurora con esta suite; eso queda para staging bajo el control de Jean. La revisión independiente fue estática y no reportó hallazgos en el alcance revisado.
