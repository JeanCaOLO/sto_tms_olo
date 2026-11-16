# 10 - Anexo de pendientes previos de la auditoria

Estado: historico reconciliado, copia de continuidad del 2026-11-12.

Este anexo conserva todos los items anteriores, incluidos los resueltos. Los estados temporales de T8 y Git se reemplazan por PLAN_CONSOLIDADO_2026-11-12.md. El flujo v2 prevalece para funcionalidades nuevas; no reintroducir aprobacion comercial ni ejecutar pendientes de otros modulos por esta lista. Los tests locales y sus cifras en el texto siguiente son historicos.

---

# Revisión de pendientes anteriores

Se releyeron los seis documentos `PendientesRevisionBloque1` a `6`, `ReglasNegocio4B.md`, `SECURITY_AUDIT.md` y la auditoría del catálogo del 9 de octubre. Una casilla marcada en el documento anterior conserva su evidencia histórica; no representa una nueva aprobación humana.

## Verificación actual de puntos prioritarios

| Punto | Estado actual | Evidencia |
| --- | --- | --- |
| F1: catálogo fresco al emitir/reliquidar | Cerrado en código y tests locales; repetición con datos reales pendiente | `tripSettlement.ts:243-248`, `useRecheckBeforeEmit.ts:24`, `catalogCache.test.ts`, `recheckBeforeEmit.test.ts`; suite completa ×3 pasa |
| F2: perfil del transportista fresco | Cerrado en código y tests; no se relee solo el catálogo | `tripSettlement.ts:115,136` propaga `fresh`; `partiesDataSource.ts:82-86` |
| Prefetch al hover 300 ms y recarga por visibilidad | Implementados previamente; cubiertos por suites locales, sin nueva medición real | `src/pages/liquidaciones` y tests de prefetch/visibilidad |
| Polling oculto/backoff y 403 choferes | Cerrado en implementación y tests; el candidato del plan ya estaba resuelto | `tracking/hooks/polling-runner.ts:44-95`, `useViajesEnVivo.ts:35`, `__tests__/usePolling.test.ts` |
| Bloque 4B | Vigente, AUD-06. Ya no existen los cambios versionados ajenos señalados en el plan antiguo | `proformas_api.py:35` no protege ítems/marcas; el guard de liquidaciones en `tarifas_sql.py` no cubre esas tablas |
| arm64, memoria y Max Memory Used | Vigente, AUD-20; móvil ya declara arm64 | Plantillas leídas; sin consulta AWS |
| A4/A5/A6 | Vigente fuera de los cuatro módulos, AUD-10 | OMS/eFlow/eFlow-sim y plantillas; pendiente de responsables |
| A14 | Vigente según workflow, AUD-14; no se verificó firma binaria | APK de 52681814 bytes y workflow con llave de prueba declarada |
| A15 | Pendiente de infraestructura, AUD-11 | No se validaron ajustes desplegados en consola |
| SQLite / HTTP móvil | Vigentes, AUD-15/AUD-16 | `db/kv.ts`, `config.ts`; preview sí configura HTTPS |
| allowBackup | Corregido en configuración y probado mediante plugin; verificar APK nuevo | AUD-05; `android-backup.test.ts` |
| Fallos bcrypt del día anterior | Cerrado como limitación del entorno usado ayer | Python nativo actual ejecuta las 625 pruebas backend finales sin ese fallo |
| ESLint / conectividad | Vigente: 16 errores y 22 warnings actuales; integración excluida | Logs de línea base/final; no se cambió configuración global |

## Inventario completo de casillas anteriores

Para las pruebas manuales no repetidas, el resultado actual permanece pendiente. Las decisiones de producto no se sustituyen por supuestos de la auditoría. Las notas sobre árboles sucios antiguos se reemplazan por `00-linea-base.md`; no se restaura ni se agrega ese trabajo.

### PendientesRevisionBloque1.md

| Línea | Ítem anterior | Reconciliación |
| --- | --- | --- |
| 8 | 2.B Falla la carga de permisos. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 9 | 4.C Contraseña incorrecta en `/login`. | Pendiente de validación real o decisión; no se declara cerrado. |
| 10 | 4.E Un 403 de permisos no cierra la sesión. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 11 | 3.B `/seed` en desarrollo. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 12 | 5.E Otros consumidores de `:4000`. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 16 | 6.B Alerta de pedidos nuevos y 6.C día sin pedidos | Pendiente de validación real o decisión; no se declara cerrado. |
| 18 | Rutas de EFLOW públicas en el backend real. | Pendiente de validación real o decisión; no se declara cerrado. |
| 19 | Código sin uso. | Pendiente de validación real o decisión; no se declara cerrado. |
| 20 | `/` sin permiso `dashboard` | Pendiente de validación real o decisión; no se declara cerrado. |
| 21 | ESLint: | Pendiente de validación real o decisión; no se declara cerrado. |
| 22 | Casilla por proforma en "Por aprobar" | Pendiente de validación real o decisión; no se declara cerrado. |
| 23 | Carpeta movida: | Estado antiguo reemplazado por inventario Git actual; no hay cambios versionados ajenos iniciales. |

### PendientesRevisionBloque2.md

| Línea | Ítem anterior | Reconciliación |
| --- | --- | --- |
| 9 | 1. Liquidar (PENDIENTE: ningún viaje listo tiene forma de cobro + regla con variable; Transosa cobra fija, Pedro Hernández y Transmajori no tienen forma de cobro. Hace falta crear datos de prueba o indicar un viaje): el total cambia con una variable y se guarda lo calculado. | Pendiente de validación real o decisión; no se declara cerrado. |
| 10 | 1b. Devoluciones no se pisan. | Pendiente de validación real o decisión; no se declara cerrado. |
| 11 | 1c. Doble clic en Emitir. | Pendiente de validación real o decisión; no se declara cerrado. |
| 12 | 2. Tarifarios: editar, cancelar y agregar. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 13 | 2b. Borrador sobrevive. | Pendiente de validación real o decisión; no se declara cerrado. |
| 14 | 3. Alerta Margen: reintentar con éxito. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 15 | 4. Enviar proforma: no reenviar. (PENDIENTE: PRO-CR-003 ya tiene "Correo enviado"; PRO-CR-008 sigue en revisión fase 1/2; falta cuenta de Google conectada.) | Pendiente de validación real o decisión; no se declara cerrado. |
| 16 | 4b. Abrir en Gmail con falla de PDF. | Pendiente de validación real o decisión; no se declara cerrado. |
| 17 | 5. Historial: Cargar más. | Pendiente de validación real o decisión; no se declara cerrado. |
| 21 | Unicidad por país en `tarifas_margin_policies`. | Pendiente de validación real o decisión; no se declara cerrado. |
| 22 | Casilla por proforma en "Por aprobar" | Pendiente de validación real o decisión; no se declara cerrado. |
| 23 | Tooltip de "Importe" en el formulario de filas del tarifario | Pendiente de validación real o decisión; no se declara cerrado. |
| 24 | `RuleModal.test.tsx.snap` | Estado antiguo reemplazado por inventario Git actual; no hay cambios versionados ajenos iniciales. |
| 25 | Cambios sin commit ajenos a esta auditoría | Estado antiguo reemplazado por inventario Git actual; no hay cambios versionados ajenos iniciales. |

### PendientesRevisionBloque3.md

| Línea | Ítem anterior | Reconciliación |
| --- | --- | --- |
| 8 | Aviso "Mostrando X de Y" de los KPI. | Pendiente de validación real o decisión; no se declara cerrado. |
| 9 | "Cargar más" y el tope de 100. | Pendiente de validación real o decisión; no se declara cerrado. |
| 10 | 403 de choferes con un usuario real sin acceso. | Pendiente de validación real o decisión; no se declara cerrado. |
| 11 | Modo "Todos". | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 12 | Avisos en inglés. | Pendiente de validación real o decisión; no se declara cerrado. |
| 13 | Reloj a medianoche en otros navegadores. | Pendiente de validación real o decisión; no se declara cerrado. |
| 17 | Sedes de prueba (`CUSTOMER_ORIGINS`). | Pendiente de validación real o decisión; no se declara cerrado. |
| 18 | Visibilidad de Tracking por rol | Pendiente de validación real o decisión; no se declara cerrado. |
| 19 | 503 transitorios del backend local. | Pendiente de validación real o decisión; no se declara cerrado. |
| 20 | Insignia "completado" teal vs punto azul. | Pendiente de validación real o decisión; no se declara cerrado. |
| 21 | "Entregas en curso: X de Y" | Pendiente de validación real o decisión; no se declara cerrado. |
| 22 | `IniciarViajeModal` | Pendiente de validación real o decisión; no se declara cerrado. |
| 23 | `keptSummary` en `page.tsx` | Pendiente de validación real o decisión; no se declara cerrado. |
| 24 | `FlotaMapa`: | Pendiente de validación real o decisión; no se declara cerrado. |
| 25 | Alcance del repositorio: | Pendiente de validación real o decisión; no se declara cerrado. |

### PendientesRevisionBloque4.md

| Línea | Ítem anterior | Reconciliación |
| --- | --- | --- |
| 9 | Aprobar o rechazar en lote. | Pendiente de validación real o decisión; no se declara cerrado. |
| 10 | Error al decidir un reclamo. | Pendiente de validación real o decisión; no se declara cerrado. |
| 11 | Emitir en lote. | Pendiente de validación real o decisión; no se declara cerrado. |
| 12 | Pasar a Pagado (irreversible). | Pendiente de validación real o decisión; no se declara cerrado. |
| 13 | Enviar proforma: cierre mientras envía. | Pendiente de validación real o decisión; no se declara cerrado. |
| 14 | Marca de pedido rechazada por el servidor. | Pendiente de validación real o decisión; no se declara cerrado. |
| 15 | Regla inválida con alcance de compañía. | Pendiente de validación real o decisión; no se declara cerrado. |
| 16 | Borrar una fila de tarifario deja el contenido en la bitácora. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 17 | Fechas en hora local. | Pendiente de validación real o decisión; no se declara cerrado. |
| 18 | Rango "Hoy" pasada la medianoche. | Pendiente de validación real o decisión; no se declara cerrado. |
| 22 | Bloque 4B (backend). | Vigente en código; AUD-06. El solapamiento antiguo ya no existe. |
| 23 | Trabajo ajeno sin commit en proformas. | Estado antiguo reemplazado por inventario Git actual; no hay cambios versionados ajenos iniciales. |
| 24 | Código sin uso. | Pendiente de validación real o decisión; no se declara cerrado. |
| 25 | Casilla por proforma en "Por aprobar". | Pendiente de validación real o decisión; no se declara cerrado. |
| 26 | Idioma fijo en la bitácora de proformas. | Pendiente de validación real o decisión; no se declara cerrado. |
| 27 | Resultado del barrido de proformas al abrir la pantalla. | Pendiente de validación real o decisión; no se declara cerrado. |

### PendientesRevisionBloque5.md

| Línea | Ítem anterior | Reconciliación |
| --- | --- | --- |
| 8 | e2e de rutas en modo mock. | Pendiente de validación real o decisión; no se declara cerrado. |
| 9 | Menú móvil. | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 13 | Regla de reescritura SPA en la consola de Amplify | Pendiente de validación real o decisión; no se declara cerrado. |
| 14 | Variables de producción del build: | Pendiente de validación real o decisión; no se declara cerrado. |
| 18 | Token de sesión de 7 días en `localStorage` sin refresco. | Pendiente de validación real o decisión; no se declara cerrado. |
| 19 | Página de entrada por rol. | Pendiente de validación real o decisión; no se declara cerrado. |
| 20 | Código sin uso | Pendiente de validación real o decisión; no se declara cerrado. |
| 21 | Dos lockfiles | Pendiente de validación real o decisión; no se declara cerrado. |
| 22 | Datos de demo: | Pendiente de validación real o decisión; no se declara cerrado. |

### PendientesRevisionBloque6.md

| Línea | Ítem anterior | Reconciliación |
| --- | --- | --- |
| 8 | "se cobra" / "se paga" al transportista. | Pendiente de validación real o decisión; no se declara cerrado. |
| 9 | KPI "A tiempo" | Pendiente de validación real o decisión; no se declara cerrado. |
| 10 | Resumen del backend de Tracking | Pendiente de validación real o decisión; no se declara cerrado. |
| 14 | Traducir Tarifas. | Pendiente de validación real o decisión; no se declara cerrado. |
| 18 | Unos 25 modales de otras pantallas | Pendiente de validación real o decisión; no se declara cerrado. |
| 19 | Polígonos de `ZoneMap` | Pendiente de validación real o decisión; no se declara cerrado. |
| 20 | `gray-*` fuera de Tarifas | Pendiente de validación real o decisión; no se declara cerrado. |
| 21 | Hints genéricos sin valor | Pendiente de validación real o decisión; no se declara cerrado. |
| 22 | `acá` | Pendiente de validación real o decisión; no se declara cerrado. |
| 26 | Lector de pantalla real | Pendiente de validación real o decisión; no se declara cerrado. |
| 27 | Revisión visual de los colores | Pendiente de validación real o decisión; no se declara cerrado. |
| 28 | Modales con Escape y foco | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
| 29 | Flechas en las pestañas | Cerrado según evidencia histórica; no revalidado en navegador en esta sesión. |
