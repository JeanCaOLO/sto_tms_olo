# Avance de la ejecución del plan (2026-10-08)

## Hecho en el repositorio
| Hallazgo | Cambio | Archivos | Verificado |
|---|---|---|---|
| E14 (prevención) | Prueba opt-in que compara `backend/tarifas/src/schema_manifest.json` con Aurora (`TARIFAS_AURORA_MANIFEST=1`); el manifiesto actual coincide | `src/lib/tarifas/__tests__/aurora.manifest-esquema.test.ts` | Pasa contra Aurora |
| E14 (proceso) | Sección "Orden obligatorio: migración de esquema y despliegue del backend" en el runbook | `docs/tarifador/RUNBOOK_OPTIMIZACION_AURORA.md` | — |
| E1 | La pantalla espera a que carguen los permisos antes de decidir si el país está disponible | `src/hooks/useActiveCountry.ts` | Navegador: ya no aparece el aviso falso |
| E11 | `DataTable` acepta `searchHidden`; Liquidaciones lo usa para buscar también por columnas ocultas (placa) | `src/components/base/DataTable.tsx`, `src/pages/liquidaciones/page.tsx` | Navegador: `C162414` → 2 registros |
| E8 | `formatMoney` agrupa miles con texto exacto (`28,224.00`) | `src/lib/tarifas/format.ts`, `__tests__/format.test.ts` (7 pruebas nuevas) | Navegador: `$15,876.00` |
| E16 | Recalcular tras marcar un pedido ya no vuelve a pedir el viaje ni el perfil; pedidos y marcas, y el recálculo y la recarga de la tabla, van en paralelo | `LiquidarViajeModal.tsx`, `TripOrdersPanel.tsx`, `tripSettlement.ts`, `tripsDataSource.ts`, `partiesDataSource.ts` (caché del perfil, 60 s) | Navegador: "Incluir" se ve en ~4 s (antes ~7 s) |
| E15 | El error anterior se limpia cuando un recálculo funciona | `LiquidarViajeModal.tsx` | Revisión de código |
| E18 | El título "¿Por qué este total?" no sale si no hay cálculo | `LiquidarViajeModal.tsx` | Revisión de código |
| E7 | Mensaje de identificación fiscal: "Falta — se necesita para pagarle" (la emisión no la exige) | `src/pages/companias/CompaniasView.tsx` | Revisión de código |

Pruebas: 713 pasan (52 archivos), type-check sin errores fuera de `src/pages/planificacion/*`, ESLint sin errores (queda el warning previo de `LiquidarViajeModal.tsx`).

## Retirados tras revisar
- **E12** (filtros de fecha): falso positivo de la medición.
- **E9** (estructura de OLO con 0 registros): no es error; OLO usa la estructura del país.

## No se puede hacer desde el repositorio
- **E14 (despliegue)**: lo hace solo Intelix. Pedir el despliegue de `backend/tarifas`. Al desplegar también aparecen `POST /tarifas/batch` y `/find` (E3, E5).
- **E3/E5**: la mayor parte de la mejora llega al desplegar. Después hay que medir de nuevo.

## Pendiente de decisión de negocio
- **E6**: Costa Rica figura con moneda USD en la tabla `countries` (fuera del módulo) pero los montos son colones. Hay que corregir el dato en el catálogo o aceptar un mapeo de presentación.
- **E17**: transiciones de estado (si Anulado es final).

## Diferidos (bajo valor o fuera de alcance)
- **E13**: la descarga la hace la librería `xlsx`; avisar con un aviso emergente afectaría todas las tablas.
- **E10**: marca de "ya tuvo una liquidación anulada" exige una consulta nueva en la bandeja.
- **E2/E4**: gran parte de los duplicados son de `StrictMode` en desarrollo; se revisan tras el despliegue.

## Datos
Las pruebas del navegador dejaron los pedidos de RT-DEMO-3 como "Incluido". No se emitió ninguna liquidación (E14 sigue abierto).
