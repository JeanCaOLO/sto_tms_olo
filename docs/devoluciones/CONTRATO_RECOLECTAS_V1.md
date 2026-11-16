# Contrato `returns.collection.v1`

Productor: Devoluciones. Consumidor: equipo de Planificación, fuera de esta implementación.
SQL72 y SQL73 son preparaciones locales. Solo Intelix/Jean las aplica. No se reejecutan SQL60–70.

## Identidades y cantidades

`request_id` identifica la solicitud; `request_item_id`, su artículo. `order_item_id` identifica la línea y su presentación.
`assignment_id` identifica la asignación de un artículo a `route_id` y `stop_id` (guía `collection`).
`attempt_id` identifica esa ejecución. Una reasignación usa nuevas identidades y solo el saldo no recogido.
`event_id` identifica un hecho inmutable; `causation_id` referencia el evento solicitado del outbox.
La cantidad solicitada reserva unidades. Lo asignado aún no ejecutado también reserva capacidad de la solicitud.
Lo recogido es un resultado aceptado por el servidor. Lo recibido requiere confirmación independiente del almacén.
No se convierten presentaciones, peso ni volumen. El límite del pedido es cantidad pedida menos anulada.
No se admiten productos manuales nuevos. El APK anterior puede identificar por código o nombre solo una línea inequívoca.
El historial físico sin línea se descuenta conservadoramente de todas las líneas compatibles.

## Entrega durable por consulta

La solicitud, origen, artículos, adjuntos y mensaje se guardan en la misma transacción.
`POST /api/v1/solicitudes-devolucion/eventos/reclamar` reclama hasta 25 mensajes autorizados para el usuario.
Requiere `devoluciones.edit`, organización y scopes de empresa/almacén/país del operador.
Cada mensaje contiene `id`, `request_id`, `payload`, `lease_token`, `lease_until` y `attempts`.
El payload contiene `schema_version:1`, `event_type:returns.collection.requested`, `event_id`, solicitud,
organización, empresa, origen completo y artículos con `requested_quantity`, línea y presentación.
El lease dura dos minutos. Un mensaje sin acuse vuelve a ser reclamable, con la misma identidad y payload.
El retardo entre reclamos aumenta de 30 segundos hasta una hora. Ocho intentos sin acuse agotan el envío.
`POST /{requestId}/reintentar-envio` permite al operador reactivar un envío agotado sin cambiar su identidad.
Reclamar no acredita recepción ni asignación. Un fallo del consumidor después de procesar exige deduplicar por `event_id`.

## Acuses y planificación

`POST /api/v1/solicitudes-devolucion/{requestId}/eventos` recibe hechos con esta envoltura:

```json
{
  "schema_version": 1,
  "event_id": "UUID del hecho",
  "causation_id": "UUID del evento solicitado",
  "event_type": "planning.received",
  "occurred_at": "2026-11-13T15:00:00Z",
  "lease_token": "UUID devuelto al reclamar"
}
```

El primer hecho es `planning.received` y confirma la recepción durable del consumidor.
Después puede comunicar `planning.no_candidate`, `planning.failed` o `planning.assigned`.
La asignación agrega `assignment_id`, `attempt_id`, `request_item_id`, `route_id`, `stop_id` y `assigned_quantity` entero positivo.
Planificación crea previamente el viaje y su guía de recolecta del pedido autorizado; este endpoint solo valida y registra su vínculo.
No crea viajes ni paradas. No interpreta `delivered` genérico como entrega de mercancía al almacén.
Reenviar igual `event_id` y payload devuelve 200/`duplicate:true`; contenido distinto devuelve 409.
UUID, versión o fecha inválidos devuelven 400; identidad ajena devuelve 404; relaciones incompatibles, 422;
saldo, lease o causalidad incompatibles, 409. Ninguno de esos errores confirma el evento.
Los eventos tardíos conservan fecha del hecho y de aceptación. Nunca sobrescriben el historial ni deshacen recogidas aceptadas.
Los eventos de falta de candidato o fallo no liberan asignaciones pendientes de ejecución: se debe cerrar el intento explícitamente.

## Tracking y compatibilidad

Las identidades y cantidades del contrato son aditivas. Las guías históricas sin asignación conservan sus endpoints y evidencias.
Una acción offline sigue pendiente en el teléfono hasta recibir respuesta del servidor. Su `client_id` estable protege los reintentos.
Las pruebas locales con dobles no certifican el consumidor externo, el APK publicado ni un recorrido integrado.

## Ejecución y entrega física

La agenda móvil agrega `collection` por parada: solicitud/artículo/asignación/intento/línea de pedido,
cantidades solicitada y asignada, resultado aceptado y evento de entrega. `collection_proofs` contiene los
`client_id` de foto y firma confirmadas. El origen de la parada usa el snapshot autorizado de la solicitud.

La transición de recogida agrega `schema_version:1` y `collection_results`. Cada resultado incluye
`request_id`, `request_item_id`, `assignment_id`, `attempt_id`, `collected_quantity` y, si es positiva,
`photo_client_id` y `signature_client_id`. La cantidad debe estar entre cero y la asignada; un fallo registra cero.
El resultado parcial libera únicamente el saldo no recogido para otra asignación. El resultado aceptado es inmutable.

`POST /api/mobile/v1/paradas/{id}/recolectas/entregar` es el evento auténtico que crea Por recibir.
Requiere token del chofer dueño del viaje, `schema_version:1`, `client_id` UUID, `attempt_ids`, ubicación y
`occurred_at` estable del dispositivo. Si no se verifica la geocerca del almacén histórico, exige un motivo explícito.
La cantidad y la foto se toman del resultado aceptado de cada intento, nunca de una cantidad enviada al entregar.
La repetición devuelve las mismas devoluciones, incluso con un nuevo `client_id`, sin marcar recepción en almacén.
Cada fila física conserva solicitud/artículo, pedido/línea, parada, cantidad y foto propios.

El viaje sigue abierto y visible mientras exista mercancía recogida sin entrega confirmada. El chofer puede guardar
recogida y entrega sin conexión; FIFO envía primero las evidencias, después la recogida y por último la entrega.
Las cantidades locales pendientes se distinguen de las confirmadas. La bandeja web solo muestra hechos del servidor.
Un envío sin acuse no se presenta como asignado. Una entrega parcial no se presenta como solicitud completada.

El APK anterior conserva contracamión plano, evidencias y paradas históricas. Los reenvíos ya aceptados sin línea
persistida siguen siendo idempotentes. Una recolecta correlacionada nueva requiere la versión de app que captura
cantidades e identidades; una app anterior recibe `collection_version_required` y no inventa una recogida completa.
Tracking web consulta identidades, pero sus transiciones genéricas no pueden alterar esos intentos.

SQL72/73 deben existir antes de publicar estos escritores y lectores. El gate de Tarifas con
`TMS_RETURNS_GATE` activo toma el mismo bloqueo por viaje y contempla recolectas aún sin devolución física.
La bandera inactiva conserva la omisión del gate. El rollback SQL rechaza cualquier historial usado; no constituye
una estrategia para borrar eventos después de publicar. La tarea 10 y la publicación integrada siguen pendientes.
