# Interaction Spec — Devoluciones/Pickups (FR16)

Especificaciones a nivel componente para FR16, sobre `mockups.md` y
`../requirements-analysis/requirements.md`. Formato inspirado en
`.claude/knowledge/aidlc-design-agent/component-spec-template.md`.

## Componente: `TipoParadaBadge` (nuevo componente, dentro de las cards existentes)

- **Propósito:** indicar si una parada es entrega o devolución (FR16.2.1).
- **Anatomía:** ícono (`ri-arrow-go-back-line` para devolución, ninguno o
  ninguno para entrega (caso por defecto)) + texto ("Devolución" / implícito).
- **Estados:** default. No es interactivo (no focusable, no hover).
- **Tokens:** devolución → `text-indigo-700 bg-indigo-100` (borde-izq de la card: `border-indigo-500`).
- **Accesibilidad:** el badge es decorativo (`aria-hidden`); el tipo se
  comunica al lector de pantalla vía `aria-label` en el contenedor de la card
  ("Parada de devolución: Ferretería Grecia").

## Componente: `PedidoCard` / `ParadaCard` (modificados)

- **Cambio:** borde izquierdo (`border-l-4 border-indigo-500`) cuando
  `pedido.tipo === 'devolucion'`; badge de tipo en la cabecera.
- **Estado "excluido":** sin cambios respecto a hoy (opacidad reducida + `⚠`).
- **Estado "excepción":** el callout amber de `exception_address_raw` (ya
  existe) convive con el borde indigo; son elementos distintos (chip vs. borde).
- **Interacción:** el botón "Excluir de ruta" no cambia.

## Componente: mapa (modificado)

- **Pines:** color por tipo — `teal` entrega (actual), `indigo` devolución.
- **Polilíneas:** el trazo de la ruta se segmenta por par de paradas
  consecutivas; cada segmento toma `teal` (sólido) si ambos extremos son
  entregas, `indigo-600` + discontinuo (`dashArray:"6 6"`) si alguno es una devolución. El trazado deja de ser una `<Polyline>` única y pasa a N (una por leg).
- **Leyenda:** control fijo abajo-izquierda, 2 filas (entrega / devolución)
  con muestra (línea sólida teal / discontinua indigo) + etiqueta.
- **Estado 0 devoluciones:** el mapa se comporta como hoy (una sola clase de
  pin y de trazo); la leyenda muestra solo "entrega" o se oculta.

## Componente: `CapacityBar` (modificado)

- **Cambio:** cuando hay ≥1 devolución en la secuencia, una línea secundaria
  bajo las barras: "incluye {peso} · {volumen} de {n} devolución/es".
- **Sin devoluciones:** la línea no se renderiza (estado idéntico a hoy).
- **Exclusión por capacidad:** reutiliza el `role="status"` de FR2; el texto
  puede nombrar el tipo ("1 devolución excluida por capacidad" /
  "1 pedido de entrega excluido por capacidad").

## Transiciones de estado visibles

| De | A | Disparador | Feedback |
|----|---|-----------|----------|
| Viaje sin seleccionar | Poblado | seleccionar viaje | render de cards con su tipo ya resuelto |
| Poblado | Secuencia optimizada | "Optimizar paradas" | reordena la lista; el mapa dibuja polilíneas segmentadas |
| Cabe todo | Exclusión | recalculo de capacidad | `⚠` de FR2 + card atenuada |

## Assumptions & Open Questions

- Open question: partir la geometría OSRM (`route-geometry.ts` → `obtenerGeometriaRuta`) en legs, o usar segmentos rectos por leg como overlay. Se cierra en functional-design.
