# Intent Capture & Framing — Preguntas

## Sources

- [desc] Initial description: "Incorporar devoluciones/pickups a la secuencia de paradas del módulo de Planificación de Rutas (FR16 de aidlc/spaces/default/intents/260825-route-planning-reqs/inception/requirements-analysis/requirements.md): incluir recolecciones ya conocidas al generar la secuencia, marcarlas visualmente distinto de las entregas, sumarlas al cálculo de capacidad, y soportar el caso 'al pie de camión' (recolección no planificada que surge en vivo, requiere recalcular). Proyecto brownfield sto_tms_olo, conversación en español. Es una iniciativa nueva sobre un módulo ya construido, no reconstruir Planificación desde cero, solo esta funcionalidad. Fuente de negocio: Reunión 2026-08-24 (Devoluciones/Logística Inversa) en Notion, y la revision con Ana del 2026-08-31 ya reflejada en requirements.md. El usuario quiere experimentar el ciclo completo de AI-DLC incluyendo mockups/diseño."
- [scope] Workflow-selected scope: `feature`.

## Q1. ¿Cuál es el problema de negocio concreto que resuelve esta iniciativa?

- A. Las recolecciones se coordinan manualmente/por fuera y eso genera reprocesos, viajes extra o mercancía que no se recoge.
- B. La capacidad del vehículo se calcula sin contar las recolecciones, causando sobrecarga o rechazos en ruta.
- C. No hay forma de responder a una recolección que surge en vivo ("al pie de camión") sin rehacer la ruta a mano.
- D. Todas las anteriores.
- X. Other (please specify)

[Answer]: D. Todas las anteriores. (El usuario no tenía certeza; se confirma con las reuniones de Notion: hoy la recolección planificada se coordina como visita adicional por fuera y el reacomodo/capacidad se maneja a mano, y el caso "al pie de camión" no lo soporta el módulo actual.)

## Q2. ¿Quién es el usuario/cliente principal y qué dolor vive hoy?

- A. Planificador de Rutas (interno): arma rutas y hoy debe cruzar a mano entregas y recolecciones.
- B. Conductor (interno): en ruta recibe recolecciones no previstas y no tiene apoyo del sistema para reordenar.
- C. Coordinador de Devoluciones / Logística Inversa (interno): depende de que Planificación incluya sus recolecciones.
- D. A y B principalmente; C como parte interesada.
- X. Other (please specify)

[Answer]: D. A y B principalmente; C como parte interesada. (Fundamento: FR16 está redactado "Como Planificador de Rutas quiero…"; FR16.4 "al pie de camión" involucra al conductor en vivo; el equipo de Devoluciones/Ricardo es vecino que depende del contrato. El usuario no tenía certeza; se deriva de requirements.md FR16 y la reunión 2026-08-24.)

## Q3. ¿Cómo se ve el éxito? ¿Qué métricas importan? (select all that apply)

- A. % de recolecciones conocidas incluidas automáticamente en la secuencia (meta: ~100%).
- B. Reducción del tiempo del planificador para armar una ruta con entregas + recolecciones.
- C. Reducción de recolecciones no atendidas / re-agendadas por falta de capacidad o planificación.
- D. Tiempo para insertar y recalcular una recolección "al pie de camión" (meta: segundos, no rehacer ruta).
- E. Not yet defined / se definirán más adelante.
- X. Other (please specify)

[Answer]: E. Not yet defined. (El negocio aún no fijó métricas formales — ni requirements.md ni las reuniones definen KPIs para FR16. Los candidatos A–D quedan registrados como `[assumption]` en el intent-statement para validar con Ana/negocio.)

## Q4. ¿Cuál es el disparador de esta iniciativa ahora?

- A. Necesidad operativa: el volumen de devoluciones creció y coordinarlas aparte ya no escala.
- B. Levantamiento del módulo de Devoluciones/Logística Inversa (Reunión 2026-08-24) que conecta con Planificación.
- C. Revisión con Ana (2026-08-31) que formalizó FR16 en requirements.md y bloquea diseño (OQ-4).
- D. B y C combinados.
- X. Other (please specify)

[Answer]: B. Levantamiento del módulo de Devoluciones/Logística Inversa (Reunión 2026-08-24). (Respuesta del usuario: "salió de una reunión". La formalización con Ana el 2026-08-31 — opción C — es el paso que lo dejó listo para diseño y se registra como contexto complementario.)

## Q5. ¿Quiénes son los stakeholders clave y qué le importa a cada uno?

- A. Ana (líder de proyecto): FR16 bien definido y trazable; alcance acotado a Planificación.
- B. Equipo módulo Devoluciones (Ricardo): contrato claro de qué datos necesita una recolección para insertarse.
- C. Operaciones / despacho: que la ruta con recolecciones sea ejecutable y la capacidad realista.
- D. Todas las anteriores.
- X. Other (please specify)

[Answer]: D. Todas las anteriores. (Un "stakeholder" es una persona/equipo interesado en el resultado. El usuario no conocía el término; se deriva de las fuentes: Ana formalizó FR16 y pide alcance acotado; el equipo de Devoluciones/Ricardo necesita el contrato de datos; Operaciones necesita que la ruta con recolecciones sea ejecutable.)

## Q6. ¿Quién decide alcance y prioridad, y quién influye?

- A. Decide: Ana. Influye: Jesús (Planificación) y el equipo de Devoluciones.
- B. Decide: Jesús. Influye: Ana y Operaciones.
- C. Decisión conjunta Ana + Jesús.
- D. Not yet defined.
- X. Other (please specify)

[Answer]: C. Decisión conjunta Ana + Jesús. (Palabras del usuario: "diría que Ana y yo". Influyen el equipo de Devoluciones y Operaciones.)

## Q7. ¿Hay requisitos de comunicación o cadencia de reporte?

- A. Revisiones puntuales con Ana en cada hito, sin cadencia fija.
- B. Sincronización pendiente con el equipo de Devoluciones para cerrar OQ-4 antes del diseño.
- C. A y B.
- D. None.
- X. Other (please specify)

[Answer]: C. A y B. (El usuario no estaba seguro de la pregunta; se adopta la recomendación de las fuentes: revisiones puntuales con Ana por hito, sin cadencia fija — como la del 2026-08-31 — y un sync pendiente con el equipo de Devoluciones para cerrar OQ-4 antes del diseño técnico. Registrado como supuesto ligero a validar.)

## Q8. La iniciativa arrancó con alcance `feature` (ciclo completo: requisitos → diseño → mockups → construcción → operación, profundidad estándar). ¿Coincide con el límite de producto que tienes en mente?

- A. Sí: alcance `feature` tal cual — solo FR16 sobre Planificación ya construido, sin reconstruirlo, con mockups/diseño.
- B. Ciclo completo sí, pero límite de producto más chico (solo FR16.1–16.3; FR16.4 "al pie de camión" para después).
- C. Ciclo completo sí, pero límite de producto más amplio (incluye parte del ciclo de devolución fuera de Planificación).
- D. No — alcance más liviano (sin mockups / sin fase de operación).
- X. Other (please specify)

[Answer]: A. Sí: alcance `feature` tal cual — solo FR16 sobre Planificación ya construido, sin reconstruirlo, con mockups/diseño. (Confirmado explícitamente por el usuario.)

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en los artefactos:

- Problema: hoy las recolecciones/devoluciones planificadas se coordinan por fuera del módulo (visita adicional manual, reacomodo y capacidad a mano) y el caso "al pie de camión" no está soportado (Q1=D).
- Usuario principal: Planificador de Rutas; el Conductor entra en el caso en vivo (FR16.4); el equipo de Devoluciones es parte interesada (Q2=D).
- Métricas de éxito: aún no definidas formalmente; se registran como supuestos a validar (% de recolecciones incluidas, tiempo de planificación, recolecciones no atendidas, tiempo de recálculo en vivo) (Q3=E).
- Disparador: el levantamiento del módulo de Devoluciones/Logística Inversa (Reunión 2026-08-24); la formalización con Ana el 2026-08-31 lo dejó listo para diseño (Q4=B).
- Stakeholders: Ana (líder de proyecto), equipo de Devoluciones/Ricardo, Operaciones/despacho (Q5=D).
- Decisión de alcance/prioridad: conjunta Ana + Jesús (Q6=C).
- Comunicación: revisiones puntuales con Ana por hito + sync pendiente con Devoluciones para cerrar OQ-4 antes del diseño (Q7=C, supuesto ligero).
- Alcance de producto: `feature` tal cual — solo FR16 (16.1–16.4) sobre el módulo de Planificación ya construido, sin reconstruirlo, incluyendo mockups/diseño (Q8=A, confirmado).

- Looks correct
- Request changes

[Answer]: Looks correct

## Assumption Confirmation

Los artefactos contienen estos supuestos (marcados `[assumption]`), a validar más adelante con Ana/negocio:

- Métricas de éxito candidatas: % de recolecciones incluidas automáticamente; reducción del tiempo de planificación; reducción de recolecciones no atendidas; tiempo de recálculo "al pie de camión" en segundos.
- Comunicación: revisiones puntuales con Ana por hito (sin cadencia fija) + sync pendiente con el equipo de Devoluciones; sin cadencia de reporte formal definida.

Opciones:
- A. Accept assumptions
- B. Convert to follow-up questions

[Answer]: A. Accept assumptions
