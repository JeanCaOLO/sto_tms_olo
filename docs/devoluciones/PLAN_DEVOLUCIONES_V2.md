# Plan de implementación: módulo Devoluciones v2

**Estado:** pendiente de implementación. El documento define alcance y secuencia; no certifica que los cambios estén hechos.

> **Prioridad funcional, actualización posterior del 2026-11-12:** [plan de Solicitudes automáticas y Novedades](PLAN_SOLICITUDES_Y_NOVEDADES_2026-11-12.md). Sustituye «Asesor de ventas» por Cliente y agrega captura para superusuarios/gerentes, autoaprobación, seguimiento y Novedades con bloqueo del gate. [Configurar Planificación](PENDIENTE_PLANIFICACION_RECOLECTAS.md) queda pendiente explícito de su responsable.

## Objetivo

Dar soporte al rol **Asesor de ventas** para solicitar devoluciones y a **Devoluciones** para controlar su avance y confirmar la mercancía recibida en almacén. La decisión comercial de aprobar/rechazar deja de formar parte del flujo. La planificación y la ejecución del viaje pertenecen a sus módulos; el módulo Devoluciones consume y muestra esos avances.

## Situación de partida y compatibilidad

El código y los documentos T04–T06 locales implementan solicitudes con estados comerciales y bandeja de aprobación/rechazo. La base contiene el contrato histórico de SQL67 y puede tener datos legados. Por tanto:

- No retirar ni reinterpretar SQL67: crear una migración nueva y aditiva, con revisión y entrega a Jean. No aplicarla a la BD compartida durante la preparación.
- No borrar las pantallas, auditoría ni metadatos de decisión históricos. Ocultar las acciones comerciales para el flujo nuevo y conservar lectura histórica donde corresponda.
- No convertir solicitudes anteriores automáticamente. Definir reglas de transición para cada estado histórico; solicitudes rechazadas, aprobadas, enlazadas a devoluciones o inconsistentes requieren tratamiento explícito y auditable.
- Evitar que una validación heredada de “solo solicitud aprobada” bloquee la creación de nuevas paradas o enlaces v2. Versionar/ajustar el contrato con compatibilidad histórica, sin simular una aprobación.
- El rol visible “Asesor de ventas” puede reutilizar la identidad y el scope actual del usuario de empresa. Cambiar etiquetas sin renombrar claves técnicas hasta demostrar compatibilidad de permisos, datos y clientes.

## Decisiones funcionales acordadas

- El Asesor de ventas crea solicitudes solamente para su empresa y consulta sus propias solicitudes.
- La solicitud se entrega directamente a Planificación; no requiere aprobar/rechazar.
- La ubicación se obtiene de una orden/guía original autorizada y su cliente final/dirección/zona. El formulario permite productos manuales/simulados.
- Se permiten recogidas y recepciones parciales, con cantidades acumuladas e historial por artículo.
- Un saldo no recogido se reasigna automáticamente por Planificación. Cantidad ya recogida pero no recibida permanece **en camino** y nunca regresa a recolecta.
- Contracamión se origina en Tracking mobile y entra directamente a la bandeja en **en camino**, sin solicitud ni planificación previas.
- Tracking mobile requiere foto de mercancía y firma, además de cantidad real recogida. Los eventos offline solo avanzan el estado tras aceptación del servidor.

## Fases del módulo

### D1. Contrato de estados y transición histórica

1. Definir el modelo de lectura de los cuatro estados visibles: `en solicitud`, `recolecta`, `en camino`, `en almacen`.
2. Derivar estado y contadores de asignaciones, cantidades recogidas y recepciones; evitar un campo editable por usuario como fuente de verdad.
3. Añadir un ledger/eventos o modelo equivalente para recepciones parciales, correcciones e idempotencia. No sobrescribir el total recibido sin conservar auditoría.
4. Diseñar migración nueva, reversible y no destructiva que soporte solicitud-artículo, asignación, intento, ejecución móvil y recepción. Respetar vínculos/constraints históricos y las filas de SQL67.
5. Preparar una matriz de mapeo de datos históricos y casos que exigen revisión; no inventar autorización ni resultados físicos.

**Salida:** contrato de datos aprobado y migración propuesta con validación, orden de despliegue y rollback que se niega a perder historial utilizado.

### D2. Captura del Asesor de ventas y entrega a Planificación

1. Renombrar etiquetas y navegación a **Asesor de ventas**; conservar la clave de rol y permisos actuales hasta probar el cambio de identidad de extremo a extremo.
2. Exigir asociación a la empresa del usuario autenticado. Seleccionar la orden/guía original permitida y mostrar cliente final, dirección, zona y almacén resueltos; bloquear si falta una relación crítica o hay incoherencia de empresa/organización.
3. Mantener código y nombre de producto manuales, cantidad, motivo, descripción y evidencias; validar límites y tipos existentes.
4. Persistir solicitud, artículos, evidencias y mensaje/outbox de planificación en una transacción o patrón transaccional equivalente. Clave idempotente estable por envío. La respuesta confirma recepción en cola, no asignación.
5. Retirar botones y endpoints de aprobar/rechazar del recorrido nuevo. Rutas legadas deben responder de forma explícita y segura, nunca efectuar una decisión silenciosa; conservar la lectura histórica y su auditoría.
6. Reforzar “mis solicitudes” a empresa y autor; conservar autorización por país/scope para los operadores.

**Salida:** captura y bandeja de Asesor de ventas operativas en local, solicitud entregada una sola vez a Planificación y contrato documentado.

### D3. Bandeja unificada de Devoluciones

1. Unificar solicitudes de recolecta y devoluciones físicas de contracamión en la navegación de una sola bandeja, con origen visible.
2. Mostrar estado, número, empresa, Asesor de ventas/chofer, cliente final, artículos, cantidades solicitadas/asignadas/recogidas/recibidas, viaje/parada activa e incidencias.
3. Añadir filtros por estado, empresa, país y origen, respetando scopes. Los catálogos de filtro se obtienen solo de entidades dentro del scope autorizado.
4. Reutilizar detalle y medios con URLs firmadas de corta duración; no exponer llaves de almacenamiento ni saltarse autorización por ID.
5. Quitar acciones de aprobar/rechazar para las solicitudes nuevas. Mantener historial antiguo de decisiones en lectura cuando sea útil.

**Salida:** bandeja única que refleja el estado operativo, sin decisión comercial.

### D4. Recepción en almacén

1. Presentar checkbox/acción “Mercancía recibida” únicamente para una cantidad con recogida física confirmada o contracamión registrado.
2. Antes de confirmar, mostrar artículo y saldo pendiente y solicitar cantidad realmente recibida; permitir parcialidades sin sobrepasar cantidad recogida menos recepciones previas.
3. Guardar recepción idempotente con actor, fecha/hora, almacén, cantidad, condición/nota e incidencia cuando exista.
4. Dejar parcial abierto y mostrar saldo; asignar **en almacen** solamente cuando todas las cantidades solicitadas estén recibidas. Si existe faltante en una cantidad ya recogida, abrir incidencia de almacén; no solicitar otra recolecta.
5. No permitir desmarcar para borrar una recepción. Correcciones requieren flujo compensatorio, permiso explícito, motivo y auditoría.
6. Preservar compatibilidad de la vista/compuerta de devoluciones físicas usada por etapas posteriores; verificar referencias antes de cambiar filtros o estados.

**Salida:** recepción de recolectas y contracamión verificable por cantidad, segura ante doble clic y auditable.

### D5. Seguimiento, errores y operación

- Diferenciar falta de candidato, parada cancelada, resultado móvil negativo, sincronización pendiente, diferencia de almacén y referencia inconsistente.
- Permitir reintento de entrega a planificación sin duplicar solicitud ni asignaciones activas.
- Mostrar fecha de última sincronización y origen del estado; dar a soporte IDs correlacionables sin exponer PII innecesaria.
- Registrar discrepancias y correcciones sin eliminar eventos anteriores.

## Criterios de aceptación del módulo

- El Asesor de ventas crea una solicitud con la empresa autenticada y solo ve las propias.
- Guardar la solicitud la pone inmediatamente en cola de Planificación; no aparece una aprobación pendiente de Devoluciones.
- Las solicitudes y contracamión aparecen juntas y claramente distinguidas en la bandeja de Devoluciones.
- El checkbox de almacén no puede marcar como recibida mercancía aún en el cliente ni un evento móvil no confirmado.
- Recepciones parciales actualizan conteos sin duplicar ni exceder cantidades. El estado terminal aparece únicamente al recibir todo.
- Datos, adjuntos e historial respetan organización, empresa, país y scopes; medios se consultan por referencia autorizada.
- Reintentos de captura, cola, móvil y recepción producen un solo efecto lógico.
- La operación histórica no se pierde ni recibe decisiones fabricadas durante la transición.

## Verificación por fase

- **Automatizada:** pruebas unitarias de estado derivado y cantidades; contrato API; autorización por rol/empresa/país; idempotencia y concurrencia; migración en PostgreSQL aislado; regresiones de filtros, archivos y bandeja.
- **Integración:** captura → cola → asignación → evento de Tracking → recepción, incluyendo parcialidades, sin candidato, reasignación, contracamión y sincronización offline tardía.
- **Manual/E2E:** perfiles Asesor, Planificación, Chofer y Devoluciones; dos empresas y scopes distintos; revisión en móvil y web.
- No usar datos reales para pruebas destructivas. Usar dobles o fixtures identificables y aislados, con limpieza limitada a esos fixtures.

## Dependencias y entregables

1. Aprobar contrato de ubicación, estados, cantidades y transición histórica.
2. Entregar migración nueva, SQL de verificación/dry run y rollback a Jean; el agente no aplica DDL compartido ni despliega.
3. Implementar captura/cola y contrato compartido con Planificación.
4. Implementar bandeja unificada y recepción parcial.
5. Cerrar integración móvil/planificación, regresiones y evidencia local; documentar configuración/permisos que Jean debe revisar.

**No incluido:** planificar rutas desde Devoluciones, aprobar/rechazar solicitudes nuevas, desplegar, aplicar una migración compartida, modificar datos reales o integrar un catálogo de productos que actualmente no existe.

## Documentos relacionados

- [Flujo v2](FLUJO_DEVOLUCIONES_V2.md)
- [Plan de Planificación y recolectas](PLAN_PLANIFICACION_RECOLECTAS_V2.md)
- [Contrato histórico T04–T06](CONTRATO_API_SOLICITUDES.md), referencia de compatibilidad, no contrato v2.

