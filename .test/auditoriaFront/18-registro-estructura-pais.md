# Registro — Ronda 2, Fase C (un solo lugar para la estructura de costos)

Fecha: 2026-10-08.

**Hallazgo clave:** la pestaña «Costos» de Reglas de Tarifa no era un duplicado puro: era el ÚNICO lugar que editaba la estructura de costos POR DEFECTO del país (`partyId = null`), que el motor exige para toda compañía de flota propia sin estructura propia (`cost/structure.ts`). El modal de Flota Propia solo la mostraba en lectura. Por eso se migró en vez de borrar sin más.

## Qué se hizo
- Nueva sección **«Estructura del país»** arriba de la pestaña Flota Propia (`companias/components/CountryCostStructure.tsx` + `hooks/useCountryCostStructure.ts`): descargar/subir plantilla (`CostTemplateModal` con `partyId={null}`), parámetros (nombre, días operativos, km/año, combustible, rendimiento), filas, resumen por tipo de camión, aviso «sin estructura cargada: no se puede liquidar» y ayuda. Subir plantilla exige `tarifas.config` edit.
- `CostStructureCard` se movió de `reglas-tarifa/components` a `companias/components`.
- El modal de estructura de una compañía ahora muestra los parámetros de la plantilla (km/año, combustible, rendimiento) también en la estructura heredada o propia (`cost-structure/ParamsLine.tsx`); antes no se veían en ningún lugar.
- Borrado: `reglas-tarifa/components/CostosTab.tsx`, la pestaña `costos` (tipo `Tab`, `TabNavigation`, `page.tsx`, ayuda), y dos huérfanos duplicados sin importadores (`companias/components/CostStructureActions.tsx` y `CostStructureHeader.tsx`).
- Mensaje del motor (`structure.ts`) y comentarios/docs ahora dicen «Costos Flota → Flota Propia → Estructura del país».

## Pruebas
- Nuevo `CountryCostStructure.test.tsx` (4): muestra la estructura con sus parámetros, sin estructura avisa, sin permiso «Subir plantilla» deshabilitado, subir plantilla abre el asistente del país.
- Snapshots de `CostStructureModal.interactions` (4) regenerados: la ÚNICA diferencia es la línea nueva de parámetros.
