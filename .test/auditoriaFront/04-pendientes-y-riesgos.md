# Pendientes, riesgos y decisiones

## Resueltos tras el cierre de la Fase 1
- **Variables personalizadas numéricas** pasaban por `Number`: ahora `exactNumber` (number si es exacto, string si no).
- **Umbrales de margen** leídos con `Number`: ahora string decimal; `MarginPolicy` acepta `Money | number` (los fixtures siguen en number).
- **`LiquidarViajeModal` "reemplaza todas las ediciones"**: no era bug. `TripEdits` solo contiene `customVars`, así que reemplazar = actualizar todo.

## Decisiones tomadas
- **Borrador → Pagado** se mantiene permitido (un test existente lo declara válido). Es regla de negocio; si se quiere exigir "Aprobado" antes de pagar, decidirlo con producto.
- **`Row = Record<string, any>`** se deja: cambiarlo a `unknown` produce ≈80 errores de tipo en datasources. Es el tipo de frontera de filas sin esquema; se abordará con tipos por entidad en la Fase 2 (junto con la partición de los datasources).
- **Coma decimal:** `parseMoneyInput` (formularios de umbrales) la acepta; `exactNumber` (variables de viaje) no, porque "1,234" es ambiguo.

## Requiere cambio en backend (NO tocado, avisar al equipo de backend / Intelix)
1. **Numeración `LIQ-` atómica:** hoy el cliente calcula max+1 (leer y luego insertar). Debe asignarla el servidor (secuencia o `INSERT … RETURNING`) con índice único `(country_id, number)`.
2. **Estados de liquidación:** validar las transiciones también en el servidor (el frontend ya las valida, pero cualquier otro cliente las puede saltar).
3. **`POST /tarifas/tx`:** el `insert` dentro de una transacción no devuelve el `id` generado ni hay lectura de lo escrito; conviene devolver las filas resultantes por operación.
4. **Aislamiento por organización:** todos los datasources ignoran `organization_id` (`_organizationId`). El filtrado debe garantizarlo el API por el token.
5. **Tipos `numeric`:** el API debe devolver siempre `numeric` como string (hay un test sugerido en `data/__tests__/http-datasource.test.ts`).
6. **Sesión:** 401/403 explícitos en expiración; el token vive en `localStorage` (riesgo XSS; evaluar cookie httpOnly).
7. **Paginación:** `listPendingTrips('all')` trae todos los viajes; y la consulta `?q=<JSON>` con `in` de muchos ids puede exceder el largo de URL (pasar a POST de búsqueda).
8. **Unicidad "un grupo por zona" y código de tarifario:** hoy se validan en cliente (leer y escribir); necesitan restricción única en BD.

## ⚠ Tests que escriben en Aurora cuando el túnel está activo (detectado 2026-10-07)
`src/__tests__/multi-tenant-isolation.test.ts` (preexistente) hace `INSERT` de clientes `TEST-ISO-A/B` y `final_customers` (`FC-A-1`, `FC-B-1`, `DUP-1`) en la base real `tms_olo` y los borra en su `teardown`. Solo corre si hay conexión (`describe.skipIf(!schemaReady)`); con el túnel SSM activo, un `npx vitest run` completo lo ejecuta. `db-connectivity.test.ts` solo lee.
- Hoy el túnel estaba activo y la suite completa se corrió **dos veces** (unos 68 tests que antes se omitían se ejecutaron).
- **RESUELTO 2026-10-07 (consulta de solo lectura, `BEGIN READ ONLY`):** 0 filas `TEST-ISO-%`, 0 `DUP-1`/`FC-%`, 0 `delivery_points` de prueba; la última fila creada en `customers`/`final_customers`/`delivery_points` es de septiembre, anterior a las corridas. No quedaron residuos.
- **Corregido:** `multi-tenant-isolation.test.ts` ahora solo corre con `TMS_ALLOW_DB_WRITE_TESTS=1`; un `vitest run` normal ya no escribe en Aurora (`src/__tests__`: 62 pasados / 7 omitidos). Riesgo restante del test (si se activa): el caso 5 usa un `final_customer` REAL (`LIMIT 1`) para insertar un punto `is_default`; conviene usar el fixture propio.
- (histórico) **No se pudo verificar que no quedaron filas**: la consulta de solo lectura fue denegada por el control de permisos y no se insistió. Verificación manual sugerida (solo lectura):
  `SELECT count(*) FROM customers WHERE code LIKE 'TEST-ISO-%';` y
  `SELECT count(*) FROM final_customers WHERE external_code = 'DUP-1' OR external_code LIKE 'FC-%';` (ambas deben dar 0).
- Recomendación: correr la suite con el túnel cerrado, o excluir `src/__tests__/` por defecto y dejarlo como opt-in (como ya hace `aurora.e2e.test.ts` con `TARIFAS_AURORA_E2E=1`).

## Riesgos conocidos del frontend
- Aún no se ejecutó verificación visual en navegador con roles sin `tarifas.config` (pendiente del ROADMAP §8.8).
- i18n: el módulo completo está en español fijo.
- Las funciones largas del motor (`runChargePipeline` 219 líneas, `parseCostTemplate` 200, `resolveRules` 153) son lógica crítica: su partición se hace en la Fase 2 con la batería de 700+ pruebas como red de seguridad.
