# Test Results — FR16 (Devoluciones/Pickups)

Ejecutado sobre el código de `code-generation` (unidad `u1-devoluciones-en-secuencia`).

## Build

```
$ pnpm run build
✓ built in 17.96s
```
**Estado: ÉXITO.**

## Type-check

```
$ pnpm exec tsc --noEmit
```
0 errores en `src/pages/planificacion/**`. ~37 errores preexistentes en
módulos ajenos (conductores, vehículos, contratos, reportes, CsvImportModal…)
— no tocados por esta unidad, fuera de alcance.

## Lint

```
$ pnpm exec eslint src/pages/planificacion/ e2e/planificacion-flujo.spec.ts
```
**Estado: limpio**, 0 errores/warnings.

## Unit tests (Vitest)

```
$ pnpm test
Test Files  4 passed (4)
     Tests  15 passed (15)
```

| Archivo | Qué cubre |
|---------|-----------|
| `capacity-fit.test.ts` | `optimizarConCapacidad` devuelve `excluidos[]`; devolución cuenta en capacidad igual que entrega (BR1.2); exclusión de devolución/entrega |
| `route-geometry.test.ts` | `obtenerGeometriaRutaPorLeg` devuelve N-1 legs; fallback recto con `fromStopNumber`/`toStopNumber` correctos |
| `optimize-stops.test.ts` | La secuencia incluye paradas de devolución sin alterar el orden por tipo |
| `components/TipoParadaBadge.test.tsx` | Renderiza "Devolución" (texto visible) para `tipo="devolucion"`; nada para `entrega`/`undefined` |

## Integration / E2E (Playwright)

```
$ pnpm exec playwright test
7 passed (14.5s)
```

Incluye el caso nuevo: *"FR16 — un viaje con devolución muestra el badge
'Devolución' y el subtotal de capacidad"*.

## Cobertura (v8, lógica de `src/pages/planificacion/`)

| Archivo | Líneas | Nota |
|---------|--------|------|
| `capacity-fit.ts` | 81.81% | ✅ cumple el piso `feature` (80%) |
| `optimize-stops.ts` | 96.96% | ✅ |
| `TipoParadaBadge.tsx` | 100% | ✅ |
| `route-geometry.ts` | 62.16% (archivo completo) | ⚠️ ver nota |

**Nota sobre `route-geometry.ts`:** el 62.16% es del archivo completo, que
incluye la función preexistente `obtenerGeometriaRuta` (mantenida sin tocar
por compatibilidad, 0% cubierta porque ningún consumidor la sigue usando ni
esta unidad la modifica). La función **nueva** de esta unidad,
`obtenerGeometriaRutaPorLeg`, sí se ejerce (4/4 tests la llaman); su rama de
guard `if (!Array.isArray(stepCoords)) continue` dentro del loop de steps
queda sin cubrir explícitamente — caso defensivo, bajo riesgo. No se considera
incumplimiento del piso `feature`: el piso aplica a la lógica nueva/cambiada,
no a código preexistente sin tocar.

Cobertura del **módulo completo** (`src/pages/planificacion/`): 12.65% —
esperado, la mayoría de la UI se verifica con Playwright (interacción real),
no con Vitest; el piso de 80% se evalúa sobre la lógica nueva/cambiada de esta
unidad, no sobre el módulo entero.

## Assumptions & Open Questions

- [assumption] El piso de cobertura `feature` (80%) se interpreta por
  archivo/lógica nueva o cambiada, no por módulo completo — consistente con
  cómo se evaluó en code-generation.
- Open question: cubrir explícitamente el guard de `stepCoords` no-array en
  `obtenerGeometriaRutaPorLeg` si se retoma este archivo en un ciclo futuro.
