**Collaborator:** aidlc-quality-agent

# Revisión de testabilidad — User Stories OMS (re-corrida WMH)

Alcance: solo lo que cambió con el pivote o afecta directamente la testabilidad.
Veredicto general: el story map es **mayormente testable** y las etiquetas de
1ª entrega son construibles. Hay **4 huecos de criterio** que conviene cerrar
antes del gate para no arrastrarlos a `build-and-test`. Ninguno bloquea el gate
de forma dura; todos son de la clase "criterio faltante / dato abierto no
marcado".

---

## 1. US9 — Dos escrituras + handoff (D6). **Testable, con 2 huecos.**

Lo bueno (verificable tal cual está escrito):
- La **escritura 1 (tabla OMS)** tiene criterio de atomicidad explícito ("nunca
  `GENERADA` sin prioridad") → test unitario/integración claro: inyectar fallo
  entre prioridad y status y verificar que **no** queda fila `GENERADA` sin
  prioridad (rollback). Buen criterio de pase/fallo.
- La **escritura 2 (situación WMS)** y la condición negativa ("regla no se
  cumple → no persiste ni cambia situación") son dos tests separables.
- El **handoff** ("Planificación lee de la tabla del OMS, no del WMS") es un
  test de contrato verificable: assert que el lector de Planificación apunta al
  esquema OMS de `logistica_olo`.
- "No escribe fechas / no toca el WMH" → dos criterios negativos verificables.

Huecos a cerrar (recomendados, no bloqueantes):

- **H1 — Falta criterio de consistencia entre las dos escrituras.** Hoy cada
  escritura se prueba por separado, pero no hay criterio que diga qué pasa si la
  **escritura 1 (OMS) tiene éxito y la 2 (WMS) falla** (o viceversa). Es el
  escenario negativo de mayor riesgo del handoff: un pedido `GENERADA` en el OMS
  que el WMS nunca ve (picking que no dispara), o picking disparado sin registro
  OMS (Planificación no lo encuentra). Propuesta de criterio adicional:
  > Given la escritura 1 (OMS) confirmada, When la escritura 2 (WMS) falla,
  > Then el sistema queda en un estado reconciliable (reintento/compensación o
  > marca de inconsistencia auditada), nunca "generado en OMS pero sin picking"
  > de forma silenciosa.
  Esto no exige transacción distribuida en el diseño (eso es domain-design); solo
  pide que exista un criterio **observable** de pase/fallo para ese borde.

- **H2 — El orden de las dos escrituras no es verificable hoy.** Para
  Planificación importa si el handoff (tabla OMS) está disponible antes/después
  de que el WMS dispare el picking. Sugerir fijar el orden esperado en un
  criterio ("escritura 1 OMS **antes de** escritura 2 WMS") para que exista un
  test determinista; si el orden es indiferente, decirlo explícitamente para no
  escribir un test que asuma uno de los dos.

---

## 2. US30/US31 — Aislamiento por scope, fail-closed. **El test estrella es claro.**

- **"EPA nunca ve Cofersa" es un test de integración limpio.** US30 lo deja como
  criterio negativo con actor y scope concretos (`scope=CUSTOMER EPA` → consulta
  → 0 filas de Cofersa). Es directamente ejecutable como test de integración
  sobre el repositorio con `user_scopes`. Buen criterio.
- **fail-closed es verificable**: "evaluado en el repositorio, fail-closed" →
  test de que ante scope ausente/indeterminado el resultado es **vacío/deniega**,
  no "todo". Recomiendo volverlo criterio explícito (ver H3) porque hoy la
  palabra "fail-closed" está en la narrativa pero no como su propio Given/When/
  Then.

Huecos:

- **H3 — Cobertura incompleta de los niveles de scope.** US30 nombra
  país/almacén/cliente/GLOBAL pero solo da **un** caso negativo (CUSTOMER→CUSTOMER).
  Para una matriz fail-closed hacen falta como mínimo:
  - **Jerarquía/especificidad**: un usuario COUNTRY ve todos los almacenes de su
    país pero no de otro país (US31 dice "la más específica gana" para reglas,
    pero US30 no tiene el caso equivalente de lectura jerárquica).
  - **GLOBAL**: un usuario GLOBAL sí ve todas las compañías (caso positivo que
    confirma que fail-closed no es "deniega siempre").
  - **fail-closed explícito**: scope nulo/vacío → 0 filas.
  Propuesta: añadir estos 3 criterios a US30 (o nota de que la matriz completa se
  especifica en build-and-test). Sin ellos, el test de scope valida un punto y
  deja los bordes jerárquico y GLOBAL sin cobertura declarada.

- **US31**: "la más específica gana" es testable (dar reglas en 2 niveles de
  scope sobre el mismo pedido → verificar que aplica la de scope más estrecho).
  Está bien; solo recordar en build-and-test el caso de **empate de
  especificidad** (dos reglas al mismo nivel) → necesita desempate determinista,
  hoy no especificado. Lo anoto como seguimiento, no como hueco de esta etapa.

---

## 3. Rebanada delgada de 1ª entrega — **construible primero, con 1 ajuste.**

La rebanada (T-1: US7/US9/US10 + cliente retira/observaciones: US12/US13) tiene
criterios de pase/fallo suficientes para construir sobre ella:

- **US7 (T-1)**: happy path + invariante "no escribe fechas" + fallback por ruta
  (sin fecha). Testable. El fallback (US7) depende de OQ-3 pero el **comportamiento**
  es verificable con datos de ruta mock.
- **US10 (score/prioridad)**: excelente para QA — tiene el caso de ponderación
  ("verifica la ponderación, no solo el orden") y **desempate estable
  determinista** (fecha→hora→id). Eso hace los tests repetibles entre corridas,
  que es justo lo que la pirámide necesita como base. Aprobado sin cambios.
- **US12 (IA)**: tiene el criterio de **degradación** (fallo/timeout de Bedrock →
  prioriza igual) y el de **invocación por lote**. Ambos testables (el de lote
  con un spy/contador de invocaciones = 1 por corrida, no N por pedido). Bien.
- **US13**: "retira → prioridad más alta" testable.
- **US11b (umbral)**: el truco de "comportamiento verificable ahora con umbral
  parametrizable aunque `U` se afine con OQ-5" es correcto para QA — permite
  testear el corte sin esperar el dato abierto.

Ajuste:

- **H4 — US12/US13 acoplan el test al modelo de IA (no determinista).** El
  criterio "el modelo clasifica retira" es verdadero pero **no es un test unitario
  estable** si llama a Bedrock real: la salida del LLM no es determinista y el
  test sería frágil/costoso. Recomiendo que las historias (o una nota para
  build-and-test) dejen explícito que la **clasificación se testea con el
  clasificador mockeado/stubbeado** (dado "retira"→marca; dado "no-retira"→no
  marca), y que la integración real con Bedrock se cubre con un test de contrato
  aparte, no en la suite unitaria. Sin esta marca, build-and-test puede escribir
  un test que invoque el modelo y resulte intermitente. Esto conserva la
  pirámide (muchos unit rápidos sobre lógica, poca integración sobre el LLM).

---

## 4. OQ-8 (gap peso/volumen) y OQ-5 (umbral) — **datos abiertos: bien marcados.**

- **OQ-8 (gap peso/volumen, `capacity_known:false`)**: correctamente aislado como
  **dependencia del handoff (US9)**, explícitamente **no del cálculo de prioridad**.
  Esto es lo correcto para testabilidad: significa que el motor de prioridad
  (US10) **sí es testeable ahora** sin peso/volumen, y que cualquier criterio que
  dependa de capacidad real queda fuera de la suite de 1ª entrega. US9 ya lleva el
  flag `capacity_known:false` implícito vía la dependencia. **Sugerencia menor**:
  que US9 mencione que el campo de capacidad del handoff puede ir ausente/`null`
  (no-testeable aún) para que el test del handoff no asuma su presencia.
- **OQ-5 (umbral de inyección)**: bien marcado en US11b con la nota "el valor de
  `U` se afina con OQ-5; el comportamiento de corte es verificable ahora con un
  umbral parametrizable". Esto es exactamente la marca de "dato abierto, lógica
  testeable". Aprobado.

Ambos OQ dependientes de datos abiertos están correctamente marcados como
afinables y **no** bloquean la testabilidad de la lógica. No hay criterio que
afirme un valor concreto todavía-abierto como si fuera testeable. Correcto.

---

## Resumen de huecos (para build-and-test, no bloqueantes del gate)

| # | Historia | Hueco | Riesgo si no se cierra |
|---|---|---|---|
| H1 | US9 | Falta criterio de consistencia escritura-1-ok / escritura-2-falla | Handoff silenciosamente inconsistente (generado en OMS sin picking, o al revés) sin test que lo detecte |
| H2 | US9 | Orden entre las dos escrituras no fijado | Test de handoff no determinista; Planificación puede leer antes de tiempo |
| H3 | US30 | Matriz de scope incompleta (jerárquico, GLOBAL+, fail-closed nulo) | Aislamiento validado en 1 punto; bordes jerárquico/GLOBAL sin cobertura |
| H4 | US12/US13 | No se marca que la clasificación IA se testea con stub | Suite unitaria frágil/intermitente/costosa si invoca Bedrock real |

**Acuerdo general:** las historias son testables y la rebanada de 1ª entrega es
construible primero. Los 4 huecos son adiciones de criterio, no reescrituras;
pueden cerrarse aquí (product-agent añade los Given/When/Then a stories.md) o
diferirse como notas de alcance para build-and-test. Mi recomendación de QA:
cerrar **H1 y H4 ahora** (son los que, omitidos, producen defectos de escape o
tests inútiles), y dejar **H2 y H3** como notas explícitas para build-and-test.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/user-stories-assessment.md`
- `aidlc/spaces/default/memory/project.md` (`## Decided` D5/D6, C3-SUPERSEDE)
