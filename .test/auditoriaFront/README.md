# .test — Auditoría del módulo Tarifas (liquidación)

Carpeta de **evidencia de auditoría**: planes, registro de cambios, hallazgos, pendientes y el índice de
pruebas escritas durante la revisión del frontend de Tarifas. No contiene código de la aplicación ni
se ejecuta con vitest (el `include` de `vitest.config.ts` es `src/**/*.test.{ts,tsx}`).

**Regla de la auditoría:** no se toca el backend (`backend/`, `sql/`, `scripts/`). Todo lo que haría falta
cambiar allí queda en `04-pendientes-y-riesgos.md`, sección "Requiere cambio en backend".

| Archivo | Contenido |
|---|---|
| `01-plan-auditoria-tarifas.md` | Plan aprobado (copia): alcance, fases y verificación |
| `02-registro-cambios-fase1.md` | Qué se cambió en la Fase 1 (bugs), archivo por archivo |
| `03-matriz-hallazgos.md` | Matriz Archivo / Tipo / Gravedad / Estado de todo lo hallado |
| `04-pendientes-y-riesgos.md` | Riesgos, decisiones tomadas y lo que requiere backend |
| `05-indice-de-pruebas.md` | Pruebas nuevas y cómo ejecutarlas |
| `06-plan-fase2.md` | Plan de la Fase 2 (arquitectura y tamaño) |
| `07-registro-cambios-fase2.md` | Registro de la Fase 2, incidentes y límites que siguen excedidos |
| `08-fidelidad-companias.md` | Divergencias del paquete Compañías frente al original y su resolución |
| `09-informe-revision-fidelidad.md` | Revisión de fidelidad de las tres zonas, con cada hallazgo verificado |
| `11-registro-costos-flota-y-reglas.md` | Fases 1-2 (2026-10-08): Costos Flota y Reglas de Tarifa sin Zonas/Plantillas/Resumen |
| `12-registro-roles.md` | Fase 3: roles Liquidador y Desarrollador (`sql/26_…`, no ejecutado) |
| `13-registro-metodo-liquidacion.md` | Fase 4: «Forma de liquidar» |
| `14-registro-pdf.md` | Fase 5: PDF con desglose completo |
| `15-auditoria-visual.md` | Fase 6: auditoría visual en navegador y bugs corregidos |
| `16-registro-revertir-forma-liquidar.md` … `23-auditoria-visual-ronda2.md` | Ronda 2 (2026-10-08): revertir forma de liquidar, fuente de datos fija, estructura del país, roles de lectura, menús, tablas con scroll, descripciones y auditoría visual |
| `10-informe-final.md` | Informe final de la auditoría (resumen, severidades, checklist, preguntas) |
| `medicion-lineas-fase2.csv` | Medición de líneas por archivo contra su límite (generada por el auditor) |

Fecha de inicio: 2026-10-06 · Rama: `dylan-tarifas` · Sin commits hechos por la auditoría.

## Verificación estándar
```
npm run type-check
npx tsc --noEmit -p tsconfig.app.json --isolatedModules   # imita al navegador: detecta re-exports de tipos sin `type`
npx vitest run src/lib src/pages src/components src/hooks   # NO incluye src/__tests__ (escribe en Aurora si el túnel está activo)
npx eslint src/lib/tarifas src/pages/reglas-tarifa src/pages/liquidaciones src/pages/companias src/components/tarifas src/hooks src/lib/supabase.ts src/components/feature --ext ts,tsx
```
