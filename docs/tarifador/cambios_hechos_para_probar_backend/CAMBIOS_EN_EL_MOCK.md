# Cambios en el mock y en el código, y por qué

Todo está en el árbol de trabajo (`git status`), sin commit. Rama `josef`.

## 1. Mock sobre el cliente HTTP real (cambio principal)

`main` había eliminado el driver `json` del tarifador: `db()` devuelve siempre `HttpDataSource`. Sin túnel no había datos. Se rehízo el mock así:

| Archivo | Qué es |
|---|---|
| `src/lib/tarifas/data/memory/{driver,filtering,integrity,store}.ts` | El almacén en memoria que antes vivía en `__tests__/helpers/memory/` (movido con `git mv`). Ahora es código de la app, usado por las pruebas y por el mock. `store.ts` ya no importa ninguna semilla: `setSeed()` la fija, y expone `enablePersistence()` (localStorage) y `resetToSeed()`. |
| `src/lib/tarifas/data/memory/fakeBackend/` | **Backend simulado.** Un `fetch` que contesta el contrato de `backend/tarifas/src/app.py` sobre el almacén en memoria. Usa `generateManifest()` (el mismo registro que genera el manifiesto del backend). Replica: columna desconocida → 400; entidades externas y bitácora → 405; permisos por módulo → 403; tipos (uuid, int, numeric, boolean, fecha) y NOT NULL como Postgres (409 con 23502); FK y unicidad → 409 con 23503/23505; `/tx` todo-o-nada con 404 si una fila no existe; `numeric` devuelto como texto; topes de 5.000 filas y 25 consultas por `/batch`. Archivos: `index.ts` (rutas), `schema.ts` (lista blanca, tipos, consultas), `permissions.ts`, `errors.ts`. |
| `src/lib/tarifas/data/memory/installMock.ts` | Carga `seed.demo.json`, activa la persistencia (`tarifas-mock:v2`) y hace `setDataSource(new HttpDataSource({ fetchImpl: createFakeBackend(...) }))`. Expone `window.__tarifasMockReset()`. |
| `src/main.tsx` | `if (MOCK_AUTH_ENABLED) await import('./lib/tarifas/data/memory/installMock')`. `MOCK_AUTH_ENABLED` exige `import.meta.env.DEV`: no llega al build desplegado. También monta `MockRoleSwitch`. |
| `src/lib/tarifas/data/memory/mockIds.ts` | Ids uuid de CR, VE y CO, compartidos por la semilla y el contexto operativo mock. |
| `src/test/setupTarifas.ts` | Las pruebas fijan su propia semilla (`__tests__/fixtures/seed.json`) con `setSeed`; esa semilla no entra al bundle. |

Por qué: un mock que acepta lo que el backend rechaza oculta errores hasta conectar el túnel. Con el cliente HTTP real, los caminos del driver (por ejemplo, que una transacción devuelva lo enviado) se ejercitan igual que con Aurora. Se comprobó que con el código viejo el mock reproduce exactamente los dos errores reales (H1 y H9).

## 2. Contexto operativo, sesión y rol de prueba

| Archivo | Qué cambió |
|---|---|
| `src/lib/mock-auth.ts` | `mockContextResponse` (países CR/VE/CO, almacenes, clientes, scope global) con los ids de `mockIds.ts`; `MockRole`, `getMockRole/setMockRole`, `mockPermissionsFor(role)`; `rememberMockActor()` (escribe `tms_session` sin token y lo borra al cerrar la página, para que la bitácora muestre el autor). |
| `src/hooks/useOperationalContext.tsx` | Usa `mockContextResponse` en modo mock y arranca en Costa Rica. |
| `src/hooks/usePermissions.tsx` | En modo mock devuelve los permisos del rol de prueba (antes, siempre administrador) y reacciona al cambio de rol. |
| `src/hooks/useAuth.tsx` | `enterMock()` llama `rememberMockActor()`. |
| `src/components/feature/MockRoleSwitch.tsx` | Selector «Rol de prueba» (Administrador, Solo liquidar, Solo configurar) en la esquina inferior izquierda; solo en modo mock. |
| `src/pages/auditoria/audit-api.ts` | No envía eventos al backend en modo mock. |

## 3. Semilla demo regenerada (`scripts/build-demo-seed.ts` → `data/memory/seed.demo.json`)

- Costa Rica, Venezuela y Colombia completas, inspiradas en `docs/tarifador/demo-data/`. Cifras: CR 51 viajes y 8 liquidaciones, VE 20 y 5, CO 12 y 2.
- **Ids uuid** en todas las columnas uuid del registro de esquema (se remapean antes de emitir las liquidaciones, con uuid determinista); los países usan `mockIds.ts`.
- **Viajes sin zona de destino** en los tres países: el motor los bloquea («No se puede emitir…») y se quedan en «Por liquidar».
- Las liquidaciones, marcas de pedido y bitácora se emiten con el motor real sobre una copia en memoria.

## 4. Correcciones al código de la app (aplicadas con aprobación del usuario)

| ID | Archivo | Cambio |
|---|---|---|
| P1a | `src/pages/reglas-tarifa/components/rule-modal/ruleSubmit.ts` | Se quitó `updated_at` del payload de reglas. |
| P10a | `src/lib/tarifas/costStructure/mutations.ts`, `ids.ts` (nuevo), `template.ts` | `saveStructure` genera el id de la estructura nueva en el cliente (`newId('cstr')`). `newId` pasó a `ids.ts` y `template.ts` lo importa. |
| P16b | `src/lib/liquidador/auditLog.ts`, `src/hooks/useToast.tsx` y los sitios que escribían la bitácora (`useRuleSubmit.ts`, `reglasTarifaApi.ts`, `tarifariosApi.ts`, `settlements/audit.ts`, `companias/hooks/useCostActions.ts`, `companias/CompaniasView.tsx`, `useCompaniasList.ts`) | Nuevo `registrarEventoSeguro`: registra sin tumbar la operación ya guardada y, si falla, avisa con un toast («El cambio se guardó, pero no quedó registrado en la bitácora…»). Antes iba solo a `console.error` o hacía parecer que el cambio no se había guardado. |
| P9 | `MargenPolicyTab.tsx`, `CountrySettingsCard.tsx` | Botones «Guardar umbrales» y «Guardar cálculo del país»; aviso «Umbrales guardados.». |
| P8 | `src/lib/notify.ts` (nuevo), `useCostActions.ts`, `useToast.tsx` | Aviso al guardar parámetros de la estructura de costos. `notify()` permite avisar desde código que no es un componente. |
| P13 | `useLiquidacionesController.ts`, `liquidaciones/page.tsx` | Tras emitir o re-liquidar: relee, cambia a «Historial», resalta la fila nueva y avisa «Liquidación LIQ-… emitida». Ya no abre el detalle encima de la lista. |

Evaluadas y **no aplicadas**: P7 (perfil + tarifario en una transacción; rompería la idempotencia de `ensurePartyProfile`), P6a (filtrar plantillas por país: el listado multipaís del Probador es intencional y 5 pruebas de caracterización lo fijan; se revirtió), R1 (el usuario prefirió dejar el filtro «Activa» por defecto).

## 5. Pruebas nuevas

- `data/memory/fakeBackend.test.ts` — contrato del backend simulado (400, 405, 403, 409, tx, tipos).
- `__tests__/demoSeed.test.ts` — cobertura de la semilla, cálculo sin bloqueos, viajes bloqueados a propósito, ids uuid, CRUD.
- `__tests__/demoSeed.http.test.ts` — emitir, re-liquidar, anular y estructura de costos por el cliente HTTP real (incluye la regresión de H9).
- `pages/reglas-tarifa/components/rule-modal/ruleSubmit.contract.test.ts` — el payload de reglas solo lleva columnas de la tabla (regresión de H1).
- `lib/liquidador/auditLog.test.ts` — la bitácora no tumba la operación y avisa.
- Se comprobó que sin P1a y sin P10a las pruebas de regresión fallan.

## 6. Estado de verificación (2026-10-10)

`npx vitest run`: 101 archivos y 1070 pruebas en verde (5 archivos omitidos, los que exigen Aurora). `npm run type-check`: 0 errores. `vite build` con `VITE_MOCK_AUTH=true`: ni la semilla ni el backend simulado aparecen en los `.js`. Recorridos de navegador de todas las fases con 0 errores de consola ajenos al caso probado.
