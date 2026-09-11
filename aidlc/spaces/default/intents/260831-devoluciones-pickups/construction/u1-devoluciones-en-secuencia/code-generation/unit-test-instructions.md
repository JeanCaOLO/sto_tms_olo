# Instrucciones de Test — U1 (u1-devoluciones-en-secuencia)

## Prerrequisitos

El repo usa **pnpm** (`pnpm-lock.yaml`). Las dependencias de test ya están
añadidas a `devDependencies`:
`vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`,
`@testing-library/jest-dom`.

Si el `node_modules` está limpio:

```bash
pnpm install
```

## Comandos

| Objetivo | Comando |
|----------|---------|
| Tests unitarios (Vitest, una pasada) | `pnpm test` |
| Unitarios + cobertura | `pnpm test:coverage` |
| E2E de Planificación (Playwright) | `pnpm exec playwright test planificacion` |
| Solo el caso FR16 del e2e | `pnpm exec playwright test planificacion-flujo -g "FR16"` |
| Type-check | `pnpm type-check` |
| Lint | `pnpm lint` |

`pnpm test` corre `vitest run`. Config en `vitest.config.ts`: entorno `node`
por defecto; los tests que necesitan DOM declaran
`// @vitest-environment jsdom` en su cabecera. `include`:
`src/**/*.test.{ts,tsx}`.

## Qué cubre cada archivo de test

### `src/pages/planificacion/capacity-fit.test.ts` (node) — 6 tests

- `optimizarConCapacidad` devuelve el **array** `excluidos` (no un conteo) con
  las paradas que no caben.
- **BR1.2**: una devolución conocida cuenta en la capacidad igual que una
  entrega (misma cantidad excluida con o sin `tipo`).
- **BR1.2**: una devolución puede quedar excluida por capacidad.
- **BR1.2**: una devolución grande fuerza la exclusión de paradas de entrega.
- Sin vehículo no excluye nada (`excluidos === []`).
- Una devolución **anclada** nunca se excluye.

### `src/pages/planificacion/route-geometry.test.ts` (node, `fetch` mockeado) — 4 tests

- **BR1.3**: `obtenerGeometriaRutaPorLeg` devuelve N-1 legs para N paradas,
  con `fromStopNumber`/`toStopNumber` alineados a los pares consecutivos y la
  geometría de OSRM convertida `[lng,lat]`→`[lat,lng]`.
- Fallback: ante rechazo de `fetch`, un segmento recto por par consecutivo con
  los `stop_number` correctos.
- Fallback: ante nº de legs inconsistente en la respuesta de OSRM, rectos.
- Menos de 2 paradas ⇒ `[]`.

### `src/pages/planificacion/optimize-stops.test.ts` (node) — 2 tests

- Smoke: el mismo orden con y sin devoluciones marcadas (el `tipo` no afecta
  la secuenciación — solo el pintado, BR1.3).
- La secuencia conserva todas las paradas de devolución y numera 1..N.

### `src/pages/planificacion/components/TipoParadaBadge.test.tsx` (jsdom) — 3 tests

- **BR1.4**: renderiza el texto visible "Devolución" para `tipo="devolucion"`.
- No renderiza nada para `tipo="entrega"`.
- No renderiza nada para `tipo` undefined.

### `e2e/planificacion-flujo.spec.ts` — caso nuevo "FR16 …"

- Al seleccionar "Viaje 1" (tiene una devolución en el mock) el badge
  "Devolución" es visible.
- Con vehículo seleccionado, la línea "… de N devolución/es" aparece bajo las
  barras de capacidad. Se hace `test.skip` si el catálogo de vehículos mock
  viene vacío.

## Resultados de la última corrida (2026-09-01)

- `pnpm test` → **4 archivos, 15 tests, 15 pasan**.
- `pnpm exec playwright test planificacion` → **7 pasan** (2 smoke + 5 flujo,
  incluye el caso FR16 nuevo).
- Cobertura (`pnpm test:coverage`) sobre la lógica nueva/cambiada:
  `capacity-fit.ts` 81.8% líneas (lo no cubierto son 74-79 =
  `excedeCapacidadAlAnclar`, función preexistente no tocada);
  `route-geometry.ts` — la nueva `obtenerGeometriaRutaPorLeg` cubierta; lo no
  cubierto (75-93) es `obtenerGeometriaRuta`, función preexistente conservada.
