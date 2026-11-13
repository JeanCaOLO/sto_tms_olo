# Cierre de la continuación local del 12 de noviembre

> Este documento conserva el primer cierre del día, anterior a la implementación de autoaprobación y Novedades. Para el estado posterior y sus pruebas consulte [la entrega de solicitudes automáticas y novedades](SOLICITUDES_AUTOMATICAS_Y_NOVEDADES_2026-11-12.md).

## Entregado

1. [Crear solicitud dentro de Solicitudes](CREAR_SOLICITUD_2026-11-12.md), con Cliente, Gerente y superusuarios; menú unificado y redirección compatible. Conservación de intentos inciertos, empresa y adjuntos autorizados.
2. [Reglas 4B en servidor](../tarifador/pendientes/04-reglas-4b-implementadas.md), con prueba primero y revisión independiente.
3. Paginación Devoluciones verificada sobre PostgreSQL en memoria, más SQL67, SQL68, scopes, marcas y totales reales.
4. [Plan actualizado de autoaprobación/seguimiento/Novedades](PLAN_SOLICITUDES_Y_NOVEDADES_2026-11-12.md), con la decisión explícita de bloquear liquidación ante novedades abiertas cuando el gate está activo.
5. [Pendiente y guía de integración de Planificación](PENDIENTE_PLANIFICACION_RECOLECTAS.md), separado del trabajo local implementado.

## Verificaciones ejecutadas

| Verificación | Resultado | Límite |
|---|---|---|
| Vitest completo, `--maxWorkers=2`, tres ejecuciones finales | **1.822 pasadas y 12 omitidas en cada ejecución**; 204 archivos pasados y 4 omitidos | Se excluyeron conectividad/multitenant como en la línea base para no acceder a datos reales. |
| pytest `backend/tests` | **793 pasadas** | Sin Aurora; fronteras externas sustituidas en tests. |
| Node tests SQL | **53 pasadas** en PostgreSQL 18.6/PGlite 0.5.16 | Una instancia en memoria; no prueba optimizador/versión de Aurora ni dos conexiones. |
| TypeScript web | Correcto | Código actual comprobado con `tsc --noEmit`. |
| Build temporal web | Correcto; 71 JS, 4.092.997 bytes JS totales; entrada 450.182 bytes | Persiste advertencia de chunks grandes. No constituye reducción demostrada de costo. |
| ESLint web | **16 errores y 22 advertencias**, sin errores nuevos | Los 16 errores son previos. Dos advertencias de limpieza de refs recibidas de Dylan quedaron corregidas conservando invalidación de generaciones. |
| Chrome con API simulada | Cliente/Gerente/SuperUsuario crean; sin excepciones JS; **0 llamadas reenviadas al backend** | No se creó data real ni se verificó despliegue. |
| Backend móvil | **158 pasadas, 24 omitidas** | Sin dispositivo ni AWS. |
| App móvil | **174 pasadas, 20 suites**, tipos y lint correctos durante esta continuación | Sin cambios de producto móvil posteriores; no se generó APK. |

Los logs locales permanecen en `TMS/.test/integracion_2026-11-12/`: `closure-vitest-{1,2,3}.log`, `closure-backend.log`, `closure-sql-final.log`, `closure-tsc.log`, `closure-build.log`, `closure-lint.log`, `closure-mobile-backend.log`. Los intentos intermedios con fallos de fixture, parsing SQL y UI se conservaron; no son el resultado final.

## Cambios preparados y pendientes

- **SQL68 no aplicada externamente.** Es necesaria antes de publicar captura para un gerente/superusuario sin empresa personal. Forward y rollback están preparados y probados. No se consultó ni cambió AWS en esta continuación.
- En este primer corte, autoaprobación y Novedades aún eran el plan siguiente. Se implementaron posteriormente en la entrega enlazada al inicio. El seguimiento real mediante Planificación/Tracking continúa pendiente; el botón no activa una planificación ni inventa una recepción.
- Configurar el consumidor real de Planificación queda pendiente por indicación del usuario. El plan explica entrada durable, scopes, asignación, parada, acuse, Tracking y reasignación de saldos no recogidos.
- Permanecen pruebas reales de escritura, permisos de usuarios reales, fotografía/dispositivo/APK, métricas AWS, concurrencia de dos conexiones y los pendientes externos del registro. No se certifica QA ni despliegue por estos tests.
- Las mejoras de 4B se mantienen sin DDL adicional obligatorio. Quedan defensa de esquema con CHECK, preflight de datos y decisión D4 sobre marcas con liquidación vigente.

## Git

Rama `josef`, HEAD de integración `3e2908a`. Durante esta continuación no se crearon commits, no hubo push ni despliegues. Solo se agregan rutas propias; archivos ajenos sin seguimiento permanecen fuera de staging. La herramienta PGlite está fuera del repositorio, en `TMS/.test/postgres-tools`, sin cambiar package.json ni lockfiles del proyecto.

Mensaje de commit sugerido para el conjunto preparado:

`feat(devoluciones): unifica solicitudes y refuerza integridad de tarifas`

La lista exacta de rutas agregadas y evidencia saneada de suites se conserva junto al reporte de verificación de esta carpeta. La documentación anterior de auditoría permanece como historial; este cierre no borra ni reinterpreta aprobaciones humanas.
