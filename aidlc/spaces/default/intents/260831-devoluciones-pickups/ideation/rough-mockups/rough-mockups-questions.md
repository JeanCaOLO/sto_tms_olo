# Rough Mockups — Preguntas

Contexto de `../intent-capture/intent-statement.md`,
`../scope-definition/scope-document.md`, `../scope-definition/intent-backlog.md`
y de la UI existente del módulo de Planificación (`src/pages/planificacion/`).

## Q1. ¿Cuáles son las pantallas/vistas clave que toca FR16?

- A. Las que ya existen en la página de Planificación: panel de pedidos/paradas (izquierda), lista de paradas de la ruta en construcción (derecha), el mapa, y la barra de capacidad del vehículo. FR16 no agrega pantallas nuevas.
- B. Se necesita una pantalla nueva dedicada a devoluciones.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. FR16 no agrega pantallas: cambia cómo se ven las paradas de devolución dentro de las vistas que ya existen (`PedidoCard`, `ParadaCard`, mapa, `CapacityBar`).

## Q2. ¿Cuál es el flujo principal (happy path)?

- A. El planificador selecciona un viaje → ve entregas y devoluciones mezcladas en el panel, distinguibles a simple vista → optimiza paradas → la devolución queda como una parada más en la secuencia → si su peso/volumen no cabe, aparece el mismo aviso de exclusión por capacidad que ya usa FR2.
- B. El planificador agrega manualmente cada devolución.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Es el flujo actual con las devoluciones ya incluidas; el planificador no hace un paso extra para las recolecciones conocidas.

## Q3. ¿Cómo se distingue visualmente una devolución de una entrega?

- A. Color + ícono + etiqueta. Entregas: estilo actual (neutro/teal). Devoluciones: un color de acento distinto y reservado (p. ej. azul/índigo), un ícono de "flecha hacia el CD" y una etiqueta "Devolución". Nunca solo por color (accesibilidad).
- B. Solo por color.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Color + ícono + texto. El amber ya está tomado por "fuera de ventana"/"excepción", así que devoluciones usan un acento propio (azul/índigo) más ícono y etiqueta. El color exacto lo afina refined-mockups.

## Q4. ¿Hay guía de marca / design system / patrones a seguir?

- A. Sí — la app usa Tailwind con acento teal, amber para avisos, slate para texto; componentes base en `src/components/base/`. FR16 reutiliza esos tokens y componentes.
- B. No hay guía; diseñar desde cero.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Se reutiliza el design system actual (Tailwind, `src/components/base/`, `CapacityBar`, cards existentes).

## Q5. ¿Qué dispositivos / factores de forma hay que soportar?

- A. Desktop (uso de escritorio del planificador), responsive como ya lo es la página hoy. No hay caso móvil para el planificador en este ciclo.
- B. Móvil primero.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Desktop, con el responsive que ya tiene la página. (El caso móvil sería del conductor en FR16.4, que está fuera de este ciclo.)

## Q6. ¿Requisitos de accesibilidad conocidos?

- A. WCAG 2.1 AA como línea base (ya es la práctica: la suite e2e reciente verifica labels asociados). La distinción de devolución no puede depender solo del color; contraste AA en los acentos.
- B. Sin requisitos de accesibilidad.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. WCAG 2.1 AA. Distinción no-solo-color (ícono + etiqueta), contraste AA, navegable por teclado como el resto de la página.

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en wireframes.md y user-flow.md:

- **Sin pantallas nuevas.** FR16 cambia cómo se ven las paradas de devolución dentro de las vistas actuales de Planificación: panel de pedidos/paradas, lista de paradas de la ruta, mapa y barra de capacidad.
- **Distinción visual (FR16.2):** color de acento propio para devoluciones (azul/índigo — el amber ya está tomado por "fuera de ventana"/"excepción") + ícono + etiqueta "Devolución". Nunca solo color.
- **Flujo (happy path):** seleccionar viaje → ver entregas y devoluciones mezcladas y distinguibles → optimizar → la devolución queda como parada más en la secuencia → si no cabe, mismo aviso de exclusión por capacidad que FR2.
- **Capacidad (FR16.3):** la barra `CapacityBar` cuenta la devolución igual que un pedido de entrega; si excede, aviso de exclusión.
- **Design system:** reutiliza Tailwind + componentes base actuales; nada nuevo.
- **Accesibilidad:** WCAG 2.1 AA, distinción no-solo-color, contraste AA, navegable por teclado.
- Wireframes en ASCII (lista de paradas, card de devolución, mapa, barra de capacidad) + diagrama de flujo.

- Looks correct
- Request changes

[Answer]: Looks correct
