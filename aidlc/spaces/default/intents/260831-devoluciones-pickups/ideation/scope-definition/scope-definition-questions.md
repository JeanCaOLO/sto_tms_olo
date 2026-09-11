# Scope Definition — Preguntas

Contexto de `../intent-capture/intent-statement.md`,
`../feasibility/feasibility-assessment.md` y `../feasibility/constraint-register.md`.

## Q1. ¿Cuál es el alcance mínimo viable (MVS) que entrega valor?

- A. FR16.1–16.3: incluir las recolecciones conocidas en la secuencia de paradas, marcarlas visualmente distinto y sumarlas al cálculo de capacidad. El planificador deja de coordinar recolecciones por fuera.
- B. Solo FR16.2 (distinción visual) como primer paso.
- C. Todo FR16 incluido el caso "al pie de camión" (FR16.4).
- D. Not yet defined.
- X. Other (please specify)

[Answer]: A. FR16.1–16.3 es el MVS: con eso el planificador arma una ruta que ya contempla las recolecciones conocidas (secuencia + visual + capacidad), que es el dolor principal. FR16.4 no entra al MVS porque depende de OQ-4 y de un flujo de recálculo en vivo que hoy no existe (feasibility: viabilidad MEDIA).

## Q2. ¿Qué capacidades son must-have vs. nice-to-have?

- A. Must-have: FR16.1, FR16.2, FR16.3. Nice-to-have / posterior: FR16.4.
- B. Must-have: todo FR16.
- C. Must-have solo FR16.2 y FR16.3; FR16.1 depende de OQ-4.
- X. Other (please specify)

[Answer]: A. Must-have FR16.1–16.3; FR16.4 (al pie de camión) queda como incremento posterior, explícitamente fuera de este alcance hasta cerrar OQ-4 y la regla de "cabe".

## Q3. ¿Qué dependencias hay entre capacidades?

- A. FR16.2 y FR16.3 son independientes entre sí y del dato de entrada exacto (solo necesitan un flag de tipo + peso/volumen). FR16.1 depende de confirmar la forma del dato de la recolección (parcialmente OQ-4). FR16.4 depende de FR16.1 + OQ-4 + regla de "cabe".
- B. Todas dependen de cerrar OQ-4 primero.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. FR16.2 (visual) y FR16.3 (capacidad) solo necesitan que una parada pueda marcarse como devolución con su peso/volumen — se pueden diseñar sin cerrar OQ-4. FR16.1 (ingesta del dato) necesita confirmar la forma mínima del dato en requirements-analysis. FR16.4 depende de FR16.1 + OQ-4 + regla de "cabe".

## Q4. ¿Preferencia de secuenciación (risk-first, value-first, dependency-first)?

- A. Dependency-first con riesgo diferido: FR16.2 + FR16.3 primero (sin bloqueos), luego FR16.1 (tras confirmar el dato), y FR16.4 fuera de este ciclo.
- B. Value-first: FR16.1 primero porque es el corazón del requerimiento.
- C. Risk-first: atacar FR16.4 primero por ser lo más incierto.
- X. Other (please specify)

[Answer]: A. Dependency-first / riesgo diferido. FR16.2 y FR16.3 no tienen bloqueos y ya dan valor visible; FR16.1 va después de fijar la forma del dato; FR16.4 se saca de este ciclo.

## Q5. ¿Hay fechas límite duras atadas a alguna capacidad?

- A. No — sin fecha límite formal; el ritmo lo marca el cierre de OQ-4 (feasibility).
- B. Sí (especificar en Other).
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. No hay fecha límite dura. FR16.1–16.3 pueden avanzar en cuanto se cierre la forma mínima del dato; FR16.4 espera el sync con Devoluciones.

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en scope-document.md e intent-backlog.md:

- **Dentro del alcance (MVS):** FR16.1 (incluir recolecciones conocidas como paradas), FR16.2 (distinción visual entregas vs. devoluciones en lista y mapa), FR16.3 (sumar volumen/peso de la devolución al bin-packing de capacidad).
- **Fuera del alcance de este ciclo:** FR16.4 (recolección "al pie de camión" / recálculo en vivo) — incremento posterior, depende de OQ-4 y de la regla formal de "cabe".
- **Fuera de alcance (del módulo):** creación de la solicitud de devolución, recepción física en el CD, cita de recepción en andén, reglas de negocio de aceptación del pickup — viven en el futuro módulo de Devoluciones.
- **Backlog priorizado (dependency-first, riesgo diferido):**
  1. FR16.2 — distinción visual (sin bloqueos, valor visible)
  2. FR16.3 — devolución en el cálculo de capacidad (sin bloqueos)
  3. FR16.1 — ingesta de la recolección como parada (tras fijar la forma mínima del dato en requirements-analysis)
  - (fuera de este ciclo) FR16.4
- **Sin fecha límite dura.** El ritmo lo marca el cierre de OQ-4.

- Looks correct
- Request changes

[Answer]: Looks correct
