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
5. `NuevaRutaTab` calcula los subtotales de peso/volumen/conteo de las paradas
   con `tipo === 'devolucion'` incluidas y los pasa como props nuevas
   (`devolucionesCount`, `devolucionesPeso`, `devolucionesVolumen`) a
   `ConfiguracionRuta`, que renderiza una línea bajo el `CapacityBar` — "incluye
   {devolucionesPeso} kg · {devolucionesVolumen} m³ de {devolucionesCount}
   devolución/es" — solo si `devolucionesCount > 0`. El componente `CapacityBar`
   NO cambia (sigue genérico).

### W3 — Exclusión por capacidad (FR16.3.1)

1. Durante W2, si `seleccionarPorCapacidad` excluye paradas (BR1.2), aparece el
   aviso de exclusión de FR2.
2. **Cambio de firma requerido:** `optimizarConCapacidad` (`capacity-fit.ts`)
   hoy devuelve `{ orden, excluidosCount: number }` y descarta el array
   `excluidos`. Pasa a devolver `{ orden, excluidos: PedidoSeleccionado[] }`.
   `use-pedidos-ruta.ts` guarda `excluidos` (no solo el conteo) en un estado
   `excluidosPorCapacidad: PedidoSeleccionado[]` y lo expone.
3. `NuevaRutaTab` compone el texto del aviso a partir de `excluidos`, contando
   cuántos son `tipo === 'devolucion'`: p. ej. "2 pedidos de entrega y 1
   devolución no caben en el vehículo… — reasígnalos a otro viaje". Si todos
   son entregas, el texto actual se conserva.
4. Al `<div>` del aviso se le añade `role="status"` (mejora de accesibilidad,
   WCAG 4.1.3); no bloquea.
5. FR16.3.2: si la excluida es una recolección en una parada intermedia, se
   trata igual — se marca excluida, **el sistema no reordena** para hacerla
   caber (eso es FR16.4, fuera de alcance).

## State / transiciones visibles

| Vista | Estados | Transición |
|-------|---------|------------|
| Card de parada | default → (tipo devolucion) borde+badge indigo → (+ excepción) callout amber → (+ fuera de ventana) badge rojo | al resolver `tipo` y estados; nunca se fusionan indigo con rojo/amber |
| Mapa | 1 polilínea teal (0 devoluciones) → N polilíneas teal/indigo (≥1 devolución) + leyenda | al optimizar / cambiar la secuencia |
| Línea de devoluciones (en `ConfiguracionRuta`, bajo `CapacityBar`) | oculta → "incluye N…" | al haber ≥1 devolución en la secuencia (`devolucionesCount > 0`) |

## Assumptions & Open Questions

- [assumption] OSRM `/route?steps=true` devuelve `routes[0].legs[]` con una
  entrada por par de paradas consecutivas; si el servicio no responde, el
  fallback es un segmento recto por leg.
- Open question: si el nº de paradas crece mucho, evaluar si N polilíneas
  impacta el render de Leaflet (se mide en build-and-test).
- [assumption] Cambiar la firma de `optimizarConCapacidad` no rompe a otros
  consumidores: `fleet-split.ts` usa `seleccionarPorCapacidad` (sin cambio) y
  `use-pedidos-anclados.ts` usa `excedeCapacidadAlAnclar` (sin cambio). Solo
  `use-pedidos-ruta.ts` consume `optimizarConCapacidad`.

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-09-01T15:12:09Z
**Iteration:** 2

### Findings

| # | Severidad | Ubicación | Hallazgo | Recomendación |
|---|-----------|-----------|----------|---------------|
| 1 (it.1, Critical) | Resuelto | frontend-components.md — TipoParadaBadge / PedidoCard / ParadaCard | rev 2: el `<span>` con texto visible "Devolución" es el nombre accesible; solo el `<i>` lleva `aria-hidden`; se elimina todo `aria-label` sobre el `<div>` contenedor (los `<div>` de `PedidoCard.tsx` no tienen `role`, un `aria-label` sería ignorado — verificado en el código actual). Desaparece también el riesgo de `": undefined"` por `customer_name` opcional al no componerse ya ningún label. | — |
| 2 (it.1, Major) | Resuelto | functional-spec.md W3 · frontend-components.md — capacity-fit.ts / use-pedidos-ruta.ts / NuevaRutaTab.tsx | rev 2 documenta el cambio de firma: `optimizarConCapacidad` pasa de `{ orden, excluidosCount: number }` a `{ orden, excluidos: PedidoSeleccionado[] }` (el array ya lo produce `seleccionarPorCapacidad`, solo dejaba de propagarse — verificado líneas 32-63 y 82-96 de `capacity-fit.ts`). Único consumidor `use-pedidos-ruta.ts` confirmado: `fleet-split.ts` usa `seleccionarPorCapacidad`, `use-pedidos-anclados.ts` usa `excedeCapacidadAlAnclar`, `page.tsx` solo reenvía la prop. El aviso pasa a `role="status"` y `NuevaRutaTab` compone el texto por tipo con `.filter(p => p.tipo === 'devolucion')`. Implementable sin consultar al arquitecto. | — |
| 3 (it.1, Major) | Resuelto | functional-spec.md W2 paso 5 · frontend-components.md — ConfiguracionRuta.tsx / CapacityBar.tsx | rev 2: `CapacityBar` queda genérico e intacto; la línea "incluye N devoluciones" se traslada a `ConfiguracionRuta`, que recibe 3 props nuevas (`devolucionesCount/Peso/Volumen`) calculadas en `NuevaRutaTab` a partir de `pedidosSeleccionados` — mismo patrón que los `totalWeight`/`totalVolume` ya existentes (verificado líneas 40-41, 71-73 de `NuevaRutaTab.tsx`). Se renderiza solo si `devolucionesCount > 0`. Consistente entre spec, tabla de estados y frontend-components. | — |
| 4 | Minor | page.tsx (fuera del set editado) · frontend-components.md §use-pedidos-ruta.ts / NuevaRutaTab.tsx | El tipo de `excluidosPorCapacidad` cambia de `number` a `PedidoSeleccionado[]`; `page.tsx` (líneas 27, 165) y la interfaz `Props` de `NuevaRutaTab` (línea 27) declaran hoy `number`. El diseño nombra el hook y `NuevaRutaTab` pero no lista el reenvío en `page.tsx` ni la actualización de la interfaz. El compilador TS lo detecta; no bloquea. | Añadir una frase en frontend-components: "actualizar el tipo de la prop en `NuevaRutaTab.Props` y el reenvío en `page.tsx`". |
| 5 | Minor | functional-spec.md W3 paso 4 · tabla de estados | El aviso de exclusión (`role="status"`) y la línea de devoluciones (`aria-live="polite"`) se montan condicionalmente; una región viva montada junto con su contenido puede no anunciarse en algunos lectores de pantalla (debe existir vacía antes y llenarse después). Aceptable para el alcance; verificable en build-and-test. | Registrar como punto de verificación explícito en build-and-test (ya hay una Open Question cercana sobre render). |

### Validation Tool Results

| Herramienta | Resultado | Interpretación |
|-------------|-----------|----------------|
| grep `optimizarConCapacidad` en `src/` | Solo `use-pedidos-ruta.ts` y `capacity-fit.ts` (def.) | Confirma el hallazgo #2: el cambio de firma tiene un único consumidor. `page.tsx` solo aparece por la prop `excluidosPorCapacidad`. |
| Revisión cruzada traceability.json ↔ requirements | upstream_ids resuelven a FR16.x / FR2 / NFR-1..3; FR16.4 y FR16.3.2 marcados N/A / Deferred con justificación | Sin referencias rotas. |
| Lectura de `PedidoCard.tsx` / `CapacityBar.tsx` | `<div>` sin `role`; `CapacityBar` con contrato `value/max/unit` genérico | Confirma la base de los hallazgos #1 y #3 tal como el diseño rev 2 los describe. |

### Summary

Los tres hallazgos de la iteración 1 (1 Critical, 2 Major) están resueltos con evidencia verificable en el código actual: la accesibilidad del badge se apoya en texto visible y no en `aria-label` sobre `<div>` sin rol; el cambio de firma de `optimizarConCapacidad` está documentado, es de un solo consumidor y propaga un array que el algoritmo ya calcula; y la línea de subtotales de devoluciones vive en `ConfiguracionRuta` con props calculadas aguas arriba, dejando `CapacityBar` genérico. Quedan solo 2 hallazgos Minor (tipos de prop a propagar en `page.tsx`/`NuevaRutaTab.Props`, y verificación del anuncio de regiones vivas), ninguno bloqueante. Un desarrollador puede implementar desde este diseño sin guía arquitectónica adicional.

