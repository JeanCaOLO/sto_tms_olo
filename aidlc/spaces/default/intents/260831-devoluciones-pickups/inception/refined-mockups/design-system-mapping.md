# Design System Mapping — Devoluciones/Pickups (FR16) — rev 2

Cómo FR16 se apoya en el design system existente. Verificado contra el código
(`src/components/base/Badge.tsx`, `src/pages/planificacion/components/`).

## Paleta actual (no se toca)

| Token | Semántica | Fijado en |
|-------|-----------|-----------|
| `teal` | acento primario | StopBadge, mapa, botones |
| `red` | fuera de ventana | `Badge variant="danger"` |
| `amber` | anclado / callout de excepción | `Badge variant="warning"` |
| `emerald` | "En ruta" | `Badge variant="success"` |
| `slate` | neutro / "Excepción" / "Excluido" | `Badge variant="default"` |
| `teal` | "info" | `Badge variant="info"` |

## Token nuevo: `indigo` = "devolución" (tipo de parada)

- **Único** token de color nuevo. No se agrega `emerald` como segundo verde (la
  rev 1 lo hacía; corregido).
- Valores: `indigo-700` (texto/ícono), `indigo-100` (fondo badge), `indigo-500`
  (borde-izq de card), `indigo-600` (#4f46e5, pin del mapa y color de leg).
- Opción A (mínima): clases inline en las cards + un helper `tipoParadaClasses()`.
- Opción B: agregar `variant="devolucion"` a `components/base/Badge.tsx`
  (`indigo-100 text-indigo-700`) — preferible si el badge se usa en >1 sitio.
  Decisión en code-generation.

## Componentes

| Componente | Archivo | Cambio |
|-----------|---------|--------|
| `TipoParadaBadge` (**nuevo**) | `src/pages/planificacion/components/TipoParadaBadge.tsx` | ~15 líneas; `tipo: 'entrega' \| 'devolucion'`; devolución → badge indigo + ícono `ri-arrow-go-back-line`. Nombre distinto de `StopBadge`. |
| `ParadaCard` | `.../components/ParadaCard.tsx` | `border-l-4 border-indigo-500` si `pedido.tipo === 'devolucion'`; `<TipoParadaBadge>` en la cabecera junto al badge de "Fuera de ventana". |
| `PedidoCard` | `.../components/PedidoCard.tsx` | igual; el `border-l-4` indigo es independiente del `border-amber-300` de "anclado". |
| `RutaMapaPreview` | `.../components/RutaMapaPreview.tsx` | `iconoParada` toma color por tipo; la `<Polyline>` única pasa a N `<Polyline>` (una por leg) con `pathOptions` por tipo (teal sólido / indigo `dashArray:"6 6"`); nueva `<Leyenda>` como control. |
| barra de capacidad | (en `ConfiguracionRuta.tsx`) | línea secundaria condicional "incluye N de devoluciones". |

## Iconografía

Remix Icon (ya en uso): `ri-arrow-go-back-line` (devolución). Entrega sin ícono
de tipo (caso por defecto).

## Responsive

Sin breakpoints nuevos.

## Assumptions & Open Questions

- Open question (code-generation): `TipoParadaBadge` local a Planificación, o
  variante de `Badge` base. Depende de si se reutiliza fuera del módulo.
