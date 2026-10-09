# Registro — Fase 4 («Forma de liquidar» en el modal de liquidar)

Fecha: 2026-10-08. Solo frontend; sin migración (la forma elegida va dentro de `trip_edits`, que ya es jsonb).

## Motor (`src/lib/tarifas`)
- Nuevo `liquidationMethod.ts`: formas `km | fija | unidad | volumen`; `methodOfExpr` clasifica cada regla por su expresión (`PER_KM`→km; `FIXED`/`LOOKUP_TABLE`→fija; `PER_UNIT`/`TIERED`/`PER_BLOCK`→km si la unidad es `km`, volumen si es `truckVolumeM3`, si no unidad; porcentajes, topes e `IF` no pertenecen a ninguna y se conservan); `filterRulesByMethod` solo toca la etapa BASE.
- `types/settlement.ts`: `LiquidationMethod` y `TripEdits.method?`; exportado en `types.ts`. `types/io.ts`: `CalculateInput.method?`.
- `tripSettlement.ts` → `settlementInput.ts` → `CalculateInput`: la forma viaja con `edits.method`.
- `index.ts` (`calculate`): con forma elegida filtra las reglas BASE antes de resolverlas (no compiten en grupos EXCLUSIVE/MAX). Flota propia: `km` conserva la estructura de costos como base; otra forma la omite y avisa. Si no hay ninguna regla BASE de la forma elegida → problema bloqueante `BASE_NO_DISPONIBLE` con mensaje claro (no se emite un total vacío en silencio).
- Sin forma elegida el cálculo es idéntico al anterior (probado).

## UI (`src/pages/liquidaciones`)
- Nuevo `parts/MethodSelector.tsx` («Forma de liquidar»), en `CalculationContent`, visible en vista simple y extendida, para flota propia y terceros.
- `useLiquidarViajeController`: estado `method`, se reenvía en cada recálculo, se reinicia al abrir (re-liquidar recupera la forma guardada) y se guarda con `editsUsed`.

## Pruebas
- `__tests__/liquidationMethod.test.ts` (8): total sin forma = el de siempre; km/fija/unidad; sin regla → bloquea; propia+km igual que antes; propia+otra forma omite estructura y avisa; clasificación y filtro.
- `parts/MethodSelector.test.tsx` (3).
- Snapshots de `LiquidarViajeModal.snap.test.tsx` (vista simple y extendida) regenerados: se verificó palabra por palabra que la ÚNICA diferencia es la sección nueva del selector.

## Límites conocidos
- «Volumen» usa la capacidad del camión (`truckVolumeM3`); el volumen real de los pedidos del viaje no llega al motor.
- Tendering no está soportado (sin mecánica definida).
- Supuesto a confirmar con negocio: que la flota propia pueda liquidarse por reglas BASE en lugar de la estructura de costos.

## Verificación
tsc 0 errores · vitest (sin `src/__tests__`) 911+ pasados / 0 fallidos.
