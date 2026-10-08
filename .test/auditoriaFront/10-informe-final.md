# Informe final — Auditoría del módulo Tarifas (frontend)

Fecha de cierre: 2026-10-07 · Rama `dylan-tarifas` · Sin commits hechos por la auditoría.
Alcance: `src/lib/tarifas`, `src/pages/{reglas-tarifa,liquidaciones,companias}`, `src/components/tarifas`, hooks y `src/lib/supabase.ts`.
Detalle por fase: `02`, `07`; matriz: `03`; pendientes: `04`.

## 1. Resumen ejecutivo
- El núcleo del motor ya usaba `decimal.js`; las violaciones estaban en bordes (KPIs de la página, totales de importación, `percentToFraction`, parseo de montos, `cargoFromOrders`, umbrales de margen). **Corregidas en la Fase 1.**
- En el cierre se movió además la **evaluación de condiciones** (`GT/GTE/LT/LTE/BETWEEN/EQ`) a Decimal exacto (`evaluator/predicates.ts`); antes comparaba con `Number`. Prueba nueva `predicatesPrecision.test.ts`.
- Bugs de datos graves corregidos: columnas de valor de tarifarios no cargadas (`catalogLoader`), importaciones sin transacción, "Reemplazar todo" sin confirmación, tarifario de compañía degradado a país, edición de plantillas que borraba datos, `fleetType` inválido.
- Shim `supabase.ts`: ya no cierra sesión por 5xx, captura errores de red, rechaza `update/delete` sin filtro. En producción el datasource ya no cae en silencio al driver JSON/localStorage.
- Ruta: `permKeyForPath` normaliza barra final y mayúsculas (la guarda se saltaba con `/liquidaciones/`).
- Arquitectura: capa Page → useController → Api en Liquidaciones y Reglas-tarifa; `Modal` base accesible; archivos del módulo dentro de límites salvo `data/schema.ts` (726, esquema declarativo).
- Calidad: 0 errores de tipos (también con `--isolatedModules`), 0 errores eslint (11 avisos), ~915 pruebas verdes. 65 `any` eliminados.
- **Riesgo de proceso:** los agentes que refactorizaron reportaron "verde" con regresiones reales (ver `07`, incidentes 1-9). Todo se re-verificó con pruebas de caracterización contra HEAD.
- **Abierto:** i18n (módulo en español fijo), aislamiento por organización y numeración `LIQ-` atómica (backend), paginación.

## 2. Hallazgos por severidad
### 🔴 Crítico
| Hallazgo | Ubicación | Estado |
|---|---|---|
| Columnas de valor/`extra_values` de tarifarios no cargadas: toda regla con `column` caía al respaldo y cobraba otro precio | `catalog-loader/*` | ✅ |
| Importar "Reemplazar todo" y reacomodar filas sin transacción: fallo a medias dejaba el tarifario incompleto | `rateTables/*` | ✅ |
| KPIs "Total liquidado"/"Sin aprobar" y total de importación sumados con `Number` | `liquidaciones/page.tsx`, `ImportSheetWizard` | ✅ |
| Frontend en blanco en navegador por re-export de tipos sin `type` | `resolver/index.ts` | ✅ (detector: `tsc --isolatedModules`) |

### 🟠 Alto
| Hallazgo | Estado |
|---|---|
| Condiciones numéricas del motor comparadas con `Number` | ✅ Decimal (`predicates.ts`) |
| `percentToFraction('1.1')` daba `0.011000000000000001` | ✅ |
| `cargoFromOrders` redondeaba por pedido | ✅ redondeo único al final |
| Edición de plantilla perdía `expectedTotal`, `customVars`, `quotedAt`; sin permisos | ✅ |
| Colisión de número `LIQ-` mapeada a "base no disponible" | ✅ reintento (carrera real: 🔧 backend) |
| Tarifario de compañía pasaba a país si no cargaba la lista | ✅ |
| Estados de liquidación sin transiciones | ✅ (Borrador→Pagado se mantiene: decisión de negocio) |

### 🟡 Medio
- Validaciones de formularios (tramos, BETWEEN, % ≤ 100, código de regla, umbrales de margen, Infinity/hex): ✅.
- Hooks sin cancelación / spinner infinito (`useAuth`, `useActiveCountry`, pestañas): ✅.
- Fecha en UTC (`toISOString().slice(0,10)`) en vez de local: ✅.
- Modales sin `role="dialog"`/Esc/foco: ✅ `components/base/Modal`.
- `organization_id` ignorado por los datasources: 🔧 backend.

### 🔵 Bajo
- `Row = Record<string, any>` en la capa de datos (≈80 usos): 🟡 decisión pendiente.
- Funciones de lógica de más de 30 líneas (`runChargePipeline` 144, `evaluateExpr` 88, `computeCostLines` 82…): 🟡 no tocadas, son el núcleo del dinero.
- 11 avisos eslint (`react-refresh/only-export-components`, 1 directiva sin uso).
- Otros usos de `Number(...)` revisados (83): todos son índices/orden, configuración (días, horas, decimales), capacidades de vehículo (kg/m³, no dinero), parseo de rangos de tarifario (`rateRange.ts`, claves de tramo) o parseo de entrada previo a Decimal. Sin hallazgo de dinero adicional.

## 3. Checklist de reglas duras
- ✅ `decimal.js` en todo cálculo monetario (tras Fase 1 y el cambio de predicados; quedan `Number` solo en cantidades/orden/config, ver arriba).
- ✅ Se usa el shim `supabase.ts`, no Supabase real; no se cambió de arquitectura.
- ✅ Stack respetado (React 19, TS 5.8, Vite 7, Tailwind 3, RR7); sin dependencias nuevas.
- ❌ i18n: el módulo sigue en español fijo (fuera de este cierre; ver §5).

## 4. Verificación del cierre
`npm run type-check` 0 · `tsc --isolatedModules` 0 · eslint 0 errores / 11 avisos · vitest (sin `src/__tests__`) verde · `backend/` y `sql/` sin cambios.
Nota: 12 snapshots de caracterización se regeneraron porque el componente compartido de tabla ahora traduce `table.records`/`table.export` ("3 registros", "Exportar Excel"); se verificó palabra por palabra que no había otra diferencia.

## 5. Refactors sugeridos
- **Quick wins:** cerrar los 11 avisos eslint; correr siempre la suite sin `src/__tests__` o con el túnel cerrado (ese directorio escribe en Aurora, ver `04`).
- **Estructurales:** (1) i18n con claves por módulo y formato por locale CR/VE (`Intl`) — requiere definir idiomas objetivo; (2) tipos por entidad para sustituir `Row`; (3) partir las funciones largas del motor con la batería de pruebas como red; (4) asignación de `LIQ-` en servidor.

## 6. Preguntas abiertas
1. ¿Borrador → Pagado debe exigir "Aprobado" antes de pagar? (hoy permitido).
2. ¿Idiomas objetivo para i18n (solo es-CR/es-VE o también en)? ¿Se acepta el trabajo de traducir ~todos los textos del módulo ahora?
3. ¿Se autoriza partir `runChargePipeline` y demás funciones largas del motor?
4. Backend/Intelix: numeración atómica, validación de estados, `organization_id` por token, `numeric` como string, paginación (detalle en `04`).
