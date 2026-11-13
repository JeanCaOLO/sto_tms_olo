# Pendientes y prompt para la próxima sesión

## Punto de corte

Rama web `josef`, HEAD `3e2908a`. Main y dylan-tarifas ya están integradas. Hay cambios propios preparados para commit, sin commit nuevo de esta continuación, sin push y sin despliegue. No repetir pulls/merges por suposición ni descartar staging.

Entrega local: botón Crear solicitud dentro de Solicitudes, menú unificado, captura por Cliente/Gerente/superusuarios, autoaprobación, bandeja de lectura y Novedades con un solo texto. En revisión bloquea la liquidación con el gate activo. También están preparadas las validaciones servidor 4B de Tarifas.

Pruebas finales: 1.821 pasadas y 12 omitidas de Vitest; antes del último ajuste de etiqueta hubo tres ejecuciones de 1.820 pasadas y 12 omitidas. Backend 807; SQL 66 en PostgreSQL/PGlite en memoria. TypeScript y build correctos. ESLint conserva 16 errores y 22 advertencias previos. Chrome simulado pasó para Cliente/Gerente/SuperUsuario; cero llamadas reenviadas al backend. No certifica escritura real ni integración de módulos.

## Pendientes, por dependencia

1. **Preparación de publicación:** revisar precondiciones de SQL68/69/70, código y rutas del template como un conjunto. Los scripts no están aplicados externamente. El backend nuevo depende del esquema nuevo. No desplegar ni aplicar SQL compartido durante la reanudación sin una instrucción específica para ese ambiente.
2. **Planificación:** configurar el consumidor de recolectas queda pendiente explícito por solicitud del usuario. La guía de qué debe recibir y cómo implementarlo está en [PENDIENTE_PLANIFICACION_RECOLECTAS.md](PENDIENTE_PLANIFICACION_RECOLECTAS.md). No modificar ese módulo por iniciativa propia.
3. **Seguimiento real:** falta correlacionar solicitud/artículo/intento/parada/evidencia, recibir acuses reales y mostrar En Planificación, En Tracking y Entregada. La aprobación automática no sustituye esos eventos.
4. **Tracking a Por recibir:** falta crear una sola devolución física al aceptar la entrega, conservar su foto de recolecta correcta, controlar duplicados y rechazar referencias de otra empresa/parada. No simularlo como integración operativa terminada.
5. **Aceptación interna:** el usuario pidió únicamente texto para Novedades. No hay acciones ni endpoints de aceptar/resolver. Mantener En revisión y el bloqueo mientras no se defina el proceso interno posterior; no exigir campos de cantidad/tipo ni liberar automáticamente.
6. **Validación real:** concurrencia con dos conexiones PostgreSQL, permisos/roles reales, escritura autorizada, recepción, evidencias y dispositivo/APK. Las pruebas de escritura de la auditoría original siguen pendientes del usuario. No usar las pruebas simuladas como evidencia de Aurora o publicación.
7. **Tarifas:** revisar los pendientes reconciliados en [docs/tarifador/pendientes](../tarifador/pendientes/README.md), en particular decisiones abiertas, defensa de esquema y concurrencia. Las reglas 4B locales están descritas en [04-reglas-4b-implementadas.md](../tarifador/pendientes/04-reglas-4b-implementadas.md).
8. **Auditoría restante:** conservar [el plan consolidado](PLAN_CONSOLIDADO_2026-11-12.md) y [el registro de pendientes](pendientes/README.md). Incluyen rendimiento/payload con volumen real, app distribuida y contrato v2, seguridad/infraestructura, métricas AWS y herramientas externas. No inventar ahorros ni dar esos ítems por cerrados.

## Documentos y evidencia

- [Entrega de solicitudes automáticas y novedades](SOLICITUDES_AUTOMATICAS_Y_NOVEDADES_2026-11-12.md).
- [Plan funcional vigente](PLAN_SOLICITUDES_Y_NOVEDADES_2026-11-12.md).
- [Verificaciones portables](auditoria/2026-11-12/solicitudes-novedades-verificaciones.json).
- [Lista exacta de staging y commit sugerido](11-git-add-y-commit-sugerido.md).
- Logs y capturas fuera de Git: `TMS/.test/integracion_2026-11-12/`.

## Prompt para continuar

```text
Continúa el trabajo en C:\msys64\home\jrodriguezm\TMS desde el punto de corte documentado en sto_tms_olo/docs/devoluciones/PROXIMA_SESION_2026-11-12.md.

Lee primero los AGENTS.md aplicables y los documentos enlazados de entrega, plan vigente, pendientes de Planificación y Tarifas, verificaciones y staging. Inspecciona el estado real de Git antes de editar: la rama josef ya integra main y dylan-tarifas y hay cambios preparados sin commit que debes conservar. No repitas integraciones ni descartes trabajo propio o ajeno.

El criterio confirmado es: Crear solicitud dentro de Solicitudes para Cliente y gerentes/superusuarios autorizados; solicitudes nuevas autoaprobadas; bandeja de seguimiento sin aprobación/rechazo manual; Novedades en Recepción por viajes con únicamente texto y estado En revisión; bloqueo de liquidación cuando TMS_RETURNS_GATE está activo. La aceptación interna de la novedad sigue pendiente: no añadas cantidades, tipo ni botones de aceptar/resolver por suposición.

Reconciliarás los pendientes documentados con el código actual y continuarás con el siguiente trabajo local independiente que pueda completarse sin el consumidor de Planificación ni decisiones de negocio pendientes. La configuración de Planificación permanece pendiente explícita; conserva y mejora su guía de integración sin modificar ese módulo. El seguimiento real y el paso desde Tracking a Por recibir con foto aún requieren correlación y eventos auténticos: no los declares implementados por la autoaprobación.

No despliegues en AWS, no hagas push ni commits sin petición expresa y no apliques SQL a bases compartidas en esta reanudación. Los scripts 68/69/70 están preparados pero no aplicados; el código nuevo requiere ese esquema antes de publicarse. No leas .env*, tokens ni secretos. Trabaja por rutas y preserva archivos ajenos. Comprueba cada corrección con pruebas de comportamiento proporcionales y actualiza docs/devoluciones con evidencia real, límites y pendientes. Para cualquier comprobación de navegador con datos reales mantén solo lectura; no reutilices los tests simulados como prueba de integración real.
```
