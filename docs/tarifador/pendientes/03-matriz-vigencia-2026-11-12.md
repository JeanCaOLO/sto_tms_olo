# 03 — Vigencia del ROADMAP después de la integración

**Estado:** reconciliado por lectura estática el 2026-11-12; pruebas reales y decisiones conservan sus pendientes. F01–F12 identifican los doce FALTANTE de ROADMAP, no nuevas incidencias de la auditoría.

| ID histórico | Estado actual | Evidencia y siguiente acción |
|---|---|---|
| F01: reiniciar API y repetir UI/E2E | Verificación real | `backend/tarifas/src/app.py:57,197` limita batch a 25. No se comprobó el proceso local activo ni se reinició. Comprobar manifiesto y repetir escenarios con túnel, sin escrituras del agente. |
| F02: valor de pedidos e impuestos | Datos/otro módulo/decisión | `ROADMAP.md:1068`. Fuente e impuestos deben confirmarlos OMS/eFlow y negocio; no se consultaron sus datos. |
| F03: devoluciones informativas | Decisión vigente, conservar | `ROADMAP.md:1069` y plan consolidado. No descontar del pago por inferencia; falta precio/monto y decisión para modificar esa política. |
| F04: documento, envío y CxP | Parcialmente histórico | Documento/envío ya existen: `src/pages/proformas/hooks/useEnviarProforma.ts:81,90`, `backend/tarifas-mail/src/app.py:136`, `backend/tarifas/src/proformas_api.py:90`. Faltan decisiones de CxP/proformas parciales y validación real. AUD-12/13 siguen abiertos. |
| F05: moneda Costa Rica | Catálogos/decisión | `ROADMAP.md:1071`. No se verificó el valor actual del catálogo; no cambiar moneda ni convertir importes desde esta auditoría. |
| F06: reglas/tarifas reales | Negocio/datos reales | `ROADMAP.md:1072`. Confirmar valores y mapeo de tipos de camión con sus dueños. Los ejemplos no son tarifas comerciales aprobadas. |
| F07: tarifarios multicolumna | Implementado local | ROADMAP ya lo marca hecho. Pruebas `src/lib/tarifas/__tests__/rateTableValueColumns.test.ts`; mantener regresión y comprobar importación con backend autorizado. |
| F08: roles y todos los países | Verificación real | `backend/tarifas/src/app.py:68` aplica permisos/país. Faltan recorridos con usuarios sin `tarifas.config`; SuperAdministrador no demuestra esos roles. |
| F09: despliegue/configuración | Infra/Jean | `ROADMAP.md:1075`. No se verificaron AWS, SSL CA, arquitectura, variables publicadas ni roles efectivos. |
| F10: textos, costo/km y VE/VN | Mixto | El defecto de persistencia de costo/km tiene corrección local: `costStructure/rowMapper.ts:31` incluye frecuencia/cantidad/costo y `mutations.ts:76` usa `rowPatch`. El motor deriva costo/km desde importe/frecuencia en `cost/driver.ts:71`; no depende de recalcular una copia persistida. Idiomas/códigos de Catálogos siguen por reconciliar con el responsable. |
| F11: decisiones en memoria AI-DLC | Requiere aprobación humana | `ROADMAP.md:1077`. No se alteraron memoria, gates o aprobaciones. La documentación de esta sesión no concede esa aprobación. |
| F12: push | Fuera de autorización | `ROADMAP.md:1078` es una instrucción histórica. La restricción vigente impide push; no ejecutarlo. |
| D1: acceso decorativo | Afirmación histórica parcialmente superada | Backend actual autoriza lectura/escritura/país en `app.py:68`. No significa que todos los bypass estén resueltos: AUD-06/4B sigue pendiente de revisión/decisión y autorización específica. |
| D2: concurrencia | Mitigación parcial | `app.py:286` ejecuta transacciones y reintentos por serialización/deadlock; `proformas_api.py:113` verifica fase pendiente. No demuestra control de edición optimista de cualquier fila ni ausencia de actualizaciones perdidas. Probar dos conexiones PostgreSQL. |
| D4: multi-tenancy | Arquitectura pendiente de inventario | `ROADMAP.md:804,1080`. No se verificó entidad por entidad ni se propuso migración. No extrapolar el scope por país a aislamiento por organización. |
| D6: alert/confirm | Nota probablemente histórica; alcance limitado | Búsqueda actual sin resultados en páginas Liquidaciones, Reglas de Tarifa y Compañías. No se certificó todo el repositorio; no marcar deuda global cerrada por esta búsqueda. |

## Regresiones ya cubiertas localmente

- F1/F2: `tripSettlement.ts:115,136,248` propaga `fresh`, relee perfil y catálogo antes de emitir. `partiesDataSource.ts:86` y `catalog-loader/cache.ts:45` omiten caché cuando se pide fresco. Queda el ensayo real entre dos sesiones.
- Lotes: `LiquidarLoteModal` y sus pruebas de confirmar/fallo existen; no reconstruirlos por la carpeta histórica `funciones_para_añadir`.
- Correo: el hook conserva estado “enviado, falta registrar”; repetir registro no debe reenviar. Un resultado ambiguo de Gmail aún necesita diseño durable.
- Topes: `tarifas_sql.py:29` establece 5.000 filas; `app.py:57` permite 25 consultas batch. H8 exige datos reales; los topes no prueban completitud de una pantalla.

La suite web de la integración (1.814 pasadas, 12 omitidas) ya cubrió las pruebas locales del código actual. No se repitió completa solo por esta documentación. La revisión no ejecutó E2E, correo real ni cambios de datos.
