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
| E5 | `prefetchTripCatalog`: al pasar el cursor o enfocar "Liquidar" se calienta el perfil y el catálogo de ese transportista | `src/lib/tarifas/tripSettlement.ts`, `src/pages/liquidaciones/page.tsx`, `__tests__/prefetch.test.ts` | Navegador: Transosa pasó de 15,0 s a 5,0 s al abrir el modal tras el cursor |
| E7 | Mensaje de identificación fiscal: "Falta — se necesita para pagarle" (la emisión no la exige) | `src/pages/companias/CompaniasView.tsx` | Revisión de código |

Pruebas: 713 pasan (52 archivos), type-check sin errores fuera de `src/pages/planificacion/*`, ESLint sin errores (queda el warning previo de `LiquidarViajeModal.tsx`).

## Restricción y alcance dados por el usuario
No se toca nada de Intelix: ni `backend/`, ni `template.yaml`, ni despliegues. El usuario es dueño de las tablas del módulo tarifador en esta base de test (CRUD solo del tarifador, de ningún otro módulo), así que lo que se arregla en datos se hace en `tarifas_*`. La prueba del manifiesto solo LEE `backend/tarifas/src/schema_manifest.json`.

## Segunda tanda (2026-10-08)
| Hallazgo | Cambio | Verificado |
|---|---|---|
| **E14** emitir fallaba | `sql/29_tarifas_settlement_date_compat_text.sql`: `settlement_date` vuelve a `text` (el backend desplegado manda `::text`). Dry-run, luego `--execute`. Solo una columna de `tarifas_settlements` | Navegador: emitir RT-DEMO-3 (7 s), Borrador → En Revisión → Aprobado → Pagado, re-liquidar (LIQ-CR-002 → LIQ-CR-003, validación de motivo vacío incluida) y anular |
| E6 moneda | **Revertido.** La moneda la define el módulo Catálogo (países) y el liquidador solo la consume; un ajuste local (`currency.ts`) se quitó. Costa Rica figura en USD en ese catálogo: se corrige allí, no acá | Quitado; 787 pruebas pasan |
| E17 | Una liquidación Anulada ya no se puede reactivar (selector bloqueado con explicación) | Navegador: las 3 anuladas salen bloqueadas |
| E10 | La bandeja marca "Anulada antes" en viajes que ya tuvieron una liquidación anulada (misma consulta de siempre, ahora con `status`) | Navegador: RT-DEMO-3 y RT-DEMO-17 |
| E5 (ampliado) | TTL del catálogo y del perfil: 60 s → 5 min (lo que escribe la sesión se descarta al instante) | Pruebas |
| Prueba de manifiesto | `KNOWN_DIVERGENCES` con `settlement_date` y su motivo, para que la prueba pase y deje claro qué quitar al desplegar | Pasa contra Aurora |

Pruebas: 791 pasan; type-check limpio fuera de `planificacion`; ESLint solo con el warning previo.

Datos que dejaron las pruebas: LIQ-CR-002 (reemplazada) y LIQ-CR-003, ambas Anuladas; RT-DEMO-3 vuelve a estar en la bandeja; LIQ-0001 sigue Anulada. Quedan también registros en la bitácora.

## Restricción del usuario (primera tanda)
No se toca nada de Intelix.

## Retirados tras revisar
- **E12** (filtros de fecha): falso positivo de la medición.
- **E9** (estructura de OLO con 0 registros): no es error; OLO usa la estructura del país.

## Pendiente que depende de un despliegue ajeno (no se toca)
- **E3/E5**: el backend desplegado no tiene `POST /tarifas/batch` (404); sin él el catálogo se lee en ~11 lecturas sueltas (primera apertura de un transportista 5–15 s). La mitigación del frontend (cursor, caché de 5 min) ya está; la mejora completa llega cuando se despliegue el backend actual.
- Al desplegar: reaplicar la migración 28 (ver runbook).

## Diferidos (bajo valor o fuera de alcance)
- **E13**: la descarga la hace la librería `xlsx`; avisar con un aviso emergente afectaría todas las tablas.
- **E2/E4**: gran parte de los duplicados son de `StrictMode` en desarrollo; se revisan tras el despliegue.

## Datos
Las pruebas del navegador dejaron los pedidos de RT-DEMO-3 como "Incluido". No se emitió ninguna liquidación (E14 sigue abierto).
