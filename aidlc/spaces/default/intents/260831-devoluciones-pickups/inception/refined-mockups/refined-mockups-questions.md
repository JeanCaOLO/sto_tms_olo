# Refined Mockups — Preguntas

Contexto: `../../ideation/rough-mockups/wireframes.md`,
`../../ideation/rough-mockups/user-flow.md`,
`../requirements-analysis/requirements.md`, y la UI actual del módulo
(`src/pages/planificacion/`, `src/components/base/`).

## Q1. Color de acento para devoluciones

- A. Rojo/rose (`rose-500` / `red-500`). El usuario lo probó en un prototipo ("ya era la devolución… rojito"); `requirements.md` FR16.2 admite "azul o rojo". Se reserva solo para el tipo devolución; el amber sigue siendo "fuera de ventana"/"excepción".
- B. Azul/índigo (`indigo-600`).
- C. Otro.
- X. Other (please specify)

[Answer]: A. Rojo/rose (`rose-600` para texto/borde, `rose-50` para fondo del badge). Es lo que el usuario ya asoció con devolución. El amber queda para excepción/fuera de ventana; verde/emerald para tramos de entrega en el mapa.

## Q2. ¿Qué patrones de interacción se necesitan?

- A. Ninguno nuevo. Se reutilizan las cards, la lista de paradas, el modal de ruta y la barra de capacidad que ya existen; solo cambian estilos y se agrega un badge/ícono.
- B. Un modal nuevo para gestionar devoluciones.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Sin patrones nuevos. Badge + ícono en `PedidoCard`/`ParadaCard`, leyenda en el mapa, nota en `CapacityBar`. Cero componentes nuevos.

## Q3. ¿Qué estados debe manejar cada pantalla? (los 3 Major de rough-mockups)

- A. Todos: viaje sin seleccionar (comportamiento actual), viaje con cero devoluciones (idéntico a hoy, sin leyenda de devolución ni nota de capacidad), caso poblado, devolución excluida por capacidad, devolución sin coordenadas (excepción), devolución + fuera de ventana.
- B. Solo el caso poblado.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Se documentan los 6 estados. Regla índigo/rose + amber: **el acento de tipo (rose) manda en el borde izquierdo y el badge; el estado (amber "fuera de ventana" / excepción) se muestra como chip aparte a la derecha**. Nunca se mezclan en el mismo elemento.

## Q4. ¿El diseño se alinea con el design system existente?

- A. Sí — Tailwind, tokens de `src/components/base/`, `CapacityBar`, `PedidoCard`, `ParadaCard`. Se agrega un único token de color (`rose`) al mapa mental de acentos; no se toca la paleta base.
- B. Requiere componentes nuevos en el design system.
- X. Other (please specify)

[Answer]: A. Alineado; solo se formaliza `rose` como acento de "devolución" en el design-system-mapping.

## Q5. ¿Accesibilidad y responsive?

- A. WCAG 2.1 AA. Distinción no-solo-color (ícono `ri-arrow-go-back-line` + texto "Devolución"). Contraste AA: `rose-600` sobre `white`/`rose-50` cumple. Navegación por teclado y `aria-label` de tipo en cada parada. Responsive: el de la página actual (desktop-first); sin breakpoints nuevos.
- B. Otro nivel de accesibilidad.
- X. Other (please specify)

[Answer]: A. WCAG 2.1 AA, sin breakpoints nuevos.

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en mockups.md, interaction-spec.md, design-system-mapping.md y accessibility-checklist.md (rev 2, tras el Request Changes):

- **Color de devolución = `indigo`** (`indigo-700` texto/ícono, `indigo-100` fondo badge, `indigo-500` borde-izq, `indigo-600` pin del mapa). Verificado contra el código: `rojo` ya es "fuera de ventana", `amber` es "anclado"/"excepción", así que el acento de tipo tiene que ser un color libre.
- **Tramos del mapa:** entrega = `teal` sólido (color de ruta actual); recolección = `indigo` discontinuo (`dashArray:"6 6"`). Se descarta `emerald` (era un segundo verde). La `<Polyline>` única pasa a N (una por leg) + leyenda.
- **Componente nuevo = `TipoParadaBadge`** (no `StopBadge`, ya existe): badge indigo + ícono `ri-arrow-go-back-line` + etiqueta "Devolución".
- **Regla tipo+estado:** el tipo (indigo) va en el borde izquierdo y el badge; el estado (badges existentes: amber "anclado", rojo "fuera de ventana", gris "excepción") va aparte. Nunca se fusionan.
- **6 estados documentados:** viaje sin seleccionar, cero devoluciones (= comportamiento actual), poblado, devolución excluida por capacidad, devolución sin coordenadas (excepción), devolución + fuera de ventana.
- **Accesibilidad:** WCAG 2.1 AA; distinción no-solo-color (ícono + texto + línea discontinua en el mapa); contraste `indigo-700/indigo-100` ≈ 7:1 (AA); `aria-label` de tipo por parada; navegable por teclado.
- **Sin breakpoints nuevos.** Los 3 Major de rough-mockups (outline de IA, estados vacíos, regla tipo+estado) quedan resueltos.

- Looks correct
- Request changes

[Answer]: Looks correct
