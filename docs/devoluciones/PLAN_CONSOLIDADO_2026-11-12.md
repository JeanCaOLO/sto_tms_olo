# Plan consolidado de continuación: Devoluciones, Tarifas, Tracking y app

**Fecha:** 2026-11-12. **Estado:** preparado para ejecución por etapas; no implementado por la existencia del documento.

> **Aclaración funcional posterior del usuario:** prevalece [Solicitudes automáticas y Novedades](PLAN_SOLICITUDES_Y_NOVEDADES_2026-11-12.md). El rol visible es Cliente; superusuarios/gerentes también capturan. Autoaprobación y Novedades únicamente con texto ya tienen [implementación local](SOLICITUDES_AUTOMATICAS_Y_NOVEDADES_2026-11-12.md), sin despliegue. En revisión bloquea liquidación con gate activo. La aceptación interna y el enlace real Planificación/Tracking/Por recibir con foto siguen pendientes.

## Objetivo, alcance y punto de partida

Completar la reconciliación funcional y técnica después de integrar `main` y `dylan-tarifas` en `josef`, conservar las mejoras de esta auditoría y priorizar datos frescos, carga, cálculo y costo, en ese orden. La implementación nueva se limita a los cuatro módulos originales. Integrar cambios existentes de otras áreas no autoriza refactorizarlas.

Fuentes: [flujo v2](FLUJO_DEVOLUCIONES_V2.md), [plan Devoluciones v2](PLAN_DEVOLUCIONES_V2.md), estado reconciliado/evidencias T02–T06, [pendientes Tarifas](../tarifador/pendientes/02-auditoria-y-reconciliacion.md), auditoría del 11–12 de noviembre y [anexo de bloques previos](pendientes/10-anexo-pendientes-previos.md). La especificación v2 reemplaza la aprobación comercial para el desarrollo futuro; T04–T06 siguen describiendo código histórico implementado.

No se rehacen AUD-01/02/03/04/05/07, polling oculto, F1/F2 ni funciones por lotes. Se comprueban sus regresiones. Los resultados anteriores pertenecen a sus commits y entornos; no garantizan la nueva combinación.

## Etapas de ejecución

| Etapa | Trabajo y entregable | Aceptación / dependencia |
|---|---|---|
| P0 — Fijar base | Inventario Git, fuentes y estados por ID: implementado local, pendiente local, verificación real, decisión, otro módulo o infraestructura. Comparar ROADMAP, HALLAZGOS y checklist con código. Mantener una matriz y enlaces, sin borrar evidencia anterior. | No reabrir m08, lotes o aprobación comercial por documentos antiguos. Identificar responsables y no cambiar aprobaciones humanas. |
| P1 — Proteger integración | Verificar paginación + país + scope juntos, cambios de filtro durante requests, solicitudes autenticadas, TripCard, cantidad entera, N+1 y Liquidaciones simple/extendida/lote. Registrar lint recibido y pruebas excluidas. | Backend, frontend, tipos y build sin regresiones atribuibles al merge; nueva prueba de país/cursor/scope y protección de respuesta antigua. |
| P2 — Medir antes de optimizar | AUD-07/08: SQL nativo y detalle voluminoso. AUD-09: resumen/KPI de Tracking. Medir bytes, consultas, tiempos y polling; usar volumen sintético primero y lectura real autorizada después. Separar mediciones de túnel de AWS. | Páginas completas sin huecos/duplicados; detalle y resumen medidos. Cualquier corrección local necesita fallo observado y prueba que falle antes del arreglo. No crear índices/DDL. |
| P3 — Tarifas local y validación real | Ejecutar escenarios de H8/E1, lote parcial, marcas, reparto, variables, historial, cache F1/F2 y manejo de error/registro de correo. Revisar 4B y contratos actuales. | Total y snapshot coherentes; reintentos no duplican efectos; devolución manual no se pisa. Escrituras y correo real los ejecuta el usuario con fixtures autorizados. 4B no avanza a cambios de seguridad/integridad sin su autorización y decisiones. |
| P4 — Contrato Devoluciones v2 | Preparar D1: estados derivados, saldos por artículo, eventos/idempotencia, transición histórica y contratos con Planificación/móvil. Inventariar diferencias frente a SQL67. Diseñar propuesta aditiva con rollback seguro para entregar a Jean. | Contrato revisado antes de consumidores. Definir tratamiento de registros legados y productos manuales. Sin aplicar ni crear migración ejecutable bajo la autorización actual; pedir autorización específica si la siguiente etapa la requiere. |
| P5 — Construcción v2 por lotes | Tras cerrar P4, seguir D2–D5: captura Asesor, entrega transaccional a Planificación, bandeja unificada y recepción parcial. Preparar adaptadores/fixtures para dependencias externas. | Sin aprobar/rechazar solicitudes nuevas; contracamión entra en camino; no recibir antes de recogida confirmada; no exceder saldos; corrección compensatoria auditada; historia anterior legible. Planificación implementa asignación/reasignación en su propio módulo. |
| P6 — App y cierre funcional | Reconciliar app `TRACKING_TMS` con backend móvil y con la documentación que también menciona `mobile/frontend`. Verificar cuál se distribuye antes de cambiar flujos. Probar GPS, outbox, client_id, foto/firma, 401/refresh y offline tardío. | Sin perder pendientes; reintentos con un efecto lógico; manifiesto nuevo sin backup. URL release, cifrado, retención y firma permanecen detrás de sus decisiones/diseños. |
| P7 — Entrega y pendientes externos | Comparar suites/bundle con P0, actualizar documentos por módulo y staging por rutas propias. Entregar a Jean checklist de despliegue, esquema, S3/CORS/roles y rollback. Registrar métricas AWS que faltan. | No commit de funcionalidades, push, despliegue, DDL compartido ni envío real desde el agente. Tres ejecuciones completas de Vitest al cierre de futuras correcciones; no presentar esta fase como ya completada. |

**Siguiente paso concreto:** P0/P1 ya tienen inspección y validación de integración en esta sesión; completar la matriz de vigencia de ROADMAP y ejecutar P2 con PostgreSQL aislado antes de cualquier nueva optimización. Las pruebas reales que escriben permanecen para el usuario. No comenzar P5 con un contrato v2 provisional.

### Continuación del 12 de noviembre, posterior al merge

- **P0:** [matriz de vigencia de Tarifas](../tarifador/pendientes/03-matriz-vigencia-2026-11-12.md) completada por lectura: F01–F12 y D1/D2/D4/D6 distinguen código actual, datos, decisiones e infraestructura. No se marcaron E2E como ejecutados.
- **P1:** se reutilizan las suites de integración del mismo código; no hay cambios de producto posteriores que justifiquen repetirlas completas.
- **P2:** [detalle sintético medido](pendientes/11-medicion-detalle-y-sql.md) y prueba PostgreSQL preparada. Motor PGlite ausente y Docker inactivo; pendiente autorización de herramienta temporal. AUD-08 y AUD-09 permanecen abiertos para volumen real/diseño.
- **P3:** escenarios locales de Tarifas ya incluidos en las 1.814 pruebas del merge; validaciones de escritura, datos reales y correo siguen pendientes. 4B no se considera resuelto por tener permisos generales en backend.
- **P4:** [propuesta de contrato y decisiones de compatibilidad](CONTRATO_V2_PREPARACION.md), sin DDL ni aprobación. P5 no iniciado.
- **P6:** [app separada identificada y suites verificadas](pendientes/12-app-distribuida-y-contrato-v2.md): 174 pruebas, TypeScript y lint correctos. Falta APK/dispositivo y compatibilidad v2.
- **P7:** documentación propia en preparación/staging por rutas; sin commits nuevos, push, despliegue, AWS ni escritura compartida durante esta continuación.

## Interfaces y compatibilidad que se conservan

- `GET /api/v1/devoluciones/viajes`: `data` sigue siendo un array; `next_cursor` es metadata adicional. Cliente nuevo pide `limit=100`; lector anterior conserva su contrato. `pais`, fecha, estado y scope se aplican en cada página. El resumen recibe el mismo país operativo.
- Bandeja/solicitudes históricas conservan aislamiento, adjuntos autorizados y auditoría. El contrato v2 se prepara separado: no renombrar roles técnicos ni reinterpretar datos SQL67 de forma silenciosa.
- Estado v2 visible: `en solicitud`, `recolecta`, `en camino`, `en almacen`. Prevalece la etapa pendiente más temprana y se muestran contadores. Cantidad recogida y no recibida nunca vuelve a recolecta.
- Tarifas mantiene devoluciones informativas respecto al pago y caché con relectura fresca antes de emitir. Lotes reutilizan emisión individual y comunican fallos por viaje/regla.

## Pruebas y evidencias requeridas

1. **Locales:** Vitest por módulo; backend pytest; TypeScript y ESLint; build temporal con tamaño de entrada/chunks y dependencias pesadas. Registrar exactamente fallos previos y nuevos. Excluir pruebas de conectividad/multitenant que acceden a datos hasta contar con autorización de ese ensayo.
2. **SQL aislado:** más de 1.000 filas con claves repetidas/nulas, países y scopes distintos; concurrencia con dos conexiones; cantidades acumuladas e idempotencia. SQLite no sustituye PostgreSQL para locks, tipos o planes.
3. **Navegador de lectura:** cuatro páginas, minuto de reposo, API Performance, consola, filtros/país y carga incremental. Las capturas T8 anteriores son históricas. Reiniciar `api:local` solo si sirve código/manifiesto viejo, coordinando el proceso activo sin cerrar procesos ajenos.
4. **Usuario / entorno autorizado:** recepción/formularios concurrentes, gate de emisión, tarifas cambiadas desde otra sesión, lotes, correo con cuenta propia, roles alternativos y dispositivo/APK. Registrar IDs de fixtures y limpieza por su dueño.
5. **V2:** captura → cola → asignación externa → recogida confirmada → recepción parcial/final; sin candidato, cancelación de parada, faltantes, eventos duplicados/tardíos, empresa/país incorrectos y legado. Probar que un fallo conserva historia y no fabrica estados físicos.

## Decisiones, límites y pendientes que no bloquean el trabajo independiente

- [AUD-06 y AUD-09–22](pendientes/09-dependencias-auditoria.md) conservan su estado y responsable. Sin autorización nueva no cambiar seguridad/infra ni otros módulos. No activar workflows AI-DLC por la existencia del plan.
- La evidencia recibida sobre Aurora/despliegue no fue repetida aquí. Solo Jean despliega. Las migraciones presentes se integraron como contenido Git; no se ejecutaron.
- Antes de P5, cerrar mapeo histórico v2, unidad de cantidades/productos manuales, correcciones y contrato de eventos. Política de release HTTP, cifrado/retención, firma/canal APK y Gmail durable requieren decisiones específicas; no escogerlas por inferencia.
- Fotos/firmas reales en mock son una idea opcional; no crear objetos S3 automáticamente. Catálogos de moneda, datos WMS/eFlow y reglas comerciales reales pertenecen a sus dueños.
- No prometer ahorro monetario: hay 12 peticiones API/minuto en Tracking visible en la captura local anterior. AWS necesita invocaciones, duración, memoria, consultas/conexiones, logs, bytes y tarifas vigentes obtenidas por su responsable. arm64/memoria se deciden con medición.

## Integración realizada en esta sesión

Se actualizaron ambas ramas remotas y se conservaron todos los commits locales mediante merges. Resultado en `josef`: `3e2908a`; main integrada por `7da4442`; pull divergente de Dylan resuelto en `1929893`. Los tres merges son la integración solicitada, no commits nuevos de funcionalidades del plan.

Resultados reales: 1.814 tests web pasados y 12 omitidos (204 archivos pasados, 4 omitidos); 736 backend pasados; 193 tests focalizados pasados; TypeScript y build correctos. ESLint: 16 errores y 24 advertencias. Los 16 errores ya existían; dos advertencias adicionales llegan con `mis-devoluciones` de Dylan. Build advierte chunks mayores de 500 kB. No se repitieron app, AWS ni navegador real durante este merge.

Respaldo de ramas: `respaldo/{josef,main,dylan-tarifas}-20261112-1300`. El archivo local `.codex/config.toml` impedía el pull; se conservó íntegro, sin leerlo, fuera del repositorio en `TMS/.test/integracion_2026-11-12/config-local-original.toml` y copia verificada `config-local.toml`. El checkout usa ahora el archivo versionado recibido. Los demás archivos ajenos sin seguimiento permanecen sin agregar.
