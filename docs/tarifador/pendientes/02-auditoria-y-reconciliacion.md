# 02 — Auditoría y reconciliación de pendientes después del merge

**Estado:** pendiente por verificar. Corte: 2026-11-12.

## Qué falta

- F1/F2: verificar con datos de prueba cambios de tarifa y perfil desde otra sesión antes de emitir/reliquidar. El código ya relee; no rehacerlo.
- Bloque 4B / AUD-06: revisar servidor, transiciones, marcas/motivos/actor y concurrencia. Definir reglas pendientes antes de agregar controles de integridad.
- H8/E1: verificar topes 5.000 filas, 25 consultas por batch, consultas largas por find y bloqueos del motor con backend real. El mock no demuestra restricciones ni concurrencia de PostgreSQL.
- Lotes: selección múltiple, LiquidarLoteModal y acciones de reglas ya existen. Probar éxitos parciales, fallo individual, idempotencia y 409 de una regla referenciada; no reconstruirlos por el nombre de la carpeta `funciones_para_añadir`.
- Correo: conservar separación enviar/registrar y probar fallos sin duplicar correo. AUD-12/13 siguen sujetos a diseño de seguridad y persistencia durable.
- Fotos/firmas del mock siguen siendo una idea. Usar fixtures locales para pruebas automáticas; subir objetos reales exige autorización de su responsable.
- Revisar deudas D1/D2/D4/D6 y los FALTANTE de ROADMAP contra código y decisiones actuales. No tratar fechas de octubre como diagnóstico vigente: proformas/envío y lotes ya tienen implementación posterior.
- Verificar datos de país/moneda, códigos VE/VN, valor de mercancía, impuestos, tipos de camión y tarifas reales con sus dueños. No cambiar Catálogos ni OMS/eFlow en este trabajo.
- Mantener decisiones del usuario: devoluciones informativas para el pago; aviso de solapamiento sin bloqueo; estructura de terceros sin cambio comercial automático; reglas inactivas ocultas por filtro inicial.

## Documentos desactualizados

El índice anterior decía que Devoluciones ignoraba el selector de país y que m08 no estaba aplicada. El filtro está implementado y conservado en el merge; falta verificación real de publicación/scopes. El estado recibido de Devoluciones aporta evidencia posterior de m08: no volver a aplicar esa migración por esta lista histórica.

## Cómo continuar

Seguir el [plan consolidado](../../devoluciones/PLAN_CONSOLIDADO_2026-11-12.md), empezando por reconciliación y escenarios locales. Infra, DDL, datos reales, correo real y pruebas de escritura quedan sujetos a sus límites. La indicación histórica de hacer push en ROADMAP no es autorización: no hacer push ni desplegar.
