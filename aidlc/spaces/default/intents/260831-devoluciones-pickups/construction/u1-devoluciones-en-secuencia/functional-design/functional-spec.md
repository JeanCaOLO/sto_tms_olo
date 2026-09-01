# Functional Spec — U1 (u1-devoluciones-en-secuencia)

Unidad `ui`. Deriva de `../../../inception/requirements-analysis/requirements.md`
(FR16.1–16.3), `../../../inception/units-generation/unit-of-work.md` y
`../../../inception/domain-design/components.md`. Autocontenido: sin
`entities.md`/`rules.md` — el modelo de datos es un atributo opcional sobre un
tipo existente y las reglas van en este archivo.

## Modelo de datos (delta)

`src/pages/planificacion/types.ts` → interfaz `Pedido`:

```ts
tipo?: 'entrega' | 'devolucion';   // ausente ⇒ 'entrega' (retro-compatible)
```

Se hereda en `PedidoSeleccionado` y `Pedido` de `fallback-viajes.ts`. Ningún
otro campo cambia (BR1.1). La semántica de `delivery_address` /
`total_weight` / `total_volume` se invierte para `devolucion` (recogida / carga
entrante) — ver `../../../inception/domain-design/decisions.md` ADR-1.

## Business Rules

```yaml
rules:
  - id: BR1.1
    statement: Una parada sin atributo `tipo` se trata como entrega.
    category: validation
    applies_to: Pedido / PedidoSeleccionado
    trigger: Al leer una parada de un viaje o del mock.
    logic: SI pedido.tipo es undefined ENTONCES tratar como 'entrega'.
    violation: N/A (default seguro, no hay violación).
    source: FR16.1.1
  - id: BR1.2
    statement: El peso y volumen de una devolución conocida cuentan en la capacidad del vehículo igual que un pedido de entrega.
    category: calculation
    applies_to: capacity-fit.ts (seleccionarPorCapacidad, optimizarConCapacidad)
    trigger: Al ejecutar el bin-packing de una ruta.
    logic: SE suma total_weight y total_volume de TODA parada incluida, sin distinguir tipo. Una devolución puede quedar excluida o forzar la exclusión de otra parada.
    violation: Si se omitiera una devolución del cálculo, el vehículo podría exceder su capacidad real.
    source: FR16.3, FR16.3.1
  - id: BR1.3
    statement: Un tramo (leg) de la ruta es "de recolección" si su parada de origen o su parada de destino es una devolución.
    category: policy
    applies_to: route-geometry.ts (geometría por leg), RutaMapaPreview.tsx
    trigger: Al renderizar las polilíneas del mapa.
    logic: PARA cada par de paradas consecutivas (i, i+1) — SI paradas[i].tipo === 'devolucion' O paradas[i+1].tipo === 'devolucion' ENTONCES el leg se pinta indigo discontinuo; SINO teal sólido.
    violation: Un leg mal clasificado confunde al planificador sobre dónde hay una recogida.
    source: FR16.2.2
  - id: BR1.4
    statement: La distinción entre entrega y devolución nunca depende solo del color.
    category: constraint
    applies_to: PedidoCard, ParadaCard, TipoParadaBadge, RutaMapaPreview (leyenda + patrón de línea)
    trigger: Al renderizar cualquier vista que muestre el tipo.
    logic: TODA indicación de tipo devolución lleva, además del color, un ícono (`ri-arrow-go-back-line`) y texto ("Devolución"); los legs del mapa llevan además un patrón de línea (discontinuo).
    violation: Incumple WCAG 2.1 AA 1.4.1 (uso del color).
    source: NFR-3, FR16.2.1
```

### Rules summary (derivado)

| ID | Regla | Categoría | Fuente |
|----|-------|-----------|--------|
| BR1.1 | Sin `tipo` ⇒ entrega | validation | FR16.1.1 |
| BR1.2 | Devolución cuenta en capacidad como entrega | calculation | FR16.3, FR16.3.1 |
| BR1.3 | Leg "de recolección" si un extremo es devolución | policy | FR16.2.2 |
| BR1.4 | Distinción nunca solo por color | constraint | NFR-3, FR16.2.1 |

## Workflows

### W1 — Seleccionar viaje y ver las paradas con su tipo (FR16.1)

1. El planificador selecciona un viaje en el dropdown "Viaje (WMS)".
2. `ViajesAdapter` (`viajes-api.ts` / `fallback-viajes.ts`) devuelve las
   paradas del viaje, cada una con su `tipo` (BR1.1 para las que no lo traen).
3. `PlanificacionUI` renderiza cada `PedidoCard`: las de `devolucion` con borde
   izquierdo indigo + `<TipoParadaBadge tipo="devolucion" />`.
4. Estado "0 devoluciones": ninguna card lleva indigo; sin cambios respecto a hoy.

### W2 — Optimizar y ver la secuencia con devoluciones y el mapa coloreado (FR16.1, FR16.2, FR16.3)

1. El planificador pulsa "Optimizar paradas".
2. `CapacidadVehiculo` (`optimizarConCapacidad`) ejecuta el bin-packing
   (BR1.2) y llama a `SecuenciaParadas` (`optimize-stops.ts`, sin cambios) para
   ordenar el subconjunto incluido.
3. La lista de paradas se re-renderiza con las devoluciones intercaladas
   (marcadas por tipo).
4. `GeometriaRuta` (`route-geometry.ts`) devuelve la geometría por leg;
   `RutaMapaPreview` dibuja una `<Polyline>` por leg aplicando BR1.3, más los
   pines por tipo y la leyenda.
5. `CapacityBar` muestra la línea "incluye {peso} · {volumen} de {n}
   devoluciones" si hay ≥1 devolución en la secuencia.

### W3 — Exclusión por capacidad (FR16.3.1)

1. Durante W2, si `seleccionarPorCapacidad` excluye una o más paradas
   (BR1.2), aparece el aviso `role="status"` existente de FR2.
2. El texto del aviso nombra el tipo cuando es relevante: "1 devolución
   excluida por capacidad" / "1 pedido de entrega excluido por capacidad".
3. FR16.3.2: si la excluida es una recolección en una parada intermedia, se
   trata igual — se marca excluida, **el sistema no reordena** para hacerla
   caber (eso es FR16.4, fuera de alcance).

## State / transiciones visibles

| Vista | Estados | Transición |
|-------|---------|------------|
| Card de parada | default → (tipo devolucion) borde+badge indigo → (+ excepción) callout amber → (+ fuera de ventana) badge rojo | al resolver `tipo` y estados; nunca se fusionan indigo con rojo/amber |
| Mapa | 1 polilínea teal (0 devoluciones) → N polilíneas teal/indigo (≥1 devolución) + leyenda | al optimizar / cambiar la secuencia |
| CapacityBar | sin línea de devoluciones → con línea "incluye N…" | al haber ≥1 devolución incluida |

## Assumptions & Open Questions

- [assumption] OSRM `/route?steps=true` devuelve `routes[0].legs[]` con una
  entrada por par de paradas consecutivas; si el servicio no responde, el
  fallback es un segmento recto por leg.
- Open question: si el nº de paradas crece mucho, evaluar si N polilíneas
  impacta el render de Leaflet (se mide en build-and-test).
