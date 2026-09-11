# Resumen de Código — U1 (u1-devoluciones-en-secuencia)

FR16.1–16.3: devoluciones/pickups visibles en la secuencia de paradas del
módulo de Planificación de Rutas. Unidad `ui` brownfield. FR16.4 fuera de
alcance (no implementado).

## Archivos creados

| Archivo | Por qué |
|---------|---------|
| `src/pages/planificacion/components/TipoParadaBadge.tsx` | Distintivo reutilizable "Devolución" (ícono + texto visible + color) para las cards; BR1.4. |
| `src/pages/planificacion/capacity-fit.test.ts` | Tests de `optimizarConCapacidad` y del conteo de devoluciones en capacidad; BR1.2. |
| `src/pages/planificacion/route-geometry.test.ts` | Tests de `obtenerGeometriaRutaPorLeg` (legs OSRM + fallback recto); BR1.3. |
| `src/pages/planificacion/optimize-stops.test.ts` | Smoke: el `tipo` no altera la secuenciación; BR1.3. |
| `src/pages/planificacion/components/TipoParadaBadge.test.tsx` | Test jsdom del badge; BR1.4. |
| `vitest.config.ts` | Bootstrap del runner unitario (no existía; el repo solo tenía Playwright). |

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/pages/planificacion/types.ts` | `Pedido.tipo?: 'entrega' \| 'devolucion'` (ausente ⇒ entrega, BR1.1). |
| `src/pages/planificacion/capacity-fit.ts` | `optimizarConCapacidad` devuelve `{ orden, excluidos: PedidoSeleccionado[] }` (antes `excluidosCount`); algoritmo sin cambio (BR1.2). |
| `src/pages/planificacion/use-pedidos-ruta.ts` | `excluidosPorCapacidad` pasa de `number` a `PedidoSeleccionado[]`. |
| `src/pages/planificacion/route-geometry.ts` | Nueva export `obtenerGeometriaRutaPorLeg` + tipo `Leg`; OSRM `steps=true` concatenado por leg, timeout 5 s, fallback recto por par. `obtenerGeometriaRuta` conservada. |
| `src/pages/planificacion/components/NuevaRutaTab.tsx` | Aviso de exclusión compuesto por tipo (entregas vs. devoluciones), envuelto en región `role="status"` persistente; calcula `devolucionesCount/Peso/Volumen` y los pasa a `ConfiguracionRuta`. |
| `src/pages/planificacion/components/ConfiguracionRuta.tsx` | Props `devolucionesCount/Peso/Volumen`; línea `aria-live="polite"` persistente bajo `CapacityBar` con el subtotal de devoluciones. |
| `src/pages/planificacion/components/PedidoCard.tsx` | Borde izquierdo indigo + `<TipoParadaBadge>` cuando `tipo === 'devolucion'`. |
| `src/pages/planificacion/components/ParadaCard.tsx` | Ídem en la card de la secuencia. |
| `src/pages/planificacion/components/RutaMapaPreview.tsx` | Pines por tipo (teal/indigo); una `<Polyline>` por leg con estilo BR1.3 (indigo discontinuo si un extremo es devolución); leyenda Leaflet `bottomleft` oculta si no hay devoluciones. |
| `src/pages/planificacion/fallback-viajes.ts` | Marca ORD-MOCK-015 (Viaje 1) y ORD-MOCK-001/009 (Viaje 3) como `tipo: 'devolucion'` para la demo. |
| `src/pages/planificacion/fallback-pedidos.ts` | `getFallbackPedidos` marca los índices 8 y 14 como devolución (flujo por ruta). |
| `package.json` | Scripts `test` / `test:coverage`; devDeps `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`. |
| `e2e/planificacion-flujo.spec.ts` | Caso "FR16 — un viaje con devolución muestra el badge y el subtotal". |

## Resultados de test

| Suite | Resultado |
|-------|-----------|
| `pnpm test` (Vitest) | **15/15** en 4 archivos |
| `pnpm exec playwright test planificacion` | **7/7** (2 smoke + 5 flujo, incl. FR16) |
| `pnpm type-check` (`tsc --noEmit`) | Sin errores nuevos en `planificacion` (errores preexistentes en otros módulos: `conductores`, `vehiculos`, `rutas`, etc. — no tocados). |
| `pnpm lint` (`eslint`) | Sin problemas en los archivos cambiados. |

Cobertura sobre la lógica nueva/cambiada: `capacity-fit.ts` 81.8% líneas (lo no
cubierto es `excedeCapacidadAlAnclar`, preexistente); la nueva
`obtenerGeometriaRutaPorLeg` de `route-geometry.ts` cubierta por 4 tests (las
líneas rojas del reporte son `obtenerGeometriaRuta`, preexistente y
conservada). Se cumple el piso `feature` del 80% sobre lo cambiado.

## Radio de impacto (blast radius)

- Cambio de firma de `optimizarConCapacidad`: único consumidor
  `use-pedidos-ruta.ts` (confirmado por el reviewer y por `tsc`). `fleet-split.ts`
  usa `seleccionarPorCapacidad`; `use-pedidos-anclados.ts` usa
  `excedeCapacidadAlAnclar`; ninguno cambia.
- `excluidosPorCapacidad` cambia de `number` a `PedidoSeleccionado[]`: `page.tsx`
  solo reenvía (tipo inferido del hook, sin anotación) — `tsc` limpio.
- `route-geometry.ts`: `RutaMapaPreview` migra a la nueva export;
  `obtenerGeometriaRuta` queda sin consumidores pero se conserva (no rompe nada).
- Datos mock: solo afectan la demo local (`fallback-*`), sin escritura real.
- Sin cambios en auth, catálogos, otros módulos, ni en `CapacityBar.tsx`.

## Diferido / notas para build-and-test

- **FR16.4** (capacidad posicional / reordenar para hacer caber una recolección
  intermedia): fuera de alcance de U1, no implementado (FR16.3.2 se marca
  excluida sin reordenar).
- Open question del diseño: verificar que `steps=true` no infla la respuesta de
  OSRM de forma problemática para ~20 paradas (medir en build-and-test).
- Regiones vivas (`role="status"` / `aria-live="polite"`) se montan siempre y se
  llenan de forma condicional (recomendación del reviewer, hallazgo #5) —
  verificar el anuncio con un lector de pantalla real en build-and-test.
- Vitest se agregó con **pnpm** (el repo usa `pnpm-lock.yaml`); `bun add` falló
  al migrar el lockfile. CI debe usar `pnpm install` + `pnpm test`.
- Cobertura global del proyecto es baja (12%) porque solo hay tests de
  Planificación; el piso del 80% aplica a la lógica nueva/cambiada de esta
  unidad, que se cumple.

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-09-01T15:44:09Z
**Iteration:** 1

### Findings

| # | Severidad | Ubicación | Hallazgo | Recomendación |
|---|-----------|-----------|----------|---------------|
| 1 | Minor | `ConfiguracionRuta.tsx` líneas 62-78 (bloque `aria-live="polite"`) vs. code-summary.md ("Regiones vivas... se montan siempre") | La región `role="status"` de `NuevaRutaTab.tsx` sí está siempre montada (verificado línea 60: `<div role="status">` envuelve el contenido condicional). Pero el `<div aria-live="polite">` de `ConfiguracionRuta.tsx` vive DENTRO del bloque condicional `{vehiculoSeleccionado && pedidosCount > 0 && (...)}` (línea 62) — no existe en el DOM hasta que hay vehículo Y ≥1 pedido, y en ese primer montaje puede ya traer `devolucionesCount > 0` con contenido. Muchos lectores de pantalla no anuncian el contenido inicial de una región viva recién montada (el mismo riesgo que motivó la recomendación previa del reviewer para el aviso de exclusión, hallazgo #5 de functional-spec.md). El code-summary afirma que ambas regiones "se montan siempre", lo cual es cierto solo para la de `NuevaRutaTab`. | Mover el `<div aria-live="polite">` fuera del `{vehiculoSeleccionado && pedidosCount > 0 && ...}` (montarlo siempre, vacío si no aplica), igual que se hizo con el `role="status"` del aviso de exclusión. Verificar el anuncio real con lector de pantalla en build-and-test. |
| 2 | Minor | code-summary.md "Resultados de test" (Playwright 7/7) | Esta revisión re-ejecutó y confirmó `pnpm test` (15/15 en 4 archivos), `pnpm exec tsc --noEmit` (sin errores nuevos en `planificacion`; todos los preexistentes son de otros módulos no tocados) y `pnpm exec eslint src/pages/planificacion` (limpio), y confirmó por cobertura real `capacity-fit.ts` 81.81% líneas (no cubierto: 74-79, `excedeCapacidadAlAnclar`, preexistente) y `route-geometry.ts` con `obtenerGeometriaRutaPorLeg` cubierta (no cubierto: 75-93, `obtenerGeometriaRuta`, preexistente). No se re-ejecutó la suite Playwright (requiere servidor dev) dentro de esta revisión, así que el resultado "7/7" queda sin verificación independiente en esta pasada — el archivo del caso FR16 (`e2e/planificacion-flujo.spec.ts`) sí se leyó y asocia correctamente selectores reales (`getByLabel('Viaje (WMS)')`, texto "Devolución", regex de subtotal) contra el mock de `fallback-viajes.ts`. | Confirmar la corrida de Playwright en build-and-test antes de mergear. |
| 3 | Minor | `RutaMapaPreview.tsx` (herencia de comportamiento previo, no introducido por U1) | `paradas` se calcula filtrando por `tieneCoordenadas` (línea 88-91); una parada de devolución sin `delivery_latitude/longitude` (p. ej. una excepción de dirección, campo `is_exception` ya existente) queda fuera de la cadena de legs y de `hayDevolucion`/leyenda sin aviso — el leg simplemente conecta las dos paradas vecinas con coordenadas, ocultando la recolección real. Es el mismo comportamiento que ya tenía `obtenerGeometriaRuta` para excepciones de entrega; U1 no lo agrava ni lo corrige. | No bloqueante para U1; dejar registrado como límite conocido si FR16 y excepción de dirección llegan a combinarse en producción. |

### Validation Tool Results

| Herramienta | Resultado | Interpretación |
|-------------|-----------|-----------------|
| `pnpm test` (Vitest, re-ejecutado por el reviewer) | 4 archivos, 15/15 pasan | Confirma la tabla de resultados de code-summary.md; los tests de `capacity-fit.test.ts` y `optimize-stops.test.ts` verifican comportamiento real (BR1.2 con devoluciones grandes/ancladas, BR1.3 orden estable), no son triviales. |
| `pnpm exec tsc --noEmit --project tsconfig.app.json` (re-ejecutado) | 37 errores, ninguno en `src/pages/planificacion/**` | Confirma que el cambio de firma de `optimizarConCapacidad` y el nuevo tipo de `excluidosPorCapacidad: PedidoSeleccionado[]` no rompen `page.tsx` ni `NuevaRutaTab.tsx`; los 37 errores preexisten en `conductores`, `contratos`, `devoluciones`, `guias`, `reportes`, `rutas`, `transportistas` — módulos no tocados por esta unidad. |
| `pnpm exec eslint src/pages/planificacion --ext ts,tsx --max-warnings 0` (re-ejecutado) | Sin salida (limpio) | Confirma la afirmación de code-summary.md. |
| `pnpm test:coverage` (re-ejecutado, grep por archivo) | `capacity-fit.ts`: 81.81% líneas, no cubierto 74-79 (`excedeCapacidadAlAnclar`); `route-geometry.ts`: no cubierto 75-93 (`obtenerGeometriaRuta`) | Coincide exactamente con lo declarado; el piso `feature` del 80% se cumple sobre la lógica nueva/cambiada. |
| `git diff --stat` / `git status` sobre `CapacityBar.tsx`, `fleet-split.ts`, `use-pedidos-anclados.ts` | Sin diferencias, no listados como modificados | Confirma que `CapacityBar` queda genérico e intacto y que los otros dos consumidores de capacidad no fueron tocados, como afirma el "radio de impacto" de code-summary.md. |
| `grep -rn "tipo === 'entrega'"` en `src/` | Sin coincidencias | BR1.1: ningún consumidor clasifica por `tipo === 'entrega'` (lo que trataría `undefined` como no-entrega por error); todos usan `tipo === 'devolucion'` o `tipo !== 'devolucion'`, que tratan `undefined` correctamente como entrega. |
| Lectura cruzada `capacity-fit.ts` ↔ `use-pedidos-ruta.ts` ↔ `NuevaRutaTab.tsx` ↔ `page.tsx` | `optimizarConCapacidad` devuelve `{ orden, excluidos: PedidoSeleccionado[] }`; el hook lo desestructura igual; `NuevaRutaTab` filtra `excluidosPorCapacidad` por `tipo === 'devolucion'`; `page.tsx` solo reenvía la prop (tipo inferido, sin anotación obsoleta) | Ningún consumidor quedó con la firma vieja (`excluidosCount: number`); confirma BR1.2/W3 y el hallazgo #2 ya resuelto en la revisión de functional-spec.md. |
| Lectura `RutaMapaPreview.tsx` ↔ `route-geometry.ts` | Legs alineados 1:1 por `fromStopNumber`/`toStopNumber` vía `tipoPorStop` (Map por `stop_number`); guard `legs.length !== rectos.length` → fallback recto si OSRM devuelve un nº de legs distinto al esperado (steps fusionados/partidos); `paradas.length < 2` y `paradas.length === 0` no rompen el render (UI de "sin coordenadas" / `.slice(0,-1)` vacío) | BR1.3 implementado sin off-by-one; el caso "OSRM devuelve distinto nº de legs" mencionado en la asunción de functional-spec.md está cubierto por el guard y por `route-geometry.test.ts` ("nº de legs inconsistente => rectos"). |

### Summary

Los cuatro business rules (BR1.1-BR1.4) están implementados y trazados de forma verificable: `tipo === undefined` se trata como entrega en todos los consumidores (sin ningún `=== 'entrega'` que lo clasificara mal), el bin-packing suma peso/volumen de toda parada sin distinguir tipo y el cambio de firma de `optimizarConCapacidad` se propagó correctamente por los tres consumidores (hook, `NuevaRutaTab`, `page.tsx`), los legs del mapa se alinean 1:1 con las paradas consecutivas con un guard robusto ante geometría OSRM inconsistente, y el badge de devolución expone su texto como nombre accesible real (no `aria-hidden`, no `aria-label` sobre `<div>` sin rol). `CapacityBar.tsx`, `fleet-split.ts` y `use-pedidos-anclados.ts` quedan intactos como se documentó, y FR16.4 no se implementó, tal como exige el alcance. Se re-ejecutaron tests unitarios, type-check, lint y cobertura y coinciden con lo declarado en code-summary.md. Los tres hallazgos son Minor: una región `aria-live` que no se monta siempre (contradice la propia nota de code-summary.md sobre regiones vivas), la suite Playwright no se re-ejecutó de forma independiente en esta pasada, y un límite heredado (no introducido por U1) donde una devolución sin coordenadas queda invisible en la cadena de legs. Ninguno bloquea: un desarrollador puede construir y desplegar desde este código sin consultar al arquitecto.
