# Preparación del contrato v2 y compatibilidad histórica

**Estado:** propuesta para revisión; no contrato aprobado ni implementación. Corte: 2026-11-12. Sigue D1/P4 del plan consolidado. No crea DDL, rutas ni permisos, y no modifica SQL67.

## Reglas ya definidas que se conservan

- Asesor de ventas crea para su empresa y consulta sus propias solicitudes.
- Solicitudes nuevas pasan a Planificación sin aprobación comercial.
- Una recogida física solo cuenta tras aceptación del servidor. La cola offline no equivale a recogida confirmada.
- La recepción permite parcialidades; solo se recibe lo recogido y aún no recibido. Correcciones conservan historia.
- Una cantidad recogida que falta en almacén se trata como incidencia; no vuelve a recolecta.
- La solicitud muestra la etapa pendiente más temprana y sus contadores; contracamión entra directamente en camino.
- Las devoluciones siguen siendo informativas respecto al pago de Tarifas; el gate físico conserva su contrato hasta verificar cualquier transición.

## Propuesta técnica que debe revisarse antes de implementar

| Área | Propuesta de compatibilidad | Comprobación previa |
|---|---|---|
| Identidad del flujo | Discriminador explícito por registro para separar contrato histórico y v2. Los registros existentes conservan interpretación histórica; no convertirlos en bloque. | Inventario de consumidores de solicitud/ítem/devolución y reglas SQL67. |
| Cantidades | Mantener enteros en el primer contrato mientras el negocio no autorice fracciones. Por artículo: solicitada, recogida acumulada, recibida acumulada y asignación activa. No sumar “asignada” como mercancía recogida. | Confirmar productos manuales y unidad; probar saldos en PostgreSQL aislado. |
| Historia | Eventos inmutables de recogida/recepción y corrección compensatoria referida al evento original. Actor, fecha de recepción servidor, fecha capturada e identificadores de correlación. | Acordar permiso y motivo de corrección; límites de retroceso y referencia histórica. |
| Idempotencia | Clave estable por envío/evento y payload coherente; misma clave/datos devuelve resultado original; misma clave/datos distintos devuelve conflicto explícito. Reintentar no crea otro evento ni otra recepción. | Contrato común con mobile/outbox y Planificación; no perder client_id existente. |
| Concurrencia | Validar saldo y persistir evento dentro de una transacción con bloqueo común por artículo/entidad definida. No derivar saldos únicamente de lo mostrado en el navegador. | Dos conexiones reales: recepción simultánea, recogidas duplicadas y correcciones concurrentes. |
| Entrega a Planificación | Solicitud + artículos + referencias autorizadas + mensaje/outbox en una transacción. Confirmación significa registrada/en cola; asignación la produce su responsable. | Acordar ownership, consumidor, deduplicación y respuesta sin candidato. No editar Planificación desde Devoluciones. |
| Eventos tardíos | Conservar el evento y correlación del intento. Si hubo reasignación o ya no cabe el saldo, devolver conflicto/incidencia y conservar la acción pendiente para conciliación; no reasignar ni borrar silenciosamente. | Acordar quién resuelve el conflicto y qué hace la app después del rechazo. |
| API/roles | Mantener claves técnicas de rol y lectura histórica hasta demostrar compatibilidad. Separar contrato nuevo de decisiones comerciales antiguas. No devolver éxito simulado a una aprobación v2. | Definir versión/rutas y error de transición antes de consumidores; pruebas con clientes antiguos. |
| Evidencias | Correlacionar foto/firma con recogida o intento v2, autorizadas por entidad. Conservar URLs de corta duración y límites actuales; no aceptar un ID de otra empresa como evidencia. | Compatibilidad con APK anterior, cargas huérfanas y evento offline aceptado después. |

## Tratamiento histórico propuesto

1. Lectura de pendientes/aprobadas/rechazadas históricas mantiene estado, decisión, autor y adjuntos. No fabricar aprobaciones ni borrar rechazos para adaptarlas al flujo nuevo.
2. Solicitudes con vínculo físico de SQL67 conservan ese vínculo y su auditoría. Una transición futura necesita su regla explícita y prueba antes/después.
3. El despliegue futuro no habilita escritura v2 hasta que esquema y lectores compatibles estén verificados por Jean. No asumir que el cambio de etiquetas migra datos.
4. La propuesta de migración será aditiva y reversible antes de uso; después de uso deberá rechazar rollback que destruya eventos o vínculos. Preparar DDL ejecutable requiere autorización específica, que esta nota no sustituye.

## Decisiones necesarias para cerrar P4

| Decisión | Información disponible | Pendiente concreto |
|---|---|---|
| Legado | El plan pide conservar y no convertir automáticamente. | Confirmar continuidad de escritura histórica o congelación en lectura y tratamiento de solicitudes abiertas. |
| Productos manuales | Permitidos por el flujo v2; no hay catálogo integrado. | Confirmar unidad/cantidades enteras y qué validación contra guía aplica al producto manual. No imponer la validación contra pedido a un artículo simulado por accidente. |
| Correcciones | Deben ser compensatorias y auditadas. | Definir rol autorizado, motivo y saldo cuando ya existe recepción o reasignación. |
| Eventos móviles tardíos | No deben producir una segunda recogida ni borrar outbox. | Acordar conciliación con Planificación y UX móvil ante conflicto. |
| Clientes antiguos | La app actual tiene foto opcional y contrato histórico. | Acordar versión mínima o convivencia; no volver obligatoria firma/foto para APK antiguo de forma silenciosa. |

Mientras estas decisiones no estén cerradas, pueden avanzar pruebas locales, medición, inventario y propuesta. No comenzar P5, cambiar tablas compartidas, retirar endpoints históricos ni presentar este documento como aprobación humana.
