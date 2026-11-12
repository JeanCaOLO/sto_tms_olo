# Solicitudes automáticas y novedades de recepción

## Comportamiento preparado

Las solicitudes nuevas quedan aprobadas automáticamente al crearse. Se conservan creador, hora del servidor y origen automático en la misma transacción que sus artículos. Reintentar una creación no crea otra solicitud ni otra aprobación. Las decisiones históricas conservan su procedencia; no se convierten por actualización masiva.

La bandeja Solicitudes permite crear y consultar, sin botones de aprobar/rechazar. Muestra pendiente de Planificación mientras no exista la integración real. La aprobación automática no representa un viaje asignado ni una entrega.

En Recepción por viajes, Registrar novedad abre un diálogo con **un solo campo de texto**, obligatorio, de 1 a 1000 caracteres. No pide tipo, cantidad ni resolución. El servidor registra autor, fecha y estado anterior sin cambiar cantidades de recepción preexistentes. La devolución aparece en Novedades con estado En revisión y conserva su foto existente.

Una recepción normal confirma mercancía completa y en buen estado. Una diferencia de cantidad o una avería debe registrarse como novedad. Recibir todas omite las devoluciones en revisión. Las acciones normales de recibir/rechazar y la creación de formularios no permiten sacar una devolución de revisión ni aceptarla indirectamente.

Con `TMS_RETURNS_GATE` activo, las novedades abiertas participan del bloqueo servidor. Los conteos conservan los pendientes totales para clientes anteriores y separan pendientes normales de novedades para la pantalla actual. El flag no se activa implícitamente y no se revierten liquidaciones ya emitidas.

## Integridad y permisos

- Registrar exige `devoluciones:edit`; consultar historial exige `view`. Se mantienen organización y país del usuario.
- La novedad bloquea la fila de devolución y comparte ese bloqueo con la creación de formularios. Una clave idempotente identifica el intento; la misma clave con otro texto devuelve conflicto.
- Si la respuesta se pierde, el diálogo mantiene texto y clave para reintentar. No permite enviar otro texto ni cerrar el intento incierto desde ese diálogo.
- El historial rechaza modificaciones y borrado. Un constraint diferido impide confirmar una inserción directa de historial sin dejar su devolución en revisión.
- La foto actual se conserva por referencia. Esto no implementa todavía el vínculo futuro entre solicitud y foto de recolecta.

## Preparación de publicación, sin ejecución

Los scripts **68, 69 y 70**, con sus respectivos rollback, están preparados. SQL68 admite captura de gerentes/superusuarios con empresa autorizada; SQL69 añade procedencia de autoaprobación; SQL70 añade historial, estado y vista/conteos de novedades. El backend actualizado depende de ese esquema. No publicar código contra el esquema anterior.

No se aplicó SQL a Aurora ni a otra base compartida. No se desplegó en AWS. Las dos rutas nuevas del template de administración están preparadas con el autorizador existente; requieren publicación posterior por el responsable del ambiente. Los rollback de 69/70 se niegan a retirar datos ya utilizados.

## Pendientes explícitos

1. [Configurar Planificación para recibir las recolectas solicitadas](PENDIENTE_PLANIFICACION_RECOLECTAS.md), con correlación durable, acuse y asignación real. Se mantiene fuera de esta implementación por indicación del usuario.
2. Integrar los eventos reales de Tracking para mostrar En Tracking/Entregada y crear una sola devolución Por recibir con su foto de recolecta correcta. Actualmente no existe ese enlace completo; no se simula como funcionalidad publicada.
3. Definir y construir la aceptación interna posterior de una novedad. La entrega actual **no tiene botón ni endpoint de aceptar/resolver**. En revisión continúa bloqueando mientras el gate esté activo.
4. Probar concurrencia con dos conexiones PostgreSQL reales. PGlite certifica SQL y transacciones locales de una instancia, no carreras entre conexiones ni planes/latencia de Aurora.
5. Validar roles, escritura y evidencias en el ambiente que autorice el usuario, y publicar esquema/backend/frontend de forma coordinada. No forman parte de las pruebas simuladas de Chrome.

## Evidencia local

Los logs están en `TMS/.test/integracion_2026-11-12/`. Los fallos iniciales se conservan: `auto-approval-red.log` si está disponible, `incidents-ui-red.log`, `incident-form-red.log` e `incident-ledger-red.log`. El cierre ejecutado y los nombres exactos de logs se registran en `auditoria/2026-11-12/solicitudes-novedades-verificaciones.json`.

Se sustituyeron las pruebas de las acciones manuales retiradas por pruebas del comportamiento de bandeja de lectura. Las pruebas del contrato histórico del backend se conservan. Los números anteriores de `CIERRE_CONTINUACION_2026-11-12.md` son un corte previo, no el resultado del código posterior.
