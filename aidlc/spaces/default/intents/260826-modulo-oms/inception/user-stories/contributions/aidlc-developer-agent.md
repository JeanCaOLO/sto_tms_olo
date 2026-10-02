**Collaborator:** aidlc-developer-agent

# Revisión de implementabilidad / testabilidad — User Stories OMS (re-corrida por pivote WMH)

Revisado contra el backend real (`codekb/sto_tms_olo/architecture.md`,
`api-documentation.md`) y las decisiones firmes de `project.md`. Enfoque: solo lo
que cambió con el pivote o afecta implementabilidad. No propongo tocar historias
que ya son coherentes; marco con **[CAMBIO SUGERIDO]** lo que creo que falta como
criterio verificable, y con **[OK]** lo que está implementable como está.

---

## 1. US9 — dos escrituras (D6): tabla propia OMS + situación WMS

Esta es la historia con más riesgo de implementación del lote. Es implementable,
pero **como está no es completamente testable**: le faltan criterios sobre la
relación entre las dos escrituras. Hoy la historia describe cada escritura por
separado y el invariante negativo (no fechas, no WMH), pero no dice qué pasa
cuando **una de las dos falla**. Eso es exactamente lo que un test de integración
tiene que fijar, y hoy no hay un Given/Then que lo cubra.

El dato duro del backend: las dos escrituras caen en **almacenes de persistencia
distintos**.
- Escritura 1 (handoff): tabla propia del OMS en el esquema OMS de `logistica_olo`
  → **Aurora PostgreSQL** (`tms_app`, vía Layer `tms_common/pg`). Transacción
  local, atómica, trivial de garantizar.
- Escritura 2 (disparo picking): `situación` del pedido **en el WMS/EFLOW** →
  **SQL Server de EFLOW** (hoy en **mock**, `EflowMode=mock`), vía
  `tms_common/eflow_db`.

No hay transacción distribuida entre Aurora y SQL Server, y no debería inventarse
una (`ponytail:` dos stores, sin 2PC — el patrón correcto es orden + reintento,
no XA). Por eso la historia **necesita criterios extra** antes de pasar a
construcción:

**[CAMBIO SUGERIDO] Orden de las dos escrituras.** Fijar explícitamente que la
escritura 1 (Aurora, handoff) ocurre **antes** de la escritura 2 (WMS, disparo
picking). Razón: la tabla propia del OMS es el registro de la verdad del handoff
(Planificación lee de ahí, no del WMS, ya está en la historia). Si disparáramos
el picking primero y luego fallara el handoff, el WMS tendría un pedido en picking
que Planificación nunca ve → inconsistencia silenciosa. Al revés (handoff ok,
disparo falla) el pedido queda registrado en OMS pendiente de disparo, que es un
estado reintentable y observable.

**[CAMBIO SUGERIDO] Qué pasa si la escritura 2 falla tras la 1 exitosa.** Añadir
un Given/Then: *Given el handoff persistido (escritura 1 ok), When el cambio de
situación en el WMS falla, Then el pedido en la tabla del OMS queda en un estado
que marca "disparo pendiente" (no se da por generado-completo) y la corrida
reintenta el disparo sin re-crear el handoff.* Esto hace la escritura 2
**idempotente** y evita duplicar el registro OMS en el reintento. Sin este
criterio, el comportamiento ante fallo parcial queda a interpretación del
desarrollador y no hay test que lo ancle.

**[CAMBIO SUGERIDO] Idempotencia de la corrida completa.** El motor "corre al
menos una vez al día y en horas de corte" (US11). Hay que fijar que **re-procesar
un pedido ya generado no crea un segundo registro de handoff** ni vuelve a
disparar picking. Clave natural de idempotencia: `pedido+almacén+compañía+sucursal`
(la misma tupla del anti-join de US1). Sugiero un Given/Then negativo: *Given un
pedido ya generado por una corrida previa, When el motor vuelve a correr, Then no
inserta un segundo registro en la tabla del OMS ni re-dispara el picking.*

**[OK] Atomicidad de la escritura 1.** El criterio "nunca `GENERADA` sin
prioridad, escritura atómica" es correcto y directamente testable: es una
transacción Aurora de una sola fila, el patrón `pg` de la Layer ya lo soporta
(ver `admin` que hace CRUD transaccional credencial+app_users+user_scopes). Sin
cambios.

**[OK] Invariantes negativos** (no escribe fechas, no toca WMH, lectura sigue del
WMS/EFLOW). Verificables tal cual. Buenos tests negativos.

**Nota de dependencia (no bloqueante para User Stories):** la escritura 2 va
contra EFLOW, que hoy es **mock**. Es implementable y testable **ahora** contra
el mock (el contrato mock/live de EFLOW ya existe en el backend). La historia no
necesita cambio por esto, pero conviene que domain-design deje registrado que el
test de aceptación de US9-escritura-2 corre contra el adaptador mock hasta que
exista `live`. OQ-8 (gap peso/volumen) ya está bien ubicado como dependencia del
handoff a Planificación, no de US9 — de acuerdo, sin cambios.

---

## 2. US30 / US31 — scope: coherencia con `user_scopes` real y fail-closed

Ambas **[OK], coherentes con el backend real**. Confirmado contra
`backend/context/src/scopes.py`:

- US30 ("aislar por scope país→almacén→cliente, fail-closed, evaluado en el
  repositorio"): coincide exactamente con `resolve_scopes()` + `covers()` +
  `authorize()` (fail-closed, sin scope → 403) y con el filtrado de
  `data/src/app.py` por `caller.country_filter`. El criterio negativo "Operativo
  EPA nunca ve Cofersa" es directamente testable con un usuario scope=CUSTOMER.
  Nada que cambiar.

- US31 ("reglas con scope CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL, la más específica
  gana, en Lambda compartida — no una Lambda por compañía"): coherente con la
  cascada de `covers()` y con la arquitectura "Lambda por función, no por
  compañía". El sentido de la cascada en la historia es correcto: el orden
  **CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL** es de más específico a más general, y "la
  más específica gana" es la semántica de resolución correcta.

  **[OBSERVACIÓN, no cambio de historia]** La función `covers()` del backend hoy
  resuelve **autorización** (¿este scope cubre este recurso?), no **selección de
  la regla más específica** para el motor de priorización. Son dos usos distintos
  de la misma jerarquía de scopes. La selección "la más específica gana" para
  reglas **todavía no existe en el backend** — vive implícita en el motor TS del
  frontend (ver punto 3, C2). Esto no invalida US31 como historia; sí es trabajo
  real de domain-design/code-generation (reutilizar la jerarquía `covers()` como
  base del selector de reglas en vez de reimplementar la cascada). Lo dejo
  anotado para que no se asuma "ya está en el backend".

- US32/US33 **[OK]**. Niveles de acceso y registro de autor por escritura calzan
  con la matriz de permisos de `admin` y con `audit.bind(event)` → trigger de BD
  que graba el actor en rutas de escritura. US33 es testable tal cual contra el
  mecanismo de auditoría existente.

---

## 3. Historias de 1ª entrega vs. motor de reglas inexistente en backend (C2)

Este es el choque más importante para la planificación de construcción. El motor
de reglas **no existe en el backend** (confirmado: `architecture.md` →
"Lógica de reglas en TS de frontend (`src/lib/tarifas/`, `priorityEngine.ts`)…
el backend aún no tiene motor de reglas", C2 abierta). Varias historias de 1ª
entrega **asumen que ese motor corre en una Lambda**:

- **US7 (T-1) [1ª entrega]** — "el motor corre hoy", regla de ruta de fallback.
- **US9 (dos escrituras) [1ª entrega]** — "cuando el motor lo procesa".
- **US10 (score ponderado) [1ª entrega]** — cálculo de prioridad invertida.
- **US11b (umbral de inyección) [1ª entrega]** — corte por prioridad.
- **US12/US13 (IA observaciones, cliente retira) [1ª entrega]** — clasificación
  Bedrock + regla cliente-retira.

**[OK] como historias — no chocan en su redacción.** Ninguna de estas dice
*dónde* vive el motor; dicen qué hace el motor. Eso es correcto para User Stories
(el *dónde* es decisión de domain-design). No sugiero cambiar su texto.

**[RIESGO que debe quedar explícito, no es cambio de historia]** El conjunto
US7+US9+US10+US11b+US12+US13 marcado `[1ª entrega]` presupone que para la primera
entrega existe un **motor de priorización corriendo en backend** (Lambda), porque
US9 escritura-1 va a Aurora y escritura-2 a EFLOW — eso **no puede ejecutarse
desde el TS del frontend**. Es decir: la 1ª entrega del OMS **requiere resolver
C2 construyendo el motor en Python/Lambda**, no solo reusando el motor TS. La
decisión de arquitectura (portar el AST de `src/lib/tarifas/` a Python vs.
reescribir) está marcada como C2 abierta "a resolver en domain-design" — de
acuerdo. Mi aporte como developer: **esta no es una deuda diferible para la 1ª
entrega; es prerrequisito de US9**. Si domain-design decide portar el AST TS→
Python, hay riesgo de regresión en Liquidaciones (que ya usa ese AST TS en
producción) — ese riesgo debe entrar como criterio de no-regresión en la etapa de
construcción, no descubrirse ahí.

Recomiendo que la **secuencia de construcción** (ya anotada en stories.md como
"rebanada delgada de las 2 reglas de 1ª entrega") liste explícitamente **crear el
esqueleto del motor en Lambda** como el primer item de esa rebanada, antes de
US9. Sin ese esqueleto, US9 no tiene dónde ejecutarse.

---

## Resumen

- **US9**: implementable pero **incompleta para test**. Faltan 3 criterios:
  orden de las dos escrituras (handoff antes que disparo), manejo de fallo parcial
  (disparo pendiente + reintento idempotente), e idempotencia de corrida por clave
  `pedido+almacén+compañía+sucursal`. No usar 2PC entre Aurora y SQL Server.
- **US30/US31/US32/US33**: coherentes con `user_scopes`/`scopes.py` fail-closed y
  con auditoría. Observación: el "selector de regla más específica" de US31 reusa
  la jerarquía de scopes pero **aún no existe** en backend (es construcción, no
  "ya está").
- **C2**: las historias de 1ª entrega no chocan en texto, pero en conjunto
  **exigen construir el motor en Lambda** (prerrequisito de US9), con riesgo de
  regresión en Liquidaciones si se porta el AST TS→Python. Debe ser el primer item
  de la rebanada delgada de construcción.
