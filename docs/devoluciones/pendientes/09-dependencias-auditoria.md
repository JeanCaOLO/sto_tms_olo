# 09 — Dependencias y pendientes transversales de la sesión

**Estado:** pendiente por implementar o verificar, según la tabla. Corte: 2026-11-12.

> **Continuación autorizada:** las reglas 4B de código se implementaron localmente; ver `docs/tarifador/pendientes/04-reglas-4b-implementadas.md`. La autorización de seguridad dejó de ser bloqueo para ese trabajo. Se mantienen pendientes concurrencia de dos conexiones, CHECK de esquema y la decisión D4; esta fila histórica no significa que los guards sigan solo en navegador.

Este inventario conserva los pendientes de los cuatro módulos sin autorizar cambios en otros módulos, infraestructura, seguridad o datos compartidos. Los detalles funcionales de Devoluciones v2 están en los planes propios; no se reemplazan por el contrato comercial histórico T04–T06.

| ID | Qué falta / cómo continuar | Responsable o límite |
|---|---|---|
| AUD-06 / 4B | Revalidar controles backend de marcas, motivos, actor, edición por fase, importes inmutables y totales recalculados. Probar dos transacciones con bloqueo común. Resolver reglas de negocio antes de implementar. | Tarifas; controles de seguridad/integridad requieren autorización específica según el alcance anterior. Sin DDL compartido. |
| AUD-09 | Medir resumen global de Tracking, consistencia de KPI y llamadas con volumen. | Tracking; cambios locales con regresión primero. |
| AUD-10 | A4/A5/A6: autorización y exposición de OMS/eFlow. | Otros módulos; entregar evidencia a sus responsables. |
| AUD-11 | Authorizers, protección HTTP/WS, WAF compatible y logs sin datos sensibles. | Infra/Intelix; no consultar ni cambiar AWS. |
| AUD-12 | OAuth state de un solo uso y prevención de replay. | Seguridad y almacenamiento durable; diseño y autorización previos. |
| AUD-13 | Idempotencia durable del envío Gmail y resultados ambiguos. No reenviar automáticamente ante timeout. | Tarifas-mail/infra; pruebas locales y cuenta de prueba del usuario para E2E. |
| AUD-14 | Firma, distribución del APK y binarios/historial Git. | Usuario decide canal/firma; sin reescribir historial ni disparar builds. |
| AUD-15 | Cifrado SQLite con transición y conservación de outbox. | App; requiere diseño de migración y política, no borrar datos pendientes. |
| AUD-16 | Política HTTPS de release conservando Metro en desarrollo; verificar APK. | Decisión de producto/seguridad antes de cambiar fallback. |
| AUD-17 | Retención GPS y cola offline. | Política de negocio; conservar posiciones pendientes. |
| AUD-18 | Diferir xlsx y comprobar exportaciones de todos los consumidores de DataTable. | Componente compartido fuera del alcance de correcciones anteriores. |
| AUD-19 | Revisar publicación de sourcemaps. | Hosting/infra. |
| AUD-20 | Medir invocaciones, Duration, Max Memory Used, conexiones y consultas; evaluar arm64/memoria después. | Infra/Intelix; sin métricas AWS no hay ahorro monetario demostrado. |
| AUD-21 | Proveedores, atribución y límites de OSM/OSRM. | Decisión operativa y costos; no contratar servicios desde la auditoría. |
| AUD-22 | Medir scan/fanout realtime con volumen y concurrencia. | Tracking/realtime; infraestructura queda pendiente. |

## Resuelto que no debe repetirse

AUD-01: consultas N+1 de Tracking; AUD-02: respuestas antiguas de formularios; AUD-03: rango entero de recepción; AUD-04: puntos GPS inválidos; AUD-05: backup Android; AUD-07: acceso a más de 500 viajes. AUD-23 fue una limitación de herramientas resuelta, no un defecto de producto.

F1/F2 de frescura de catálogo y perfil están resueltos en código y pruebas. Falta el escenario real donde otra sesión modifica tarifa/perfil antes de emitir. Polling oculto/backoff ya estaba implementado; no añadir otra solución sin demostrar regresión.

## Dependencias de Devoluciones

El estado reconciliado de la rama recibida documenta m08 y SQL67 aplicadas en otro trabajo autorizado. Esta sesión no las consultó en AWS ni las reejecutó. SQL65/66, rutas publicadas, permisos S3/CORS y frontend requieren verificación del responsable de despliegue; las evidencias históricas no certifican el ambiente actual. Solo Jean puede desplegar según el estado recibido.

Recepciones parciales v2, empresa por pedido, contratos de Planificación y cambios de esquema se preparan según `PLAN_DEVOLUCIONES_V2.md`, sin asumir permiso para ejecutarlos. No reintroducir aprobar/rechazar solicitudes nuevas: ese flujo fue reemplazado en la especificación v2; conservar decisiones antiguas como historial.
