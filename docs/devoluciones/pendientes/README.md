# Devoluciones — pendiente por implementar

Todo lo de esta carpeta está **pendiente por implementar** (o por verificar). Cada archivo es una sola cosa, con qué falta, por qué y cómo hacerla.

> **Regla para todas las sesiones de Claude:** al alterar un módulo, lo que quede sin hacer y los planes posibles se anotan en `docs/{módulo}/pendientes/*.md` (un archivo por tema). Ver [`.claude/rules/pendientes-por-modulo.md`](../../../.claude/rules/pendientes-por-modulo.md).

Última actualización: 2026-11-05 (cambios: recolecta documentada y bloqueada hasta acordar con Planificación (02); devolución **contracamión** desde la app del chofer — formulario con artículos del pedido, foto y motivo; el módulo muestra tipo y foto).

Ya resuelto y quitado de aquí: registro contracamión en la app (`TRACKING_TMS/frontend`, `ReturnButton`), endpoint `GET /paradas/{id}/articulos`, `POST /paradas/{id}/devoluciones` con `items[]` + foto, tipo `contracamion` en `tbl_returns`, badge de tipo y enlace «Ver foto» en `ReturnLinesTable`.

| # | Pendiente | Estado |
|---|---|---|
| 01 | [Aplicar m08, desplegar y dar permiso S3 al módulo](./01-despliegue-contracamion.md) | Pendiente por verificar (requiere Intelix y Aurora) |
| 02 | [Flujo «recolecta» (Atención al Cliente → viaje)](./02-flujo-recolecta.md) | Pendiente por implementar (bloqueado: cuadrar con Planificación) |
| 03 | [Validar cantidad devuelta contra el pedido](./03-validar-cantidad-contra-pedido.md) | Pendiente por implementar |
| 04 | [Formulario impreso: mostrar origen y foto](./04-formulario-impreso-origen.md) | Idea |
| 05 | [Pruebas de punta a punta de contracamión](./05-pruebas-e2e-contracamion.md) | Pendiente por verificar |
