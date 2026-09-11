# Plan de Generación de Código — U1 (u1-devoluciones-en-secuencia)

Unidad `ui` brownfield. FR16.1–16.3: devoluciones/pickups en la secuencia de
paradas del módulo de Planificación de Rutas (`src/pages/planificacion/`).
Diseño de referencia: `../functional-design/frontend-components.md`,
`../functional-design/functional-spec.md` (W1–W3, BR1.1–BR1.4),
`../functional-design/rules.md`. **FR16.4 (capacidad posicional / reordenar)
queda fuera de alcance.**

## Testing Contract (verbatim)

```json
{
  "methodology": "test-after",
  "ordering": "Implementar cada capa testeable aplicable, luego escribir y correr los tests de esa capa.",
  "strategy": "standard",
  "strategy_detail": "5–8 tests por componente para el comportamiento clave.",
  "scope_floor": {
    "scope": "feature",
    "line_coverage_floor": 0.80,
    "coverage_target": "lógica nueva/cambiada",
    "ci": "tests ejecutables en CI antes del merge"
  },
  "notes": [
    "El repo no tiene runner de tests unitarios hoy (solo test:e2e Playwright).",
    "Bootstrap de Vitest + @vitest/coverage-v8; scripts test / test:coverage.",
    "Unit-test de los módulos de lógica pura; extender el e2e de Playwright con una aserción FR16."
  ]
}
```

## Pasos

### Capa 1 — Modelo de datos

- [x] **1. `types.ts`** — añadir `tipo?: 'entrega' | 'devolucion'` a `Pedido`
  (se hereda en `PedidoSeleccionado` y en el `Pedido` del mock). Ausente ⇒
  entrega. → FR16.1.1 / BR1.1

### Capa 2 — Lógica de capacidad

- [x] **2. `capacity-fit.ts`** — `optimizarConCapacidad` pasa a devolver
  `{ orden, excluidos: PedidoSeleccionado[] }` (antes `excluidosCount: number`).
  Algoritmo de bin-packing sin cambio: `seleccionarPorCapacidad` ya suma
  peso/volumen de toda parada sin mirar `tipo`. → FR16.3, FR16.3.1 / BR1.2
- [x] **3. `use-pedidos-ruta.ts`** — el estado `excluidosPorCapacidad` pasa de
  `number` a `PedidoSeleccionado[]`; se expone el array. Actualizar el reenvío
  de la prop en `page.tsx` y el tipo en `NuevaRutaTab.Props`. → FR16.3.1 / BR1.2

### Capa 3 — Geometría de ruta

- [x] **4. `route-geometry.ts`** — nueva export `obtenerGeometriaRutaPorLeg(paradas):
  Promise<Leg[]>` con `Leg = { coords, fromStopNumber, toStopNumber }`. OSRM
  `/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true`,
  `routes[0].legs[i]` concatenando `steps[j].geometry.coordinates`
  (`[lng,lat]`→`[lat,lng]`), timeout 5 s. Fallback: un `Leg` recto por par
  consecutivo. Se conserva `obtenerGeometriaRuta`. → FR16.2.2 / BR1.3

### Capa 4 — Componentes de UI

- [x] **5. `TipoParadaBadge.tsx` (nuevo)** — `tipo?` prop; `devolucion` →
  `<span>` indigo con `<i class="ri-arrow-go-back-line" aria-hidden>` + texto
  visible "Devolución"; `entrega`/undefined → `null`. Sin `aria-label` (el
  texto visible ES el nombre accesible). → FR16.2.1 / BR1.4
- [x] **6. `PedidoCard.tsx` / `ParadaCard.tsx`** — `border-l-4 border-l-indigo-500`
  en el contenedor cuando `pedido.tipo === 'devolucion'` (independiente del
  borde ámbar de "anclado"); `<TipoParadaBadge>` en la fila de badges antes de
  los de estado. Sin `aria-label` en la card. → FR16.1 / BR1.4
- [x] **7. `NuevaRutaTab.tsx`** — lee `excluidosPorCapacidad: PedidoSeleccionado[]`;
  compone el aviso contando `tipo === 'devolucion'` vs. resto; el `<div>` del
  aviso va dentro de una región `role="status"` montada siempre (vacía si no
  hay exclusión). Calcula `devolucionesCount/Peso/Volumen` de
  `pedidosSeleccionados` y los pasa a `ConfiguracionRuta`. → FR16.3.1 / BR1.2
- [x] **8. `ConfiguracionRuta.tsx`** — props nuevas
  `devolucionesCount/Peso/Volumen`; línea `aria-live="polite"` (montada
  siempre) bajo el bloque de `CapacityBar` que muestra
  "incluye {peso} kg · {vol} m³ de {n} devolución/es" cuando `count > 0`.
  `CapacityBar.tsx` sin cambios. → FR16.3 / BR1.2
- [x] **9. `RutaMapaPreview.tsx`** — `iconoParada(numero, tipo)` (teal `#0d9488`
  entrega / indigo `#4f46e5` devolución); una `<Polyline>` por leg de
  `obtenerGeometriaRutaPorLeg`, teal sólido vs. indigo `dashArray:'6 6'` según
  BR1.3; control Leaflet de leyenda (`bottomleft`, 2 filas), oculto si no hay
  devolución en la secuencia. → FR16.2.1, FR16.2.2 / BR1.3, BR1.4

### Capa 5 — Datos mock

- [x] **10. `fallback-viajes.ts` / `fallback-pedidos.ts`** — asignar `tipo` por
  pedido; marcar paradas de `MOCK_STOPS` como `tipo: 'devolucion'` (Viaje 1:
  ORD-MOCK-015; Viaje 3: ORD-MOCK-001, ORD-MOCK-009; flujo por ruta: índices
  8 y 14) para que la demo muestre el caso. `viajes-api.ts` reenvía el mock
  sin cambios. → FR16.1.1 / BR1.1

### Capa 6 — Tests (test-after)

- [x] **11. Bootstrap Vitest** — `vitest`, `@vitest/coverage-v8`, `jsdom`,
  `@testing-library/react`, `@testing-library/jest-dom` (vía pnpm — el repo usa
  pnpm-lock.yaml); `vitest.config.ts` (env node por defecto, `include` de
  `*.test.{ts,tsx}`, coverage v8 sobre `src/pages/planificacion/**`); scripts
  `test` y `test:coverage` en `package.json`.
- [x] **12. `capacity-fit.test.ts`** (node) — `optimizarConCapacidad` devuelve
  el array `excluidos`; una devolución cuenta en capacidad como una entrega
  (BR1.2); una devolución puede quedar excluida; una devolución grande fuerza
  la exclusión de otra parada; ancla protege la devolución. → BR1.2
- [x] **13. `route-geometry.test.ts`** (node, `fetch` mockeado) —
  `obtenerGeometriaRutaPorLeg` devuelve N-1 legs para N paradas; conversión
  `[lng,lat]`→`[lat,lng]`; fallback recto con `fromStopNumber/toStopNumber`
  correctos ante rechazo de red y ante nº de legs inconsistente. → BR1.3
- [x] **14. `optimize-stops.test.ts`** (node) — smoke: la secuencia incluye las
  paradas de devolución sin alterar el orden respecto a no marcarlas. → BR1.3
- [x] **15. `TipoParadaBadge.test.tsx`** (jsdom) — renderiza el texto
  "Devolución" para `tipo="devolucion"`; no renderiza nada para
  `entrega`/undefined. → BR1.4
- [x] **16. `e2e/planificacion-flujo.spec.ts`** — nuevo caso: al seleccionar un
  viaje con devolución, el badge "Devolución" es visible y (con vehículo
  seleccionado) la línea de subtotal de devoluciones aparece. → FR16.1, FR16.3
- [x] **17. Correr** `pnpm test`, `pnpm test:coverage`, `pnpm exec playwright
  test planificacion`; registrar conteos.

## Guardarraíles aplicados

- Archivos completos y ejecutables; sin stubs ni TODO sin justificación.
- Manejo de error en el borde OSRM: `try/catch` + fallback de línea recta
  (patrón existente conservado).
- No se implementa FR16.4. No se tocan auth, catálogos ni módulos ajenos.
- `bunx tsc --noEmit` y `bunx eslint` sobre los archivos cambiados: limpios.
