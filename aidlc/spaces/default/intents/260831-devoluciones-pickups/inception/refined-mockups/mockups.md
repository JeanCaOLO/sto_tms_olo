# Mockups (media-alta fidelidad) — Devoluciones/Pickups (FR16)

Evoluciona `../../ideation/rough-mockups/wireframes.md` y
`../../ideation/rough-mockups/user-flow.md` con las reglas de
`../requirements-analysis/requirements.md`. Sin pantallas nuevas: son cambios
sobre `PedidoCard.tsx`, `ParadaCard.tsx`, `RutaMapaPreview.tsx` y la barra de
capacidad de `src/pages/planificacion/`.

> **rev 2** — corrige la colisión de color de la rev 1: se verificó contra el
> código real (`ParadaCard.tsx`, `PedidoCard.tsx`, `RutaMapaPreview.tsx`,
> `components/base/Badge.tsx`).

## Colores YA en uso en el módulo (verificado en código)

| Color | Semántica actual | Dónde |
|-------|------------------|-------|
| `teal` (#0d9488) | acento primario | StopBadge, pin del mapa, polilínea de ruta, botón "incluir", hover |
| `red` | **fuera de ventana** | `ParadaCard` borde/texto/`Badge variant="danger"`; botón "excluir" |
| `amber` | **anclado** + **callout de excepción** | `PedidoCard` borde/`Badge variant="warning"`; callout `exception_address_raw` en ambas cards |
| `emerald` | `Badge variant="success"` ("En ruta") | PedidoCard |
| `slate` | neutro / atenuado | textos, `Badge variant="default"` ("Excepción", "Excluido") |

**Conclusión:** rojo y amber están tomados por estados. El acento de tipo
"devolución" tiene que ser un color libre → **`indigo`**.

## Arquitectura de información (resuelve rough-mockups Major #1)

Layout de la página sin cambios (2 columnas + mapa):

```
+-------------------+---------------------------+
| Panel de pedidos  | Panel de ruta en          |
| (PedidoCard[])    | construcción (ParadaCard[])|
|                   +---------------------------+
|                   | Mapa (RutaMapaPreview)    |
|                   +---------------------------+
|                   | CapacityBar + Config ruta |
+-------------------+---------------------------+
```

Orden de lectura dentro de cada card/fila:
1. **Tipo** (entrega / devolución) — borde izquierdo indigo + badge indigo. Nuevo nivel, va primero.
2. **Estado** (anclado amber / fuera de ventana red / excepción) — badges existentes, sin cambios.
3. Cliente → dirección → peso/volumen → ETA → acciones.

## Convención de color (rev 2)

| Rol | Token | Uso | Contraste |
|-----|-------|-----|-----------|
| Devolución — tipo | `indigo-700` texto/ícono, `indigo-100` fondo badge, `indigo-500` borde-izq | badge "Devolución", `border-l-4` de card/fila | `indigo-700` (#4338ca) sobre `indigo-100` (#e0e7ff) ≈ 7:1 → **AA** |
| Devolución — pin del mapa | `indigo-600` (#4f46e5) | `divIcon` del marcador | sobre blanco ≈ 6.3:1 |
| Tramo de ruta — entrega | `teal` (#0d9488, actual) + línea **sólida** | `Polyline` de leg entre entregas | — |
| Tramo de ruta — recolección | `indigo-600` + línea **discontinua** (`dashArray: "6 6"`) | `Polyline` de leg que toca una devolución | patrón, no solo color |
| Estados (anclado / fuera de ventana / excepción) | sin cambios | badges existentes | — |

Regla tipo+estado (resuelve rough-mockups Major #3, rev 2): el **tipo** vive en
el `border-l-4` + el badge indigo; el **estado** vive en los badges existentes
(amber/red/gris). Son elementos distintos en la misma cabecera de card; nunca
se fusiona un color de tipo con uno de estado.

## Componente nuevo: `TipoParadaBadge` (no `StopBadge`, ese nombre está tomado)

```
<TipoParadaBadge tipo="devolucion" />
=>  [ ↩ Devolución ]   (indigo-700 sobre indigo-100, ícono ri-arrow-go-back-line)
```

Entregas: sin badge (es el caso por defecto), o `<TipoParadaBadge tipo="entrega" />`
opcional si se quiere simetría explícita.

## Pantalla — Card de parada de devolución (`ParadaCard`)

```
+--||-------------------------------------------------+
|  ||  #3  [↩ Devolución]  ⏱9:05  [Fuera de ventana]  |   borde-l indigo + badges: tipo(indigo) / estado(red)
|  ||  ORD-MOCK-014                                    |
|  ||  Ferretería Grecia                               |
|  ||  Av. 2, contiguo al parque central, Grecia       |
|  ||  Zona: Rural Norte                               |
|  ||  150 kg   ·   2,2 m³                             |
+--||-------------------------------------------------+
   ^^ border-l-4 border-indigo-500 (reemplaza/convive con border-red-300 si además outside_window)
```

<!-- Text fallback: tarjeta de parada de la ruta. Borde izquierdo indigo = tipo
devolución. En la cabecera: número de parada, badge "Devolución" (indigo, ícono
flecha-retorno), ETA, y si aplica el badge rojo "Fuera de ventana" que ya
existe. El resto (cliente, dirección, zona, peso, volumen) sin cambios. La card
de entrega es idéntica sin el borde ni el badge indigo. Cuando una devolución
está además fuera de ventana: el borde izquierdo es indigo (tipo) y el badge
rojo aparece aparte (estado) — no se mezclan. -->

## Pantalla — Card de pedido (`PedidoCard`, panel izquierdo)

Igual: badge `TipoParadaBadge` indigo junto a los badges existentes (Anclado,
Excepción, En ruta / Excluido). Borde izquierdo indigo cuando
`pedido.tipo === 'devolucion'`, sin pisar el `border-amber-300` de "anclado"
(si ambos: borde amber del contenedor + acento indigo se resuelve con un
`border-l-4` independiente del `border` del contenedor).

## Pantalla — Mapa (`RutaMapaPreview`)

- **Pines:** `divIcon` teal para entrega (actual); `divIcon` indigo para
  devolución.
- **Trazado:** hoy es **una** `<Polyline positions={linea}>`. Rev 2: se
  reemplaza por **una polilínea por leg** (par de paradas consecutivas), cada
  una con `pathOptions` propio:
  - leg entre dos entregas → `{ color: '#0d9488', weight: 3, opacity: 0.7 }` (sólido)
  - leg que toca una devolución → `{ color: '#4f46e5', weight: 3, opacity: 0.8, dashArray: '6 6' }` (discontinuo)
  - Las coordenadas de cada leg salen de partir la geometría de
    `obtenerGeometriaRuta` en los índices de parada, o —si eso resulta caro—
    de un segmento recto por leg como overlay sobre la geometría base. El
    approach exacto se cierra en functional-design (ver Open Questions).
- **Leyenda:** control fijo abajo-izquierda del mapa, 2 filas: "— entrega
  (teal)", "-- recolección (indigo)".
- **0 devoluciones:** el mapa se comporta como hoy (una polilínea teal, pines
  teal, sin leyenda).

## Pantalla — Barra de capacidad

```
Peso     [██████████        75%] 2 550 / 3 400 kg
Volumen  [████████████      92%] 16,5 / 18,0 m³
         └ incluye 360 kg · 3,4 m³ de 2 devoluciones      (solo si hay devoluciones)

⚠ 1 pedido de entrega excluido por capacidad     (role=status, patrón FR2)
```

## Estados por pantalla (resuelve rough-mockups Major #2)

| Estado | Comportamiento |
|--------|----------------|
| Viaje sin seleccionar | Igual que hoy: paneles con su mensaje vacío actual. |
| Viaje con 0 devoluciones | Idéntico a hoy: sin badge/borde indigo, sin leyenda en el mapa, sin la línea "incluye N de devoluciones" en `CapacityBar`. |
| Poblado (entregas + devoluciones) | Como arriba. |
| Devolución excluida por capacidad | Card atenuada + `⚠` de FR2, igual que un pedido de entrega excluido. El texto del aviso puede nombrar el tipo. |
| Devolución sin coordenadas (excepción) | Borde izquierdo indigo (tipo) + badge gris "Excepción" + callout amber `exception_address_raw` (todo ya existente). Queda fuera de la optimización, como hoy. |
| Devolución + fuera de ventana | Borde izquierdo indigo (tipo) + badge rojo "Fuera de ventana" (estado). Separados. |

## Trazabilidad pantalla → requisito

| Pantalla / cambio | FR |
|-------------------|-----|
| Card con badge/borde indigo + `TipoParadaBadge` | FR16.2.1 |
| Legs del mapa por color + patrón; leyenda | FR16.2.2 |
| Regla tipo(indigo)+estado(badges) separados | FR16.2.3 |
| Devolución en la lista de paradas / secuencia | FR16.1 |
| Línea "incluye N de devoluciones" + aviso de exclusión | FR16.3 / FR16.3.1 |

## Assumptions & Open Questions

- Open question (functional-design): cómo partir la geometría de OSRM
  (`obtenerGeometriaRuta` en `route-geometry.ts`) en legs sin degradar
  rendimiento — o si se acepta un overlay de segmentos rectos por leg. Esto
  aterriza FR16.2.2.
- [assumption] `indigo-700/100` pasa contraste AA (confirmado con valores
  Tailwind en `accessibility-checklist.md`).

## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-09-01T14:28:16Z
**Iteration:** 2
**Clase:** ADVISORY (pase único; los hallazgos van al humano en el gate, sin ciclo de corrección)

### Verificación de la rev 1 (bloqueante anterior)

| Cambio rev 2 | Estado | Evidencia |
|---|---|---|
| Acento devolución rose→indigo | Resuelto | `grep -i "indigo\|rose"` sobre `src/` = 0 coincidencias; `indigo` está genuinamente libre. `red`/`amber`/`emerald`/`teal`/`slate` confirmados en `Badge.tsx` y `ParadaCard.tsx`. |
| Legs del mapa = N `<Polyline>` (teal sólido / indigo discontinuo) + leyenda | Resuelto | Consistente en `mockups.md`, `interaction-spec.md`, `design-system-mapping.md`. Hoy es una sola `<Polyline positions={linea}>` con `#0d9488` (verificado en `RutaMapaPreview.tsx:103`); el rediseño lo reconoce. |
| Diferenciador no-color para legs = `dashArray:"6 6"` firme | Resuelto | `accessibility-checklist.md` lo marca "decisión firme, no condicional". |
| Contraste indigo-700/indigo-100 ≈ 7:1 | Resuelto (estimado) | Coherente con el patrón `text-700 / bg-100` de `Badge.tsx`; ratio autoconfirmado como estimado, tool-check diferido a implementación (aceptable en pase advisory). |
| Sin segundo verde (emerald descartado) | Resuelto | `design-system-mapping.md`: "No se agrega `emerald` como segundo verde". Legs de entrega usan `teal` (color de ruta ya existente). |
| `TipoParadaBadge` (no `StopBadge`) | Resuelto | `StopBadge.tsx` es el badge numérico de parada; el nombre nuevo no colisiona. |
| Tabla pantalla→FR | Resuelto | Presente en `mockups.md` § "Trazabilidad pantalla → requisito". |

El bloqueante de la rev 1 (colisión de color) está genuinamente cerrado.

### Findings

| # | Severidad | Ubicación | Hallazgo | Recomendación |
|---|---|---|---|---|
| 1 | Major | `refined-mockups-questions.md` Q1/Q3/Q4/Q5 + Consolidated Summary | El registro de decisiones NO se actualizó tras el Request Changes. Q1 sigue con `[Answer]: A. Rojo/rose`, y el resumen confirmado por el humano dice `emerald = entrega, rose = recolección`. El artefacto primario (rev 2, indigo) ahora contradice su propia fuente. Un lector que audite la trazabilidad verá un conflicto sin explicación. | Reconciliar el Q&A: dejar constancia de que Q1 se resolvió a `indigo` por el Request Changes de la rev 1, o anexar una nota de corrección. No bloquea la implementación (el humano dirigió el cambio), pero la cadena de trazabilidad queda rota. |
| 2 | Minor | `requirements.md` FR16.2.2 vs `mockups.md` § Convención de color | FR16.2.2 dice literalmente "verde = tramo de entrega"; el mockup usa `teal` para los legs de entrega. Es una desviación razonable (teal es el color de ruta ya existente en `RutaMapaPreview.tsx`; introducir verde sería un color nuevo y chocaría con `emerald`), pero el mockup no la declara como desviación del texto del requisito. | Añadir una línea en `mockups.md` que note "FR16.2.2 dice 'verde'; se usa `teal` por ser el color de ruta ya establecido" — o pedir ajuste del wording de FR16.2.2 en la próxima pasada de requisitos. |
| 3 | Minor | `mockups.md` / `interaction-spec.md` § Open Questions | El método para partir la geometría OSRM en legs queda abierto para functional-design. El criterio de aceptación FR16.2.2 ("cada tramo de devolución se distingue") sí es satisfacible a nivel mockup, pero el enfoque de implementación (split de geometría vs. overlay de segmentos rectos) tiene impacto visual real (un segmento recto no sigue la calle). | Sin acción ahora; asegurar que functional-design cierre esta decisión y que el humano sepa que el trazado exacto de los legs de recolección aún puede cambiar. |
| 4 | Minor | `design-system-mapping.md` § Token nuevo / `interaction-spec.md` | Dos decisiones de componente abiertas (`TipoParadaBadge` local vs. `variant="devolucion"` en `Badge` base; clases inline vs. helper). Diferidas explícitamente a code-generation. | Aceptable como diferimiento; solo confirmar que no bloquea delivery-planning. |

### Summary

La rev 2 resuelve el bloqueante de color de la rev 1 de forma verificable: `indigo` está libre en todo `src/`, el diferenciador no-color de los legs del mapa es firme (`dashArray`), no se introduce un segundo verde y `TipoParadaBadge` no colisiona con `StopBadge`. Los cuatro documentos son internamente consistentes y trazan a FR16.1–16.3. El punto que el humano debería sopesar en el gate es el hallazgo #1: el archivo de preguntas quedó desincronizado y todavía registra `rose`, de modo que el registro de decisiones contradice el artefacto entregado. El resto son menores y correctamente diferidos.

