# Entrega a Planificación: recolectas aprobadas

Fecha: 2026-11-11. Define la frontera de integración solicitada por el usuario. **La asignación de recolectas a viajes la implementa el responsable de Planificación, no este trabajo de Devoluciones. Solo Jean puede desplegar.** Este documento no autoriza cambios en AWS ni en la BD compartida.

**Decisión D01 confirmada por el usuario:** una empresa destinataria asignada por cliente, sin elección multieempresa en cada solicitud. Backend determina el destino a partir de la asignación autorizada y preserva la identidad histórica de la solicitud. La relación concreta de catálogo/asignación debe verificarse antes de implementar; esta elección no autoriza asumir que solicitante y dueño del producto son la misma entidad.

**Validación técnica T01 (2026-11-12):** [relaciones y evidencia](VALIDACION_RELACIONES_ROLES.md). Reutilizar la asignación `tbl_app_users.customer_id` y el destino histórico `tbl_return_requests.customer_id`; scopes del operador en `tbl_user_scopes`. Para contracamión, resolver la compañía por el pedido de su guía: un viaje o almacén puede contener varias empresas, por lo que no sirve elegir una empresa para todo el viaje/almacén. Las referencias de pedido, guía y organización deben ser coherentes; si no, no se asigna un destino por suposición.

## Flujo de negocio confirmado

**Contrato de esquema preparado en T03 (2026-11-12, sin aplicar):** [entrega SQL 67 a Jean](ENTREGA_JEAN_SQL67.md). `tbl_returns.request_item_id` conserva el artículo de la solicitud; el índice único artículo/guía evita duplicados dentro de una ejecución. Para vincular una recolecta, Planificación debe aportar pedido y guía reales, con empresa/organización coherentes y viaje asociado, de una solicitud aprobada. No crear pedidos ficticios a partir del código manual. El vínculo físico no sustituye el historial de asignaciones/intentos que Planificación debe desarrollar: las cinco recolectas no realizadas mantienen los IDs originales y se reasignan sin fabricar otra solicitud ni una recepción. Contracamión conserva vínculo NULL.

1. El rol Cliente registra una solicitud de devolución de tipo **recolecta**, con código y nombre de producto, cantidad, motivo, descripción y evidencias de foto/video.
2. El rol Devoluciones ve la solicitud y la aprueba o rechaza.
3. Si se aprueba, queda disponible para Planificación para buscar la mercancía **en otro viaje**.
4. Planificación incorpora la recolecta a un viaje y la app del chofer la muestra como parada de recogida.
5. El chofer registra la ejecución y evidencias. Recoger la mercancía no significa que ya llegó al almacén.
6. Devoluciones confirma la recepción física en almacén, tanto de recolectas como de devoluciones **contracamión** registradas por el chofer.

Contracamión conserva su entrada actual desde Tracking mobile. No se debe exigir que el chofer cree primero una solicitud Cliente para esa devolución.

## Frontera de responsabilidades

### Recolectas no realizadas: requisito confirmado por el usuario

**Planificación debe mostrar las recolectas asignadas que no se realizaron y permitir asignarlas a otro viaje.** Devoluciones registra qué mercancía llegó físicamente al almacén; no asume la reprogramación de las recogidas que quedaron pendientes.

**Ejemplo de aceptación:** un viaje tiene 10 recolectas asignadas y solo se confirman 5 realizadas. Planificación debe mostrar 5 realizadas y **5 pendientes de recolectar**, identificar cuáles son y permitir reasignar esas mismas 5 a otro viaje. No crear otras 5 solicitudes comerciales ni perder la aprobación original.

Para implementarlo, el responsable de Planificación deberá:

1. Conservar el identificador de solicitud/recolecta y el de cada asignación a viaje/parada; no identificar una operación solamente por el contador total del viaje.
2. Conciliar las asignaciones con el resultado informado por Tracking mobile. Mostrar por viaje el total asignado, realizado y pendiente, con detalle de las recolectas faltantes.
3. Diferenciar un resultado «no realizada» de un resultado todavía no sincronizado. La falta de un registro no prueba éxito ni permite duplicar automáticamente una asignación activa; conciliar al cierre o mediante el procedimiento acordado, considerando el outbox offline.
4. Mantener pendientes las recolectas no ejecutadas. No darlas por recibidas en almacén ni por canceladas por el hecho de cerrar el viaje.
5. Permitir seleccionar pendientes y asignarlas a otro viaje según sus reglas de fecha/capacidad. Conservar el intento anterior, motivo si existe, usuario y fecha de reasignación.
6. Impedir dos asignaciones activas incompatibles para la misma recolecta; los reintentos de la operación no deben duplicar paradas ni solicitudes.
7. Comunicar a Devoluciones y Tracking la nueva asignación manteniendo el vínculo original con solicitud y artículos. El viaje siguiente debe mostrar la recogida pendiente una sola vez.
8. Tratar un aviso tardío del viaje anterior sin sobrescribir ni duplicar la recogida: conciliarlo antes de confirmar un resultado contradictorio con el nuevo intento.

**La unidad del ejemplo es la recolecta, no la cantidad de unidades de un artículo.** Si se recogen 5 de 10 recolectas, se reprograman las otras 5; esto no define por sí solo cómo resolver un faltante de unidades dentro de mercancía ya recogida que llega a bodega. Ese caso físico requiere su propia regla y no se cerrará automáticamente por inferencia.

Este requisito forma parte de la entrega al responsable de Planificación; no está implementado por el hecho de documentarlo.

| Responsable | Trabajo |
|---|---|
| Devoluciones | Captura del cliente, empresa destinataria, bandeja, decisión, historial y exposición de recolectas aprobadas con identidad estable. Recepción física y trazabilidad posterior. |
| Planificación | Consumir aprobadas, verificar datos de recogida, asignar viaje y posición en ruta, aplicar reglas de capacidad/fecha, mostrar recolectas no realizadas y reasignarlas a otro viaje conservando historial e identidad. Comunicar la asignación y sus cambios. |
| Tracking mobile | Mostrar la parada collection asignada, registrar recogida/no recogida y evidencias mediante el contrato acordado. |
| Jean | Revisar y ejecutar despliegues y cambios de infraestructura/BD que correspondan. |

## Qué existe y puede reutilizarse

- `tbl_return_requests`, `tbl_return_request_items` y `tbl_return_request_files` almacenan solicitudes y adjuntos; hoy la solicitud solo admite `pendiente_asignacion`.
- `tbl_returns` representa devoluciones operativas. La solicitud y la devolución física necesitan vinculación; no son el mismo registro ni sus estados tienen el mismo significado.
- Existen paradas `collection` en Planificación/Tracking y soporte de recogida en la app.
- `backend/mobile/src/mobile_api/start.py` convierte paradas del plan en guías al iniciar un viaje. `backend/mobile/src/mobile_api/stops.py` registra eventos del chofer.
- El listado actual de devoluciones físicas depende de una guía/viaje. No se puede usar como única bandeja para solicitudes aún sin viaje.

Confirmar el esquema y los contratos vigentes antes de implementar; estas rutas orientan, no autorizan cambiar módulos de otro responsable.

## Contrato propuesto para acordar entre responsables

Lo siguiente es **propuesta técnica**, no una API existente ni un acuerdo ya aprobado:

- Entregar únicamente solicitudes aprobadas, visibles para la organización, empresa y país autorizados del planificador.
- Conservar `request_id` y los identificadores de sus artículos como referencia de origen durante todo el recorrido.
- Datos de cabecera: número de solicitud, organización, cliente solicitante, empresa dueña/destinataria de la mercancía y estado de aprobación.
- Datos de recogida: persona/contacto, dirección y coordenadas, país y fecha/ventana solicitada. Definir dónde se capturan: el formulario descrito por el usuario todavía no especifica estos campos.
- Artículos: código manual/simulado por ahora, nombre, cantidad aprobada, motivo y descripción. No depender de un maestro real de productos inexistente en esta integración.
- Peso, volumen y duración de servicio: Planificación debe acordar cómo obtenerlos o qué regla usar cuando no existan; no inventar valores silenciosamente.
- Adjuntos privados: identificadores y acceso temporal autorizado. No publicar objetos S3 ni guardar URL firmada como identidad permanente.
- Asignación: devolver identificadores de viaje/parada y conservar la relación con solicitud/artículos; evitar asignaciones duplicadas y definir reasignación.
- Ejecución: reportar recogida completa/parcial/no realizada por artículo cuando se acuerde ese nivel de detalle, con cantidades, fecha, responsable y evidencias.
- Recepción en almacén: se registra por Devoluciones; no se genera automáticamente al aprobar, asignar viaje o recoger.

Las URL, métodos HTTP y nombres definitivos de campos se acordarán con Planificación. No conectar directamente sus pantallas a una tabla nueva sin contrato ni implementar aquí un planificador alternativo.

## Orden propuesto para implementarlo en Planificación

1. Acordar el contrato anterior y la propiedad de cada dato.
2. Añadir una fuente/bandeja de recolectas aprobadas, separada de solicitudes aún pendientes o rechazadas.
3. Validar dirección, coordenadas y datos operativos necesarios antes de permitir asignación.
4. Al asignar, crear o vincular una parada collection mediante las estructuras existentes y registrar la identidad de solicitud/artículos.
5. Reutilizar el mecanismo de inicio de viaje para crear las guías; acordar aparte si se admiten inserciones en viajes ya iniciados.
6. Publicar la asignación/ejecución hacia Devoluciones con reintentos seguros, sin duplicar mercancía, paradas ni devoluciones operativas.
7. Incorporar la bandeja de recolectas no realizadas y su reasignación a otro viaje; probar el caso de 10 asignadas, 5 realizadas y 5 pendientes, incluidos avisos offline tardíos.
8. Probar el contrato con dobles de API y datos aislados antes de que Jean publique las piezas coordinadas.

**Decisión D02 confirmada por el usuario:** Devoluciones aprueba o rechaza toda la solicitud, incluyendo todos sus artículos y cantidades. No hay aprobación parcial comercial en esta entrega. La regla de recepción física parcial se decide por separado.

## Decisiones pendientes

**D05 confirmada el 2026-11-12:** para contracamión se obtiene la empresa receptora desde la relación operativa del viaje/almacén, únicamente si identifica una empresa de forma inequívoca. Falta verificar el modelo existente; una relación ausente/ambigua no autoriza a inventar un destino ni a deducirlo del código simulado o de la empresa transportista. La clasificación manual no se incluye como alternativa automática.

**D04 confirmada:** el usuario Cliente solo ve solicitudes que él mismo creó, aun si comparte empresa con otros usuarios. Esto incluye detalle y evidencias. El operador Devoluciones conserva la consulta de solicitudes dentro de su alcance de atención autorizado.

- Catálogo y relación concreta para una empresa destinataria asignada por cliente (D01 ya confirmada), junto con los permisos de atención del rol Devoluciones.
- Tratamiento de recepción física parcial; la aprobación comercial completa ya quedó confirmada en D02.
- Fuente de dirección de recogida y almacén de destino.
- Una solicitud en un solo viaje o dividida en varios; reglas de reintento, cancelación y reasignación.
- Efecto de una recepción parcial o con faltantes sobre cierre y bloqueo de Liquidaciones.
- Criterios, mensajes y permisos para rechazo de solicitud frente a rechazo de una devolución física.

## Criterios de aceptación de la integración

- Una solicitud pendiente o rechazada no se asigna como recolecta aprobada.
- La recolecta aparece una sola vez en el viaje autorizado y se conserva la referencia a su origen.
- Con 10 recolectas asignadas y 5 realizadas, Planificación identifica las 5 pendientes y las reasigna a otro viaje sin crear solicitudes nuevas ni borrar el intento anterior.
- Repetir una reasignación o recibir un aviso offline tardío no genera dos recogidas activas/completadas para la misma recolecta; la aplicación señala el conflicto para conciliación cuando corresponda.
- El chofer distingue recogida de entrega; los reintentos offline no duplican la operación.
- Devoluciones diferencia aprobada, planificada, recogida y recibida, sin marcar recepción física antes de tiempo.
- Un rol Cliente no consulta solicitudes de empresas/usuarios fuera de su alcance; un operador de Devoluciones no atiende otra empresa por manipular un identificador.
- Los escenarios de prueba no actualizan ni borran registros reales; sus datos y evidencias tienen identificación y limpieza acotadas.

## Preparación para Jean

Entregar código, migraciones aditivas, variables/parámetros necesarios, permisos S3 mínimos, CORS, orden de publicación, verificaciones y rollback. No ejecutar esos pasos desde el trabajo de desarrollo. El estado de despliegue se mantiene en [ESTADO_ACTUAL.md](ESTADO_ACTUAL.md).
