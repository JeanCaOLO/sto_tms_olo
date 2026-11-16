# Plan de implementación: Planificación de recolectas v2

**Estado:** pendiente de implementación e integración. Este plan no afirma que la asignación automática o el contrato móvil ya estén modificados.

## Objetivo y frontera

Recibir automáticamente solicitudes válidas del Asesor de ventas, asignar sus saldos a la ruta futura compatible más cercana y enviar paradas de recolecta a Tracking mobile. Mantener una lista confiable de pendientes y reprogramar solo cantidades que el chofer aún no confirmó haber recogido. Devoluciones confirma la recepción de la mercancía en almacén; Planificación administra viajes, asignaciones y pendientes de ruta.

## Reglas acordadas

1. Priorizar el viaje elegible de fecha futura más cercana, usando fecha local operativa y zona/país coherentes.
2. Entre candidatos de la misma fecha, preferir el mismo cliente final; luego coincidencia de zona. Desempatar de forma estable por secuencia del plan e ID del viaje.
3. Solo considerar viajes aún no iniciados ni liberados, con vehículo asignado y plan modificable.
4. La ubicación proviene de la orden/guía original autorizada de la solicitud; producto puede ser manual/simulado.
5. Soportar cantidades parciales por artículo. Reasignar el saldo no recogido; nunca volver a recolectar cantidad ya recogida aunque siga en camino al almacén.
6. Sin candidato, conservar el saldo **en solicitud**, registrar el motivo y volver a intentar automáticamente al abrirse una oportunidad elegible.
7. No confundir resultado negativo explícito con sincronización pendiente del outbox móvil.

## Hallazgos técnicos que condicionan el diseño

- Ya existen paradas `collection`, una función de agenda de recolectas y un proceso de reconstrucción de planes. Su implementación actual se apoya en filas de devoluciones físicas y un flujo anterior; no debe asumirse que soporta solicitudes v2 sin mercancía creada.
- El modelo actual de parada de colección puede exigir una devolución física existente. Una solicitud aún no recogida no debe representarse inventando esa fila ni una guía/orden nueva.
- El móvil ya conoce paradas collection y pide evidencia (foto de producto y firma). Debe verificarse que pueda mostrar un identificador de solicitud/artículo y cantidad asignada, registrar cantidad efectivamente recogida y aceptar eventos idempotentes.
- La reconstrucción de planes puede borrar/recrear paradas no liberadas. Debe conservar asignaciones e intentos históricos y no duplicar una reserva activa.
- La regla de “más cercano” no reemplaza límites de ruta. No prometer validación de capacidad hasta contar con peso/volumen confiables y reglas confirmadas.

## Fases de implementación

### P1. Contrato de entrada y cola automática

1. Definir evento/registro de trabajo transaccional que nace con la solicitud, artículo y cantidad. Entrega al planificador debe ser al menos una vez e idempotente.
2. El planificador identifica organización, empresa, almacén, país, orden/guía de origen, cliente final, dirección y zona. Rechaza/retiene con error visible relaciones incompletas o incoherentes; no adivina.
3. Separar “solicitud elegible pendiente” de `tbl_returns` (que representa mercancía física). La asignación puede existir antes de la devolución física.
4. Definir reintentos, expiración/alerta de error y correlación de solicitud → artículos → asignaciones → paradas → eventos móviles.

**Salida:** contrato de entrada aprobado y cola recuperable ante fallas sin solicitudes duplicadas.

### P2. Selección de viaje y orden de parada

1. Filtrar por misma organización y empresa/almacén compatible, país/zona válidos y relación original verificable.
2. Exigir fecha operativa futura, vehículo asignado, viaje no liberado/no iniciado y plan modificable.
3. Ordenar por fecha ascendente; preferir mismo cliente final y luego zona; desempatar por posición estable e ID.
4. Insertar parada tras la entrega del mismo cliente final si la ruta aún es editable; en otro caso, usar posición compatible de zona según reglas existentes. No alterar el orden de una ruta liberada.
5. Serializar la reserva/actualización por viaje y solicitud en transacción; revalidar elegibilidad antes de escribir. Proteger frente a dos workers y reintentos concurrentes.
6. Cuando no haya candidato, mantener estado **en solicitud**, con motivo y próxima revisión. No crear viaje ni parada ficticios.

**Salida:** elección determinista y segura de viaje, sin asignaciones dobles ni alteración de rutas iniciadas.

### P3. Persistencia de asignaciones y reconstrucción de plan

1. Crear entidad/versionado de asignación de solicitud-artículo a viaje/parada con cantidad asignada, estado y fechas. Una asignación conserva identidad aunque cambie de viaje.
2. Vincular parada a esa asignación, sin exigir una devolución física preexistente. Mantener compatibilidad con paradas legacy basadas en `return_id`.
3. Al cambiar la planificación, reemplazar solo la asignación activa no ejecutada; registrar viaje/parada previos, causa y actor/proceso. Mantener intentos y reservas de cantidades recogidas.
4. Impedir que el rebuild ordinario elimine o duplique una parada con ejecución pendiente, confirmada o con sincronización móvil abierta.
5. Aplicar cambios a SQL mediante migración nueva, aditiva y reversible. No modificar SQL67 ni reutilizar su rollback; entregar scripts y dry-run a Jean.

**Salida:** asignaciones duraderas e historial trazable a través de replanificaciones.

### P4. Tracking mobile y confirmación de recogida

1. Incluir en la parada: ID estable de solicitud/artículo/asignación, nombre/código, cantidad asignada y saldo permitido, cliente final, ubicación y notas.
2. Permitir al chofer registrar cantidad real recogida, evidencia fotográfica de la mercancía y firma, además de resultado/incidencia cuando no se recoge.
3. Validar en servidor autorización del chofer sobre el viaje y cantidades dentro del saldo. Operación móvil debe ser idempotente por ID de evento/cliente.
4. Solo después de guardar/aceptar el evento en servidor reservar definitivamente la cantidad como recogida y reflejar **en camino**. Mientras está offline o en outbox queda “pendiente de sincronizar”; no se reasigna.
5. Crear el registro físico `tbl_returns`/guía o enlace operativo en el punto correcto de confirmación positiva, con orden y empresa coherentes. Nunca al crear la solicitud o solo al asignar una parada.
6. Mantener evidencia disponible en Devoluciones con autorización por IDs, sin exponer claves del bucket.

**Salida:** cantidad recogida confirmada y visible en la bandeja con evidencia asociada, una sola vez.

### P5. Pendientes, reasignación y eventos tardíos

1. Al cerrar/conciliar un viaje, computar cantidades asignadas, recogidas confirmadas, negativas explícitas, pendientes de sincronización y saldo sin recoger por artículo.
2. Reprogramar automáticamente solo cantidades explícitamente no recogidas o asignaciones anuladas de forma segura, manteniendo IDs y motivo. Pendientes offline se retienen para conciliación, no se duplican.
3. Una confirmación tardía del viaje anterior debe reconciliarse contra el saldo reservado antes de activar otra asignación. Si colisiona con un nuevo intento, enviar a resolución auditada sin duplicar recogida ni cantidad.
4. Una cantidad recogida y aún no recibida sigue **en camino**; no vuelve a la parada. Las faltas de recepción se atienden como incidencia de almacén.
5. Exponer a Planificación conteos y detalle por artículo: asignado, recogido, pendiente/no ejecutado, esperando sincronización, en camino y recibido.

**Salida:** tablero de conciliación y reprogramación precisa, incluso con móviles offline y recepciones parciales.

## Ejemplo de conciliación

Solicitud de 10 unidades: viaje A recibe asignación de 10. El chofer confirma 5 recogidas y reporta explícitamente 5 no recogidas. Planificación mantiene las 5 confirmadas en su intento original y crea una asignación nueva para las otras 5 en el próximo viaje elegible. Si de las 5 recogidas el almacén recibe solo 3, quedan 3 en almacén y 2 en camino; esas 2 no se ofrecen de nuevo al chofer. El agregado muestra etapa pendiente más temprana y los contadores permiten ver ambas cantidades.

## Ejecución automática

- Reutilizar el mecanismo programado existente de Planificación/SAM tras verificar ventana operativa, zona horaria, carga y permisos. Programar sondeo de pendientes con frecuencia operativa adecuada (propuesta inicial: cada minuto durante la ventana de planificación) y ejecutar también tras eventos de nueva solicitud o nuevo viaje elegible si existe una vía segura.
- La tarea debe ser idempotente, reentrante, observable y limitada por lote; registrar fallos y reintentar con backoff sin bloquear rutas.
- La ejecución de calendario nunca libera viajes ni despliega. Revisar permisos IAM mínimos y configuración con Jean antes de cualquier publicación.
- No usar un cron nuevo a ciegas: acordar frecuencia, horario, zona, límites de concurrencia y tratamiento de días festivos con Planificación.

## Pruebas y criterios de aceptación

- Elige fecha más cercana; desempata mismo cliente final, zona y orden estable.
- Excluye viajes pasados, iniciados, liberados, sin vehículo y no modificables.
- Maneja candidato inexistente y reintento al surgir un viaje compatible.
- Una solicitud duplicada o workers concurrentes producen una sola asignación activa/parada.
- Parcialidad: 10 asignadas, 5 recogidas y 5 explícitamente no recogidas → solo 5 reasignadas.
- 5 recogidas, 3 recibidas y 2 aún en camino → ninguna de esas 5 se vuelve a asignar.
- Evento offline sin sincronizar no se trata como no realizado; confirmación tardía se reconcilia.
- Rebuild del plan preserva historia, ejecución y reservas; viaje liberado no cambia.
- Aislamiento por organización, empresa, país, warehouse, rol y chofer de viaje.
- Contracamión permanece fuera de la asignación de recolectas y entra a la bandeja desde Tracking.

## Secuencia de entrega

1. Acordar contrato de datos y reglas de compatibilidad histórica con Devoluciones, Planificación y Mobile.
2. Preparar migración y pruebas aisladas; entregar dry-run, verificación y rollback a Jean.
3. Implementar cola y asignación, luego integración con constructor/reconstructor de planes.
4. Implementar contrato de parada, registro móvil e idempotencia.
5. Implementar conciliación, pendientes, reintentos y vista de Planificación.
6. Verificar integración completa con datos sintéticos aislados, revisión IAM y plan de despliegue/rollback de Jean.

## Documentos relacionados

- [Flujo v2](FLUJO_DEVOLUCIONES_V2.md)
- [Plan del módulo Devoluciones](PLAN_DEVOLUCIONES_V2.md)
- [Entrega histórica a Planificación](ENTREGA_PLANIFICACION_RECOLECTAS.md), conservar como evidencia del flujo anterior y reutilizar únicamente las reglas aún compatibles.

