# Plan vigente: solicitudes automáticas, seguimiento y novedades

**Corte:** 2026-11-12. **Estado:** autoaprobación, bandeja de lectura y novedades implementadas y en verificación local. Seguimiento integrado con Planificación/Tracking pendiente. Nada de esta continuación está desplegado.

## Decisiones confirmadas

- El rol visible se llama **Cliente**, reemplazando «Asesor de ventas» de la propuesta anterior. Puede crear para su empresa. Superusuarios y gerentes pueden crear para una empresa dentro de su alcance, con sus permisos efectivos.
- Se solicita desde **Devoluciones → Solicitudes → Crear solicitud**. Se elimina la entrada separada **Mis Devoluciones**; su URL anterior redirige al módulo unificado.
- Las solicitudes nuevas se **aprueban automáticamente al crearse**. No esperan aprobación/rechazo manual en la bandeja. Esa aprobación no certifica que Planificación haya asignado un viaje ni que la mercancía se haya recogido o recibido.
- La bandeja Solicitudes sirve para **visualizar el avance**: pendiente/en Planificación, en Tracking y entregada por Tracking.
- Al reportarse la entrega en Tracking, la devolución pasa a **Recepción por viajes → Por recibir**, con la foto tomada durante la recolecta. El almacén todavía debe confirmar lo que físicamente llegó.
- En Recepción por viajes habrá **Novedades**. Una devolución incompleta o averiada puede registrarse allí, con explicación obligatoria, y queda **En revisión**.
- **Última aclaración del usuario:** la novedad solicita únicamente un texto. La aceptación se decidirá internamente después; no se añaden campos de tipo/cantidad ni acciones de aceptar/resolver en esta etapa.
- **Confirmado por el usuario:** con `TMS_RETURNS_GATE` activo, una novedad abierta **bloquea la liquidación hasta resolverse**.
- La configuración e implementación del receptor en **Planificación queda como pendiente**, con entrega técnica separada. No se implementa desde Devoluciones ni se simula una asignación.

## Secuencia de implementación

### S1 — Autoaprobación y bandeja de seguimiento

Implementados localmente los puntos 1, 2, 3 y 5. El punto 4 requiere los eventos y vínculos pendientes de S2/Planificación.

1. Crear solicitud, artículos y registro de aprobación automática en una transacción idempotente. Registrar origen automático, usuario creador y hora servidor; no atribuir una aprobación manual inexistente.
2. Quitar acciones de aprobar/rechazar del recorrido nuevo. Conservar lectura y auditoría de decisiones históricas; no convertir solicitudes rechazadas ni vinculadas por una actualización masiva.
3. Mostrar «Pendiente de Planificación» mientras no exista recepción real del mensaje por ese módulo. Mostrar «En Planificación» solo cuando se haya confirmado esa recepción; la aprobación automática no es ese acuse.
4. Derivar «En Tracking» de la asignación/ejecución real y «Entregada» del evento de finalización aceptado por el servidor. Un evento todavía en outbox móvil no hace avanzar la bandeja.
5. Mantener empresa/país/scope y autor en todas las consultas. Cliente ve sus solicitudes; la bandeja operativa aplica el alcance del usuario.

**Aceptación:** doble envío produce una solicitud; una creación nueva no muestra botones de decisión manual; no aparece un viaje asignado por defecto. El reintento devuelve su misma aprobación automática.

### S2 — Entrega de Tracking a Por recibir

1. Correlacionar solicitud, artículo, asignación/intento, parada y evidencia de recolecta con IDs estables. No relacionar fotos solo por empresa o por compartir viaje.
2. Al aceptar el evento de entrega correspondiente, crear o actualizar una sola devolución física **pendiente de recepción**. Recibir el evento dos veces no crea otra devolución.
3. Reutilizar la evidencia de Tracking mediante referencias autorizadas y URLs renovables. Conservar la foto original y el vínculo; no descargarla/subirla otra vez por cada apertura.
4. Mostrar cantidades solicitada, recogida y entregada por Tracking cuando existan. La cantidad confirmada en almacén sigue siendo independiente.
5. Mantener contracamión como origen físico separado y compatible: no exige crear una solicitud ficticia de Cliente para poder recibirlo.

**Aceptación:** solicitud entregada aparece una vez en Por recibir, con su foto correcta. Una foto de otra parada/empresa es rechazada. La entrega de Tracking no marca automáticamente la recepción de almacén.

### S3 — Novedades de recepción

1. Añadir la sección/pestaña **Novedades** dentro de Recepción por viajes, conservando las listas existentes. Ofrecer las acciones **Recibir** y **Registrar novedad** sobre la devolución que llegó.
2. Pedir únicamente la explicación obligatoria, de 1 a 1000 caracteres. El servidor registra actor y fecha y conserva el estado/cantidad de recepción preexistentes como historial, sin pedirlos ni inventarlos. Mantener la foto existente y la identidad del viaje/artículo.
3. La acción Novedad mueve esa devolución a **En revisión**. Si un viaje conserva otras devoluciones normales pendientes, estas siguen en Por recibir; la línea con novedad no se presenta como una recepción normal terminada.
4. Separar los conteos de pendientes normales y novedades. Una suma de pendientes normales igual a cero no puede mostrar «Listo para liquidar» si quedan novedades abiertas.
5. La aceptación interna y su eventual mecanismo de resolución quedan pendientes. La entrega actual no expone botones ni endpoints de aceptar/resolver y no borra el historial. Mientras permanezca en revisión, no se puede recibir o rechazar por las acciones normales ni añadirla a un formulario nuevo.
6. Proteger el registro con idempotencia y bloqueo del mismo registro. Dos operadores no deben recibir y abrir una novedad simultáneamente con éxito incompatible. Un reintento incierto conserva texto y clave.

**Aceptación:** texto vacío se rechaza; una avería con todas las unidades puede ir a Novedades; el registro no altera cantidades preexistentes. El historial conserva la explicación. La revisión no se acepta automáticamente.

### S4 — Bloqueo y compatibilidad de liquidación

1. Incluir novedades abiertas en el predicado servidor de `returns_gate`, conservando el comportamiento del flag. No depender de una advertencia del navegador.
2. Actualizar SQL/vista, conteos, lectores y pruebas de Tarifas y Devoluciones de forma coordinada. Los clientes antiguos tampoco deben interpretar una novedad como viaje listo.
3. Pendiente para el flujo interno futuro: al aceptar/resolver, recalcular la situación real. Si queda otra devolución pendiente o novedad abierta, el gate deberá seguir bloqueando. No implementar una liberación implícita ahora.
4. Preparar migración aditiva y rollback que se niegue a perder novedades/historial utilizados. No modificar SQL67 ni reaplicar migraciones anteriores por suposición.

**Aceptación actual:** con flag activo, una novedad abierta participa del predicado servidor existente del gate. Con flag apagado, no se introduce una activación implícita. No se revierten liquidaciones ya emitidas.

## Planificación: pendiente explícito y entrega

El trabajo del módulo externo se detalla en [configuración e integración de recolectas](PENDIENTE_PLANIFICACION_RECOLECTAS.md). Esta etapa prepara contrato y dobles locales; **no incluye configurar ni ejecutar el consumidor real de Planificación**.

## Pruebas y límites

- TDD local: creación automática, idempotencia, visibilidad por empresa/autor/país, apertura de novedad, conservación de foto existente y gate. Transición real a Tracking/Por recibir y resolución interna quedan pendientes.
- PostgreSQL aislado para constraints, compatibilidad histórica, transacciones y rollback. Concurrencia real requiere dos conexiones; PGlite de una instancia no la certifica.
- Chrome con API interceptada: crear solicitud y registrar una novedad sobre una devolución simulada ya existente. No certifica integración real de Planificación ni la entrega futura de Tracking.
- No se desplegará en AWS ni se aplicarán migraciones compartidas durante esta preparación. Registrar por separado lo preparado, lo probado localmente y lo pendiente de publicación.

## Qué existe hoy y qué falta

El botón, formulario, roles de captura, navegación unificada y conservación del intento están implementados localmente. SQL68 prepara la captura de gerentes/superusuarios sin asignación personal; SQL69 registra la autoaprobación con procedencia explícita; SQL70 incorpora novedades y sus conteos. Ninguna está aplicada en un ambiente externo.

**Implementado localmente:** nuevas solicitudes aprobadas automáticamente, bandeja sin aprobación/rechazo manual, etiqueta honesta de pendiente de Planificación, Novedades con texto y estado En revisión, historial inmutable, recepción normal completa/en buen estado y bloqueo del gate. Se conserva la lectura de decisiones históricas sin convertirlas en automáticas.

**Pendiente:** consumidor de Planificación, correlación y eventos reales hasta Tracking/Por recibir con la foto de recolecta, aceptación interna posterior, pruebas de escritura reales y publicación. La implementación anterior de T04–T06 se conserva como evidencia histórica; no certifica estas integraciones futuras.
