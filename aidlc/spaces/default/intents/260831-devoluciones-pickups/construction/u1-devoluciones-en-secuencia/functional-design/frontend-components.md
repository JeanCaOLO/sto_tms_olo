# Frontend Components — U1 (u1-devoluciones-en-secuencia)

Cambios a nivel componente para FR16.1–16.3 sobre `src/pages/planificacion/`.
Deriva de `functional-spec.md`, `../../../inception/refined-mockups/` y el código
actual.

## Jerarquía (sin cambios de estructura)

```
PlanificacionPage (page.tsx)
├── NuevaRutaTab
│   ├── RouteConfigForm  →  Select "Viaje (WMS)", conductor, vehículo
│   ├── PedidoCard[]        (panel izquierdo — pedidos del viaje)
│   ├── ParadaCard[]        (panel derecho — ruta en construcción)
│   ├── RutaMapaPreview     (mapa Leaflet)
│   └── ConfiguracionRuta   (incluye CapacityBar + botón Generar)
└── RutasGeneradas
```

## Componente nuevo: `TipoParadaBadge`

`src/pages/planificacion/components/TipoParadaBadge.tsx`

```tsx
interface Props { tipo?: 'entrega' | 'devolucion'; }
// devolucion → <span class="inline-flex items-center gap-1 rounded-full
//   bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5">
//   <i class="ri-arrow-go-back-line" aria-hidden="true"/>Devolución</span>
// entrega / undefined → null
```

- El texto **visible** "Devolución" ES el nombre accesible: el `<span>` NO
  lleva `aria-hidden`; solo el `<i>` decorativo lo lleva. Un lector de pantalla
  lo lee de forma natural al recorrer la card. No hace falta `aria-label` en el
  contenedor (BR1.4 cumplido por texto + ícono + color).
- No interactivo, no focusable. ~15 líneas; local a Planificación.

## Componentes modificados

### `PedidoCard.tsx` / `ParadaCard.tsx`

- Añadir `border-l-4 border-indigo-500` al contenedor cuando
  `pedido.tipo === 'devolucion'` (independiente del `border` de "anclado" en
  PedidoCard).
- Renderizar `<TipoParadaBadge tipo={pedido.tipo} />` en la fila de badges,
  antes de los badges de estado existentes (Anclado / Fuera de ventana /
  Excepción / En ruta). Su texto visible "Devolución" es lo que lee el lector
  de pantalla — no se añade `aria-label` al `<div>` contenedor (los `<div>`
  actuales no tienen `role`, un `aria-label` ahí sería ignorado).
- Sin cambios en el botón "Excluir" ni en el callout de excepción.

### `RutaMapaPreview.tsx`

- `iconoParada(numero, tipo)`: `background` = `#0d9488` (teal) para entrega,
  `#4f46e5` (indigo) para devolución.
- Reemplazar la `<Polyline positions={linea}>` única por un `.map` sobre los
  legs devueltos por `obtenerGeometriaRutaPorLeg` (ver route-geometry): una
  `<Polyline>` por leg con `pathOptions`:
  - ambos extremos entrega → `{ color: '#0d9488', weight: 3, opacity: 0.7 }`
  - alguno devolución (BR1.3) → `{ color: '#4f46e5', weight: 3, opacity: 0.8, dashArray: '6 6' }`
- Nueva `<Leyenda>` (control Leaflet posición `bottomleft`): 2 filas —
  "— entrega" (línea teal), "-- recolección" (línea indigo discontinua). Se
  oculta si no hay ninguna devolución en la secuencia.

### `route-geometry.ts`

- Nueva export `obtenerGeometriaRutaPorLeg(paradas): Promise<Leg[]>` donde
  `Leg = { coords: [number,number][]; fromStopNumber: number; toStopNumber: number }`.
- Implementación: OSRM `/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true`;
  `routes[0].legs[i]` concatenando `legs[i].steps[j].geometry.coordinates`
  (`[lng,lat]` → `[lat,lng]`). Timeout 5 s. Fallback (red/OSRM caído): un `Leg`
  recto por par consecutivo, `coords: [[lat_i,lng_i],[lat_{i+1},lng_{i+1}]]`.
  El `Leg.fromStopNumber` = `paradas[i].stop_number`, `toStopNumber` =
  `paradas[i+1].stop_number` (los legs se alinean 1:1 con los pares de la
  secuencia ordenada por `stop_number`).
- `obtenerGeometriaRuta` (la actual, polilínea plana) se mantiene por si algún
  consumidor la usa; el mapa pasa a la nueva.

### `capacity-fit.ts`

- Algoritmo de bin-packing **sin cambio** (BR1.2): `seleccionarPorCapacidad`
  suma peso/volumen de toda parada sin mirar `tipo`.
- **Cambio de firma:** `optimizarConCapacidad` devuelve
  `{ orden, excluidos: PedidoSeleccionado[] }` en vez de
  `{ orden, excluidosCount: number }` — ya calcula el array `excluidos`
  internamente (`seleccionarPorCapacidad` lo devuelve), solo dejaba de
  propagarlo. `seleccionarPorCapacidad` y `excedeCapacidadAlAnclar` no cambian.

### `use-pedidos-ruta.ts` (hook)

- `setExcluidosPorCapacidad` pasa a guardar `PedidoSeleccionado[]` (el array),
  no un número. El hook expone `excluidosPorCapacidad: PedidoSeleccionado[]`.

### `NuevaRutaTab.tsx`

- Lee `excluidosPorCapacidad: PedidoSeleccionado[]`. Compone el texto del aviso
  contando `.filter(p => p.tipo === 'devolucion').length` vs. el resto:
  - solo entregas → texto actual.
  - mezcla / solo devoluciones → "{e} pedido(s) de entrega y {d}
    devolución/es no caben en el vehículo… — reasígnalos a otro viaje".
- Añadir `role="status"` al `<div>` del aviso.
- Calcula los subtotales de devoluciones de `pedidosSeleccionados` y los pasa
  a `ConfiguracionRuta` como `devolucionesCount` / `devolucionesPeso` /
  `devolucionesVolumen`.

### `viajes-api.ts` / `fallback-viajes.ts` / `fallback-pedidos.ts`

- Asignar `tipo` a cada pedido. En el mock: marcar 1–2 paradas de
  `MOCK_STOPS` como `tipo: 'devolucion'` para que la demo muestre el caso.
- Cuando exista `trips`/`trip_orders` real, el `tipo` vendrá de ahí (OQ-4).

### `ConfiguracionRuta.tsx` (línea de devoluciones)

- `CapacityBar` (`components/CapacityBar.tsx`) **NO cambia** — es genérico
  (`value/max/unit`).
- `ConfiguracionRuta` recibe 3 props nuevas: `devolucionesCount: number`,
  `devolucionesPeso: number`, `devolucionesVolumen: number` (calculadas en
  `NuevaRutaTab`).
- Si `devolucionesCount > 0`, renderiza bajo el bloque de `CapacityBar` una
  línea `aria-live="polite"`: "incluye {devolucionesPeso} kg ·
  {devolucionesVolumen} m³ de {devolucionesCount} devolución/es".

## Integración con APIs / datos

| Punto | Hoy | Con FR16 |
|-------|-----|----------|
| Origen de paradas | `getFallbackViajes()` / Supabase | igual + campo `tipo` |
| Geometría de ruta | OSRM `/route?overview=full&geometries=geojson` (1 polilínea) | OSRM `/route?...&steps=true` → `routes[0].legs[i].steps[j].geometry` concatenado por leg |
| Distancias | OSRM `/table` (sin cambios) | sin cambios |

## Validación de formularios

No aplica — FR16 no agrega formularios ni inputs.

## Assumptions & Open Questions

- Open question: confirmar en build-and-test que `steps=true` no infla la
  respuesta de OSRM de forma problemática para ~20 paradas.
