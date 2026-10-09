# Registro — Fases 1 y 2 (Costos Flota y limpieza de Reglas de Tarifa)

Fecha: 2026-10-08 · Rama `dylan-tarifas` · Solo frontend (`src/`) y docs; backend/SQL sin cambios.

## Fase 1 — «Costos Flota»
- `src/components/feature/sidebar-nav-items.ts`: «Flota Propia» y «Flota Externa» se reemplazan por «Costos Flota» (`/tarifas/costos-flota`, permiso `tarifas.config`).
- Nuevo `src/pages/companias/costos-flota/page.tsx`: pestañas Propia / Externa (`?flota=`) sobre `CompaniasView`.
- `src/router/config.tsx`: ruta nueva; `/tarifas/flota-propia` y `/tarifas/transportistas` redirigen a la pestaña correspondiente.
- Borrados: `pages/companias/flota-propia/page.tsx`, `pages/companias/terceros/page.tsx` (solo eran envoltorios).
- i18n: `menu.costosFlota` (es: «Costos Flota», en: «Fleet Costs»).
- Prueba: `module-routes.test.ts` (la ruta nueva exige `tarifas.config`, con y sin barra final).

## Fase 2 — Reglas de Tarifa sin Zonas, Plantillas ni Resumen
- Borrados: `PlantillasTab`, `TemplateEditCard`, `ResumenTab`, `ZoneGroupModal` (+ `zone-group-modal/`, su test y snapshot), `ZonesSection`, `zoneTableColumns`, `useTemplateList`, `useTemplateApi`, `useGroupDelete`.
- Editados: `page.tsx`, `TabNavigation.tsx` (el tipo `Tab` ahora es único, del controller), `useReglasTarifaController.ts`, `useRuleGroupModals.ts` (solo regla), `api/reglasTarifaApi.ts` (`fetchZones`, sin borrado de grupos), `api/tarifariosApi.ts` (sin `createOrUpdateZoneGroup`/`auditZoneGroupChange`), `types.ts`.
- `useZonesAndGroups` → `useZones` (solo zonas; las zonas siguen alimentando a `TarifariosTab`).
- NO tocados (los usa el motor y el Probador): `lib/tarifas/catalog-loader/zones.ts`, `resolver/context.ts`, `localRules/zones.ts`, `localRules/templates.ts`, `RuleTester`.
- Efecto: ya no hay UI para crear/editar grupos de zonas; los datos se leen del catálogo.
- Docs: `docs/tarifador/GUIA_TARIFADOR.md` (tabla de pantallas).

## Corrección de la sesión anterior
`src/lib/tarifas/__tests__/predicatesPrecision.test.ts` (escrita el 2026-10-07) tenía errores de tipo (claves de variable inválidas, `VarBag` incompleto) que se me escaparon porque corrí `tsc` antes de crear el archivo. Reescrita con `weightKg` y un helper `bag()`; las 3 pruebas siguen pasando.

## Verificación
`tsc --noEmit -p tsconfig.app.json` 0 errores · vitest (sin `src/__tests__`) 900 pasados / 0 fallidos / 9 omitidos (bajó de 914 por las pruebas de `ZoneGroupModal` eliminadas) · eslint del alcance 0 errores.
