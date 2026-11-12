# Devoluciones — pendiente por implementar

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
