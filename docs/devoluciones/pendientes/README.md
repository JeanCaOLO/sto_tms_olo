# Devoluciones — pendiente por implementar

> **Última aclaración del usuario:** [Solicitudes automáticas y Novedades](../PLAN_SOLICITUDES_Y_NOVEDADES_2026-11-12.md) es la definición funcional vigente. [La entrega local](../SOLICITUDES_AUTOMATICAS_Y_NOVEDADES_2026-11-12.md) incluye Crear solicitud, autoaprobación y Novedades únicamente con texto. Una novedad en revisión bloquea liquidación con gate activo. La aceptación interna, el seguimiento integrado y [Planificación](../PENDIENTE_PLANIFICACION_RECOLECTAS.md) quedan pendientes. No está desplegado.

> **Continuación integrada, 2026-11-12:** [plan consolidado](../PLAN_CONSOLIDADO_2026-11-12.md). Para funcionalidades futuras prevalece [el flujo v2](../FLUJO_DEVOLUCIONES_V2.md): sin aprobación comercial de solicitudes nuevas. `ESTADO_ACTUAL.md` y T04–T06 conservan implementación/evidencia histórica. Los fallos backend/TypeScript citados al final de este índice son históricos, ya corregidos; no volver a tratarlos como línea base actual.

| # | Pendiente incorporado de esta sesión | Estado |
|---|---|---|
| 07 | [Rendimiento, SQL nativo y detalle voluminoso](07-auditoria-rendimiento.md) | Paginación corregida; medición real pendiente |
| 08 | [Pruebas de escritura, concurrencia, roles y dispositivo](08-pruebas-auditoria.md) | Pendiente por verificar por el usuario |
| 09 | [Dependencias transversales AUD y límites](09-dependencias-auditoria.md) | Pendientes separados por responsable |
| 10 | [Anexo completo de pendientes previos de bloques 1–6](10-anexo-pendientes-previos.md) | Histórico reconciliado; validar vigencia antes de ejecutar |
| 11 | [Medición sintética del detalle y SQL PostgreSQL](11-medicion-detalle-y-sql.md) | Payload medido; SQL nativo pendiente de herramienta |
| 12 | [App distribuida y diferencias del contrato v2](12-app-distribuida-y-contrato-v2.md) | Topología y suites verificadas; APK/dispositivo/contrato pendientes |
| 13 | [Autoaprobación, seguimiento y Novedades](../PLAN_SOLICITUDES_Y_NOVEDADES_2026-11-12.md) | Autoaprobación/Novedades locales; seguimiento integrado y aceptación interna pendientes |
| 14 | [Receptor de recolectas en Planificación y cómo construirlo](../PENDIENTE_PLANIFICACION_RECOLECTAS.md) | Pendiente de otro módulo por indicación del usuario |

Preparación de P4: [contrato v2 y compatibilidad histórica](../CONTRATO_V2_PREPARACION.md), propuesta sin aprobación ni DDL.

La lista siguiente se conserva como antecedente. La integración mantiene selector de país, solicitudes locales y paginación; m08 no debe reaplicarse por un documento antiguo. La planificación de recolectas es externa al módulo.

> **Fuente única vigente:** [estado reconciliado del 2026-11-11](../ESTADO_ACTUAL.md). Esta carpeta conserva detalles por tema. Las notas históricas de abajo no certifican despliegue; el historial, rechazo, país y origen/motivo ya tienen implementación local.

Esta carpeta contiene pendientes funcionales, de despliegue o de verificación. Algunas partes ya están implementadas; consultar la matriz vigente para distinguirlas. Cada archivo desarrolla un tema.

Documento de referencia del módulo (verificado contra el código): [`../MODULO_DEVOLUCIONES.md`](../MODULO_DEVOLUCIONES.md).

> **Regla para todas las sesiones de Claude:** al alterar un módulo, lo que quede sin hacer y los planes posibles se anotan en `docs/{módulo}/pendientes/*.md` (un archivo por tema). Ver [`.claude/rules/pendientes-por-modulo.md`](../../../.claude/rules/pendientes-por-modulo.md).

Última actualización: 2026-11-06 (cambios: recolecta documentada y bloqueada hasta acordar con Planificación (02); devolución **contracamión** desde la app del chofer — formulario con artículos del pedido, foto y motivo; el módulo muestra tipo y foto).

Ya resuelto y quitado de aquí: registro contracamión en la app (`mobile/frontend`, `components/return-button.tsx`; m08 ya aplicada; falta desplegar, pendiente 01), endpoint `GET /paradas/{id}/articulos`, `POST /paradas/{id}/devoluciones` con `items[]` + foto, tipo `contracamion` en `tbl_returns`, badge de tipo y enlace «Ver foto» en `ReturnLinesTable`.

| # | Pendiente | Estado |
|---|---|---|
| 01 | [Desplegar y dar permiso S3 al módulo](./01-despliegue-contracamion.md) | Pendiente por verificar (m08 ya aplicada en Aurora, verificado 2026-11-06; falta despliegue y permiso S3, requiere Intelix) |
| 02 | [Flujo «recolecta» (Atención al Cliente → viaje)](./02-flujo-recolecta.md) | Pendiente por implementar (bloqueado: cuadrar con Planificación) |
| 03 | [Validar cantidad devuelta contra el pedido](./03-validar-cantidad-contra-pedido.md) | Pendiente por implementar |
| 04 | [Formulario impreso: mostrar origen y foto](./04-formulario-impreso-origen.md) | Origen/motivo implementados; foto y QA visual pendientes |
| 05 | [Pruebas de punta a punta de contracamión](./05-pruebas-e2e-contracamion.md) | Pendiente por verificar |
| 06 | [Solicitudes de devolución del cliente (rol Cliente)](./06-solicitudes-cliente.md) | Pendiente por implementar (flujo posterior sin definir; sql/64 aplicada en Aurora 2026-11-06; falta despliegue y permiso S3, requiere Intelix) |

Pendientes técnicos adicionales confirmados el 2026-11-11: efectos de SQL 65/66 ausentes en Aurora; admin sin rutas nuevas, bucket vacío y sin concesión S3; CORS sin dominio Amplify; frontend sin ruta Cliente en el entry inspeccionado; un fallo backend y chequeo TypeScript global fallido. Consultar la matriz para priorizar sin duplicar trabajo.
