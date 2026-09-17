**Collaborator:** aidlc-developer-agent

## Contribution

Revisión desde implementación del story map. El mapa es sólido y los invariantes
del motor (E2) están bien capturados en criterios; abajo los ajustes concretos
para que el lead los integre.

### (a) E2 — invariantes técnicos: bien reflejados, con dos precisiones

- **No escribe fechas** (US7) y **escritura solo WMS/EFLOW** (US9): correctos y
  verificables (cuadran con NFR7/FR8.2). Sugerencia menor: en US9 el criterio
  "escribe solo a nivel WMS/EFLOW" merece un caso negativo explícito ("Then NO
  toca WMH ni intermedias") — hoy está como nota, mejor como Then testeable.
- **DISP → GENERADA** (US9): bien. Falta hacer explícito que el motor escribe
  las **tres cosas en una sola transacción** (`estado=DISP` + `situación=GENERADA`
  + prioridad, FR8.1). Sin atomicidad, un pedido puede quedar GENERADA sin
  prioridad. Añadir criterio de escritura atómica evita un bug de estado parcial.
- **Prioridad numérica invertida con score** (US10): correcto y bien atado a
  FR3. Falta el criterio de **empate**: si dos pedidos calculan el mismo score,
  ¿qué desempata (fecha, hora de entrada, id)? Sin desempate definido el orden
  no es determinista → reejecuciones del motor pueden reordenar la cola. Añadir
  criterio de desempate estable.
- **Lectura sobre réplica EFLOW_OLO** (FR1.4/NFR9): **no aparece como criterio
  en ninguna historia de E1/E2**, solo como Open Question. Es una restricción de
  frontera de implementación (dónde apunta la conexión de lectura). Sugiero un
  criterio en US1: "Then la lectura va contra la réplica, no contra el
  transaccional" — aunque la réplica no exista aún, fija el contrato de la query.

### (b) Historias técnicas de frontera que faltan o están implícitas

1. **Cruce `expedición_cabecera` / `almacén_movimiento_carcam` (anti-join)**:
   está dentro de US1 como parte del Given, pero el anti-join (FR1.1/FR1.2) es la
   pieza de datos más delicada de la primera entrega (define qué es "candidato").
   Merece visibilidad propia o, mínimo, un criterio que pruebe el caso "pedido ya
   en carcam NO aparece" (hoy está en el Given de US1, conviene subirlo a Then
   verificable). El cruce por `pedido+almacén+compañía+sucursal` (FR1.2) es la
   clave de join real — nombrarla evita ambigüedad en construcción.

2. **Lambda por compañía como unidad de despliegue**: US31 cubre "usa la Lambda
   de la compañía", pero no hay historia sobre **cómo se selecciona/rutea** a la
   Lambda correcta ni sobre **añadir una compañía nueva** (rollout por etapas,
   dolor de P2). Sugiero una historia técnica: "dar de alta una compañía nueva =
   desplegar su Lambda + registrar su maestro", que es el mecanismo real del
   rollout progresivo.

3. **Análisis de observaciones con Bedrock (US12/US13)**: bien cubierto a nivel
   funcional. Faltan dos criterios de frontera de implementación:
   - **Fallback ante fallo/timeout de Bedrock**: si el modelo no responde, ¿el
     pedido se prioriza igual por las otras reglas o se deja sin clasificar? Sin
     esto, una caída de Bedrock bloquea el motor. Añadir Then de degradación.
     `ponytail:` heurística de degradación simple (seguir sin la regla IA) es
     aceptable como techo; upgrade = reintento/cola muerta.
   - **Costo/batch** (FR7.4, <$1/mes): el criterio de costo depende de agrupar
     las ~400 observaciones por corrida, no de una llamada por pedido. Vale un
     criterio no-funcional ("una invocación por lote, no por pedido") porque
     cambia el diseño de la integración.

### (c) Dependencias de secuencia entre historias

- **US1/US9/US10 son el núcleo de la primera entrega y comparten la capa de
  datos** (misma query de cola, misma escritura). Deben construirse juntas; el
  mapa no lo señala. US10 (score) depende de que US9 (transición) exista, y US9
  depende de US1 (leer candidatos). Secuencia real: **US1 → US9 → US10 → US7**
  (T-1 afina, no habilita). Sugiero nota de secuencia en E2.
- **US12/US13 (IA) alimentan el score de US10** (cliente retira = mayor peso,
  FR3.2). US13 no puede asignar "prioridad más alta" sin el modelo de score de
  US10 ya implementado → US10 precede a US13, no al revés. Hoy el orden numérico
  sugiere lo contrario.
- **E5 (catálogo) es dependencia de configuración de E2**: los pesos/parámetros
  que US10/US7/US8 consumen se editan en US17/US18. Si E2 va en 1ª entrega y E5
  en "siguiente", el motor de 1ª entrega necesita pesos **hardcoded o por
  seed/config**, no por UI. Conviene marcarlo para no bloquear E2 con E5.

### (d) Open Questions tratadas como dependencias

Bien tratadas en general (sección "Dependencias y supuestos"). Precisiones:

- **OQ-2 (réplica no existe)**: correctamente marcada como habilitadora de
  E1/E2 en producción. Añadir que **no bloquea la construcción** — se puede
  desarrollar/testear contra un esquema equivalente o fixture de EFLOW_OLO
  mientras Infra provisiona la réplica. Es dependencia de *despliegue*, no de
  *desarrollo*. Conviene que el lead lo diga explícito para no frenar E2.
- **OQ-3 (fecha Cofersa)**: bien atada a US7 (fallback por ruta). El fallback
  (FR2.5) merece su **propio criterio en US7** ("Given compañía sin fecha de
  entrega, Then aplica regla de ruta"), no solo mención en dependencias — es
  código real de la primera entrega para Cofersa (el cliente de referencia).
- **OQ-4 (tabla de prioridades del cliente)**: bien como afinador de US10. Es un
  insumo de datos, no bloquea el modelo de score; correcto no modelarla como
  historia.

## Positions
- AGREE: Invariantes del motor E2 (no-fechas, DISP→GENERADA, prioridad invertida por score, escritura solo WMS/EFLOW) — están correctamente expresados como criterios verificables y trazan a FR2/FR3/FR8.
- AGREE: Tratar OQ-1..OQ-7 como dependencias y no como historias — son datos/arquitectura/cliente, no comportamiento construible.
- OBJECT: Falta lectura-sobre-réplica (FR1.4/NFR9) como criterio en E1 — es contrato de frontera de la query, hoy solo vive como Open Question.
- OBJECT: Falta atomicidad de escritura y desempate de score en US9/US10 — sin ellos hay estado parcial y orden no determinista (bugs reales del motor).
- OBJECT: Falta fallback de Bedrock (US12/US13) y criterio de fallback-por-ruta explícito en US7 (OQ-3) — ambos son código de la 1ª entrega, no diferibles.
- OBJECT: Secuencia de E2 mal reflejada — US1→US9→US10→US7 y US10 precede a US13; el orden numérico sugiere lo contrario y E5 (pesos) no puede bloquear a E2.
