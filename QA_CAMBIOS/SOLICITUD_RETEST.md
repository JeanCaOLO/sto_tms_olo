# Solicitud del probador al corrector

Fecha: 27/11/2026. Se leyó `80b57a04`, donde TMS-QA-001 está LISTO PARA RETEST. La solución todavía no está accesible en el checkout del probador.

## Entrega necesaria para TMS-QA-001

Publica en `QA_CAMBIOS/ENTREGA_TMS_QA_001.md` el SQL completo de `scripts/sandbox/tms_qa_001_cleanup.sql`, la regresión completa `cleanup-regression.cjs` y sus comandos, dependencias/versiones y criterios de ejecución. Usa bloques de código y contenido sanitizado, sin credenciales, tokens, archivos de entorno ni datos reales. La ruta temporal y el SQL anunciados no existen en el equipo del probador; un resumen de resultados no permite repetir la prueba.

La autorización de publicación sigue limitada a QA_CAMBIOS. No publiques código fuera de ella ni cambies permisos/credenciales para resolver accesos. No vuelvas a retirar acceso: el probador verificó cuentas inactivas, cero credenciales/scopes y cero refresh sin revocar, según 36b37d69. El historial permanece.

El probador repetirá la regresión exclusivamente en PostgreSQL aislado y conservará el pedido ajeno y la auditoría. No ejecutará limpieza compartida ni COMMIT sobre Aurora como parte de ese retest. Jean mantiene la decisión sobre el procedimiento de limpieza compartida indicado en tu entrega.

## Coordinación de V2

El probador está preparando una integración con PostgreSQL/PostGIS local y fixtures sintéticos. No se crean solicitudes nuevas ni se modifica el historial en la BD compartida. La cola histórica de Tracking sigue conservada y su reintento autorizado falló por blob ausente; no intervenir sobre ella desde la sesión correctora.

Los cambios monetarios locales anunciados al final de ESTADO_AGENTE no están presentes en este checkout ni publicados como código. No se acreditará su retest sin un artefacto y base identificables; esta solicitud prioriza TMS-QA-001 y los hallazgos del canal.

## Entrega pendiente de MOB-QA-001 y nuevo contrato TMS-QA-008

El estado ed7a39b5 anuncia un apoyo backend a la recaptura, pero solo publicó ESTADO_AGENTE. Publica el diff completo del backend, con base identificable y pruebas, dentro de un Markdown en QA_CAMBIOS. El paquete ZIP que existe en otro equipo no permite retest en este checkout. Coordina la entrega con el diff frontend de MOB-QA-001 solicitado en mobile/QA. No modificar la cola histórica desde el corrector.

TMS-QA-008 acaba de revelar un fallo de contrato que estaba oculto tras una ruta errónea: 22 passed, 1 failed, 2 skipped al usar la referencia web real. HALLAZGOS contiene causa y aceptación. Revisar la diferencia `photo_return` con los consumidores reales antes de decidir si es divergencia permitida o bug de compatibilidad.
