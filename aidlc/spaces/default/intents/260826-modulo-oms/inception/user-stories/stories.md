# Historias de usuario — Módulo OMS

> Intent: `260826-modulo-oms`. Etapa: User Stories (Inception, **re-corrida por
> el pivote de reemplazo del WMH**, 2026-09-30). Derivadas del `requirements.md`
> v3 (14 FR, FR12 retirado) y de las decisiones firmes de `project.md`
> (`## Decided` D1–D6, C3-SUPERSEDE). Formato Given/When/Then (BDD). Cada historia
> traza a su(s) FR y lleva una **etiqueta de entrega**: `[1ª entrega]`,
> `[siguiente]` o `[futuro]`. Actores en `personas.md`.
>
> **Correcciones de esta re-corrida** (base a corregir, no repetir):
> - **E8 (US28–US29, Calendario de rutas) RETIRADA** por D5 (ruteo dinámico; las
>   rutas dejan de ser fijas) — movida a "Fuera de alcance".
> - **Multi-compañía por SCOPE** (C3-SUPERSEDE): US30/US31 pasan de "Lambda por
>   compañía / columnas compañía-país" a **scope CUSTOMER→WAREHOUSE→COUNTRY→
>   GLOBAL** en Lambdas compartidas.
> - **D6 (dos escrituras)**: US9 refleja la escritura en la **tabla propia del
>   OMS** (handoff) + el cambio de `situación` en el WMS.

## Story map (épicas)

| Épica | Historias | FR cubiertos |
|---|---|---|
| E1 — Cola de Priorización | US1–US6 | FR1, FR10 |
| E2 — Motor de priorización (automático) | US7–US11b | FR2, FR3, FR6, FR8 |
| E3 — Análisis de observaciones con IA | US12–US13 | FR6.2, FR6.3, FR7 |
| E4 — Override manual | US14–US15 | FR4 |
| E5 — Motor de Reglas (catálogo) | US16–US18 | FR5, FR6 |
| E6 — Simulador (configurador) | US19–US24 | FR9 |
| E7 — Panel y Auditoría | US25–US27 | FR11 |
| E8 — Calendario de rutas | ~~US28–US29~~ **RETIRADA (D5)** | ~~FR12~~ |
| E9 — Multi-compañía (scope) y seguridad | US30–US33 | FR13, FR14 |

---

## E1 — Cola de Priorización

### US1 — Ver la cola de pedidos a priorizar `[1ª entrega]` (FR1, FR10)
Como **Responsable del OMS**, quiero ver los pedidos candidatos a priorizar,
para gestionar el alistamiento del día.
- Given pedidos en `expedición_cabecera` con `fecha_de_cierre IS NULL` y
  `situación = DISP` sin `NUMEROVIAJEWMH`, When abro la Cola, Then veo esos
  pedidos y no los que ya están en `almacén_movimiento_carcam`.
- Given un pedido ya presente en `almacén_movimiento_carcam` (anti-join por
  `pedido+almacén+compañía+sucursal`), When se resuelve la cola, Then ese pedido
  **no** aparece (verifica el anti-join, no solo el filtro de situación).
- Given la Cola recién abierta, When carga, Then el filtro de situación entra
  por defecto en `DISP`.
- Given la lectura de la cola, When el OMS consulta, Then va contra la **réplica
  de `EFLOW_OLO`**, no contra el transaccional (FR1.4/NFR9; contrato de la query,
  aunque la réplica se provisione después — ver dependencias).
- **UX (5 estados)**: Given la vista sin datos / cargando / sin conexión al
  motor, Then muestra el estado vacío / skeleton / error correspondiente, nunca
  una tabla en blanco.

### US2 — Filtrar la cola `[1ª entrega]` (FR10.1, FR10.2)
Como **Responsable del OMS**, quiero filtrar por situación, almacén y compañía,
para acotar lo que veo.
- Given la Cola, When cambio el filtro de situación a `GENERADA`, Then veo los
  pedidos ya generados.
- Given una compañía con varios almacenes, When selecciono un almacén, Then la
  cola muestra solo ese almacén.

### US3 — Acotar el scope (país→almacén→cliente) en la vista `[siguiente]` (FR10.2, FR13.2)
Como **Responsable del OMS**, quiero acotar mi scope (país → almacén → cliente)
dentro de la misma vista, sin cambiar de perfil, para operar los scopes que mi
RBAC permite (la compañía es un nivel del scope, no el eje).
- Given un perfil con acceso a varios scopes, When acoto el scope (p. ej. elijo
  un cliente dentro de un almacén), Then la cola muestra solo los pedidos de ese
  scope, sin cambiar de perfil.
- Given un usuario con un scope de un solo nivel (p. ej. CUSTOMER=EPA), When abre
  la Cola, Then el scope viene fijo (no ofrece scopes fuera de su permiso; se
  ocultan, no se deshabilitan para rebotar — coherente con US15).
- Nota (design D-3/D-4): el selector es jerárquico (breadcrumb país › almacén ›
  cliente), con herencia visible; el detalle de UX aterriza en refined-mockups.

### US4 — Ver el nombre de la compañía `[siguiente]` (FR10.3, FR13.4)
Como **Responsable del OMS**, quiero ver el nombre de la compañía (no el código),
resuelto contra el maestro.
- Given un pedido de la compañía `0109`, When lo veo en la cola, Then aparece
  "Cofersa" (nombre del maestro), no `0109`.

### US5 — Elegir columnas visibles `[siguiente]` (FR10.4)
Como **Responsable del OMS**, quiero elegir qué columnas veo y que se recuerden,
porque el WMS trae muchas columnas.
- Given que elijo un conjunto de columnas, When vuelvo a entrar, Then se
  conserva mi selección (persistida en `User Preference`, JSON).

### US6 — Ver el detalle de un pedido en modal `[1ª entrega]` (FR10.5, FR10.6)
Como **Responsable del OMS**, quiero abrir el detalle de un pedido en un modal,
para que la tabla use todo el ancho.
- Given un pedido en la cola, When lo selecciono, Then se abre un modal con su
  detalle y, si tengo permiso, el botón de override.
- **UX/accesibilidad**: Given el modal abierto, When se muestra, Then el foco
  entra y queda atrapado en el modal, `Esc` lo cierra, y al cerrarse el foco
  vuelve a la fila de origen (WCAG 2.1.2 / 2.4.3).

---

## E2 — Motor de priorización (automático)

### US7 — Calcular cuándo preparar por fecha (T-1) `[1ª entrega]` (FR2)
Como **Sistema/Motor OMS**, calculo si un pedido debe prepararse hoy según su
fecha de entrega, para alistar en el momento correcto.
- Given un pedido con `fecha de expedición planificada` = mañana, When el motor
  corre hoy y hoy es su T-1, Then lo marca para preparar hoy.
- Given ese cálculo, When el motor actúa, Then **no escribe ninguna fecha**
  (invariante): la `fecha de expedición planificada` queda intacta.
- **Fallback (FR2.5)**: Given un pedido **sin** fecha de expedición planificada
  (caso Cofersa hoy), When el motor lo evalúa, Then aplica la **regla de ruta**
  (día de salida por ruta) para decidir el T-1.

### US8 — Respetar horas de corte `[siguiente]` (FR2.3)
Como **Sistema/Motor OMS**, aplico las horas de corte de la ruta, para no
adelantar ni atrasar el alistamiento.
- Given un pedido que entra después del corte de su ruta, When el motor lo
  evalúa, Then rueda al siguiente evento de esa ruta.

### US9 — Generar el pedido: dos escrituras (tabla propia OMS + situación WMS) `[1ª entrega]` (FR8, D6)
Como **Sistema/Motor OMS**, persisto el pedido priorizado en mi tabla propia y
cambio su situación en el WMS, para dejarlo alistado y hacer el handoff a
Planificación.
- Given un pedido cuya regla T-1 se cumple, When el motor lo procesa, Then
  **(escritura 1 — handoff)** persiste el registro en la **tabla de pedidos
  propia del OMS** (esquema OMS de `logistica_olo`) con prioridad + status +
  `situación = GENERADA`, en una **escritura atómica** (nunca `GENERADA` sin
  prioridad).
- Given ese mismo pedido, When el motor lo procesa, Then **(escritura 2 — disparo
  de picking)** cambia el campo `situación` del pedido **en el WMS/EFLOW** a
  `GENERADA` para que el WMS/EFLOW genere el picking.
- Given un pedido cuya regla no se cumple, When el motor lo procesa, Then no lo
  persiste como generado ni cambia su situación en el WMS (no lo genera todavía).
- Given cualquier escritura del motor, When actúa, Then **no escribe fechas** y
  **no toca el WMH** (invariantes, criterios negativos verificables). La lectura
  sigue siendo del WMS/EFLOW.
- Given el handoff, When el pedido queda alistado, Then **Planificación lee de la
  tabla propia del OMS** (no del WMS) para armar el viaje.
- **Orden (dev/QA H2)**: Given las dos escrituras, When el motor procesa, Then la
  escritura 1 (tabla OMS, handoff) ocurre **antes** que la escritura 2 (situación
  WMS, disparo de picking) — la tabla del OMS es la verdad del handoff.
- **Fallo parcial (dev/QA H1)**: Given la escritura 1 confirmada, When la
  escritura 2 (WMS) falla, Then el pedido queda en la tabla del OMS marcado
  **"disparo pendiente"** (no "generado-completo"), nunca `GENERADA` en OMS sin
  picking de forma silenciosa; la corrida **reintenta la escritura 2 de forma
  idempotente** sin re-crear el handoff. `ponytail:` dos stores (Aurora + SQL
  Server EFLOW) sin 2PC — techo = orden + reintento idempotente; upgrade =
  reconciliación/outbox.
- **Idempotencia de corrida**: Given un pedido ya generado por una corrida
  previa, When el motor vuelve a correr (US11, ≥1/día + cortes), Then **no** crea
  un segundo registro de handoff ni re-dispara el picking (clave de idempotencia:
  `pedido+almacén+compañía+sucursal`).
- Nota (QA/dev): el campo de capacidad del handoff puede ir ausente/`null`
  (`capacity_known:false`, OQ-8) — el test del handoff no asume su presencia. La
  escritura 2 corre contra el adaptador EFLOW **mock** hasta que exista `live`.

### US10 — Asignar prioridad numérica con score `[1ª entrega]` (FR3)
Como **Sistema/Motor OMS**, asigno una prioridad numérica invertida calculada
por score ponderado, para ordenar el alistamiento.
- Given las reglas activas que aplican a un pedido, When el motor calcula, Then
  la prioridad es un **número invertido** (menor = más urgente) resultado del
  **score ponderado** (suma de pesos; mayor peso = cliente retira, luego fecha).
- Given dos pedidos, uno "cliente retira" y otro solo con la regla de fecha,
  When el motor calcula, Then el de cliente retira obtiene mayor score y por
  tanto **menor número de prioridad** (verifica la ponderación, no solo el orden).
- Given dos pedidos con el **mismo score**, When el motor ordena, Then aplica un
  **desempate estable** (fecha de entrega, luego hora de entrada, luego id) para
  que el orden sea determinista entre corridas.

### US11 — Revisitar prioridades periódicamente `[siguiente]` (FR3.3, NFR1)
Como **Sistema/Motor OMS**, corro al menos una vez al día y en las horas de
corte, para actualizar prioridades según la capacidad.
- Given pedidos no alcanzados hoy, When el motor corre al día siguiente, Then
  su **número de prioridad disminuye** respecto a la corrida anterior (prioridad
  invertida → más urgente).

### US11b — Cortar por umbral de inyección `[1ª entrega]` (FR3.4, NFR4)
Como **Sistema/Motor OMS**, solo preparo pedidos hasta cierta prioridad, para no
inyectar más de lo que la capacidad soporta (~80 en proceso).
- Given un umbral de inyección `U` (configurable) y pedidos con prioridad peor
  que `U` (número mayor), When el motor corre, Then esos pedidos **no** se
  generan (no pasan a `GENERADA`) y esperan a la siguiente corrida.
- Given pedidos con prioridad ≤ `U`, When el motor corre, Then sí se generan.
- Nota: el valor de `U` se afina con OQ-5; el comportamiento de corte es
  verificable ahora con un umbral parametrizable.

---

## E3 — Análisis de observaciones con IA

### US12 — Interpretar observaciones con IA `[1ª entrega]` (FR6.2, FR7)
Como **Sistema/Motor OMS**, interpreto el texto libre de `observaciones` con un
modelo de IA (Amazon Bedrock), para no depender de que un humano lea 400–500/día.
- Given un pedido con observación de texto libre, When el motor la procesa, Then
  el modelo la clasifica y, si es **"retira"**, marca el pedido como
  cliente-retira (salida de 1ª entrega; otras salidas quedan como futuras).
- Given el diseño, When se ejecuta, Then el **prompt vive en la Lambda** y no es
  editable desde la UI.
- Given un **fallo o timeout de Bedrock**, When el motor procesa un pedido, Then
  el pedido se prioriza igual por las demás reglas (degrada sin la clasificación
  IA) y no se bloquea el motor. `ponytail:` degradación simple (seguir sin la
  regla IA); upgrade = reintento / cola de reproceso.
- Given el objetivo de costo (FR7.4), When se integra, Then la invocación se
  hace **por lote** (una corrida sobre las ~400 observaciones), no una llamada
  por pedido.
- **Testabilidad (QA H4)**: la clasificación se prueba con el **clasificador
  mockeado/stub** (dado "retira"→marca; dado "no-retira"→no marca) en la suite
  unitaria; la integración real con Bedrock se cubre con un test de contrato
  aparte, no en unitarios (evita suite frágil/no determinista).

### US13 — Detectar "cliente retira" y priorizarlo `[1ª entrega]` (FR6.3, FR7.3)
Como **Sistema/Motor OMS**, identifico los pedidos "cliente retira" por su
observación y les asigno la prioridad más alta, para segregarlos.
- Given una observación que indica "retira", When el motor la clasifica, Then el
  pedido recibe la prioridad más alta y se marca para el viaje/cliente "dummy".

---

## E4 — Override manual

### US14 — Alterar la prioridad de un pedido puntual `[1ª entrega]` (FR4.1, FR4.2)
Como **Responsable del OMS** (rol autorizado), quiero cambiar la prioridad de un
pedido puntual con un motivo, para casos extraordinarios.
- Given un pedido en la cola, When ejecuto un override con un nuevo valor y un
  **motivo obligatorio**, Then la prioridad cambia y queda registrado en la
  Auditoría como cambio **manual**.
- Given un override **sin motivo** (o con valor fuera de rango), When intento
  guardarlo, Then se rechaza (criterio negativo).
- **UX (prevención de error)**: Given el formulario de override, When el motivo
  está vacío o el valor es inválido, Then el botón Aplicar está deshabilitado y
  el requisito se muestra antes de intentar guardar, no como alerta posterior.

### US15 — Impedir override sin permiso `[1ª entrega]` (FR4.3, FR14)
Como responsable de seguridad, quiero que solo roles autorizados hagan override,
para proteger el cálculo.
- Given un usuario sin permiso de override, When intenta alterar la prioridad,
  Then la acción se deniega.
- **UX**: Given un usuario sin permiso, When ve el detalle, Then las acciones sin
  permiso se **ocultan o deshabilitan con tooltip** (no se ofrecen para luego
  rebotar).

---

## E5 — Motor de Reglas (catálogo semi-configurable)

### US16 — Ver el catálogo de reglas por compañía `[siguiente]` (FR5.1, FR5.3)
Como **Administrador de Módulo**, quiero ver las reglas implementadas de una
compañía, para gestionarlas.
- Given una compañía seleccionada, When abro el Motor de Reglas, Then veo sus
  reglas (nombre, descripción, estado, peso, parámetros); al cambiar de compañía
  cambia la lista.
- Given la vista, When la uso, Then **no** puedo crear reglas nuevas (la lógica
  vive en código).

### US17 — Activar/desactivar y ajustar peso de una regla `[siguiente]` (FR5.1)
Como **Administrador de Módulo**, quiero activar/desactivar una regla y ajustar
su peso, para el rollout por etapas.
- Given una regla, When la desactivo, Then deja de aplicar en el cálculo.
- Given una regla, When cambio su peso, Then el nuevo peso se usa en el score.

### US18 — Editar los parámetros de una regla `[siguiente]` (FR5.2)
Como **Administrador de Módulo**, quiero editar los parámetros de una regla
(días de T-1, horas de corte, umbral de inyección, patrón/prioridad/ventana de
cliente retira), sin tocar su lógica.
- Given una regla con parámetros, When los edito y guardo, Then se persisten;
  la **lógica/prompt no es editable** desde la UI.

---

## E6 — Simulador (configurador de simulaciones)

### US19 — Configurar una corrida en el modal previo `[siguiente]` (FR9.1, FR9.2)
Como **Responsable del OMS**, quiero elegir qué reglas activas y qué pedidos
entran a una simulación, para acotarla.
- Given el modal previo, When lo abro, Then vienen por defecto todas las reglas
  activas y puedo desmarcar/elegir un subconjunto.
- Given el modal previo, When filtro por situación (`DISP`, `GENERADA`…), Then la
  simulación aplica a ese conjunto — incluido **re-simular sobre prioridades ya
  asignadas**.

### US20 — Ver el resultado como tabla-Cola `[siguiente]` (FR9.3)
Como **Responsable del OMS**, quiero ver el resultado de la simulación como una
tabla igual que la Cola, para evaluarlo con todas las columnas.
- Given una simulación ejecutada, When se muestra, Then aparece como tabla con
  todas las columnas (o selección), no como un recuadro de "estado actual".

### US21 — Persistir la simulación (bitácora) `[siguiente]` (FR9.4)
Como **Responsable del OMS**, quiero que cada simulación quede registrada, para
tener trazabilidad.
- Given una simulación, When se ejecuta, Then se persiste con fecha, autor
  (usuario/automático), reglas usadas, filtro, estado (`simulada`/`aplicada`) y
  compañía.

### US22 — Restringir a una simulación aplicada por compañía `[siguiente]` (FR9.4)
Como **Responsable del OMS**, quiero que solo haya una simulación aplicada por
compañía, para evitar priorizaciones en conflicto.
- Given varias simulaciones `simuladas` de una compañía, When aplico una, Then
  queda como la **única `aplicada` de esa compañía** (la anterior deja de estarlo).

### US23 — Aplicar manual / automática / mixta `[siguiente]` (FR9.5)
Como **Responsable del OMS**, quiero elegir el modo de aplicación, para validar
manualmente al inicio y automatizar cuando confíe.
- Given modo manual, When reviso y pulso "Aplicar", Then la simulación se aplica.
- Given modo automático, When se genera, Then se aplica sola.
- Given modo **mixto** con **hora de corte**, When nadie interviene antes de esa
  hora, Then se aplica sola; When alguien interviene antes, Then espera su
  decisión. Borde: una intervención **en el minuto exacto** del corte se trata
  como "antes del corte" (gana la intervención).
- **UX (acción de alto impacto)**: Given que aplicar sustituye la simulación
  aplicada vigente de la compañía (US22), When pulso "Aplicar", Then se pide una
  confirmación explícita ("esto sustituye la priorización vigente de {compañía}").

### US24 — Configurar simulaciones por compañía `[siguiente]` (FR9.6)
Como **Administrador de Módulo**, quiero configurar el número de simulaciones al
día, su frecuencia/horarios, el filtro de situación y el modo por simulación,
para adaptarlo a cada compañía.
- Given la configuración de una compañía, When defino varias simulaciones (p. ej.
  una para `DISP` y otra para `DISP`/`GENERADA`) con sus horarios y modo, Then el
  sistema las programa por compañía.

---

## E7 — Panel y Auditoría

### US25 — Ver la salud del motor `[siguiente]` (FR11.1)
Como **Jefe de Almacén**, quiero un panel con indicadores operativos, para
detectar anomalías.
- Given el Panel, When lo abro, Then veo al menos: nº de pedidos generados hoy,
  % de override manual (ventana configurable, US26) y nº de pedidos en proceso
  (~capacidad); cada KPI con su valor del día.

### US26 — Indicador de % de override con ventana configurable `[siguiente]` (FR11.2)
Como **Jefe de Almacén**, quiero ver el % de override manual con una ventana
temporal configurable, no fija.
- Given el indicador, When cambio la ventana (24 h / 12 h / semana), Then el %
  se recalcula para esa ventana.

### US27 — Auditar priorizaciones auto/manual `[1ª entrega]` (FR11.3)
Como **Responsable del OMS**, quiero un registro de solo lectura de las
priorizaciones ejecutadas, distinguiendo automático vs. manual.
- Given priorizaciones ejecutadas, When abro la Auditoría, Then veo cada una con
  su tipo (automático/manual) y, en manual, el usuario y motivo.
- Given un registro de auditoría, When un usuario intenta editarlo o borrarlo,
  Then la acción se deniega (solo lectura, NFR6 — criterio negativo).

---

## E8 — Calendario de rutas `[RETIRADA por D5]`

> **Épica RETIRADA.** US28 (consultar calendario) y US29 (CRUD del calendario)
> se eliminan con el ruteo dinámico multi-fuente ("la ruta manda", D5): las rutas
> dejan de ser fijas, así que no hay un calendario de rutas que el OMS consulte o
> mantenga. Se conservan aquí solo como marca de deprecación; ver "Fuera de
> alcance". El rol **Operador de Despacho** que las sostenía sale del alcance.

---

## E9 — Multi-compañía (por scope) y seguridad

### US30 — Aislar datos por scope país→almacén→cliente `[siguiente]` (FR13, NFR5)
Como responsable de seguridad, quiero que las operaciones no crucen datos entre
scopes (país/almacén/cliente), para garantizar aislamiento.
- Given un usuario con un scope (país/almacén/cliente, o GLOBAL), When lee o
  escribe, Then solo afecta datos dentro de su scope (`user_scopes`, evaluado en
  el repositorio, fail-closed).
- Given un usuario "Operativo EPA" (scope=CUSTOMER EPA), When consulta, Then
  **nunca** obtiene datos de Cofersa (criterio negativo verificable).
- **Jerárquico (QA H3)**: Given un usuario scope=COUNTRY (p. ej. CR), When
  consulta, Then ve todos los almacenes/clientes de su país y **ninguno** de otro
  país (la cobertura cascada país→almacén→cliente).
- **GLOBAL (QA H3)**: Given un usuario scope=GLOBAL, When consulta, Then ve todas
  las compañías/países (caso positivo — fail-closed no es "deniega siempre").
- **fail-closed nulo (QA H3)**: Given un usuario **sin** scope (o scope
  indeterminado), When consulta, Then obtiene **0 filas** / se deniega (nunca
  "todo").

### US31 — Regla específica por scope `[siguiente]` (FR13.1)
Como **Sistema/Motor OMS**, aplico las reglas con **scope**
(CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL) en Lambdas compartidas por función, para
respetar la lógica particular de cada compañía/cliente sin una Lambda por
compañía.
- Given un pedido de un cliente (p. ej. Cofersa), When el motor corre, Then
  aplica las reglas cuyo scope cubre ese cliente/almacén/país (la más específica
  gana), evaluadas en la Lambda compartida — no en una Lambda por compañía
  (C3-SUPERSEDE).

### US32 — Niveles de acceso `[siguiente]` (FR14.1, FR14.2)
Como responsable de seguridad, quiero tres niveles de acceso (visualización,
operación, administración), para proteger las acciones sensibles.
- Given un usuario de nivel visualización, When intenta una acción de operación
  o administración, Then se deniega.

### US33 — Registrar el autor de cada escritura `[1ª entrega]` (FR14.3)
Como responsable de gobernanza, quiero que toda escritura registre quién la
hizo, para trazabilidad.
- Given una acción de escritura (override, cambio de regla, etc.), When se
  ejecuta, Then la Auditoría registra el identificador del usuario.

## Dependencias y supuestos (Open Questions, no son historias)

Estas Open Questions del `requirements.md` condicionan varias historias pero
**no se modelan como historias** (dependen de datos/arquitectura/cliente):

- OQ-2 (réplica `EFLOW_OLO` no existe) → habilita E1/E2 en producción.
- OQ-3 (Cofersa no envía la fecha de entrega) → afecta US7 (fallback por ruta).
- OQ-4 (tabla de prioridades del cliente) → afina US10.
- OQ-5 (score vs. filtro estricto; umbral de inyección) → afina US10/US11b.
- OQ-6 (duración de rutas y horas de corte) → habilita US8.
- OQ-7 (viaje cliente retira) → contexto de E3 (US13).
- OQ-8 (gap peso/volumen del handoff, `capacity_known:false`) → dependencia del
  handoff a Planificación (US9), no del cálculo de prioridad.
- OQ-1 (BD `logistica_olo`) → contexto general.

## Fuera de alcance (retirado en esta re-corrida)

- **E8 — Calendario de rutas (US28–US29), RETIRADA por D5.** Con el ruteo
  dinámico multi-fuente, las rutas dejan de ser fijas; el OMS ya no consulta ni
  mantiene un calendario de rutas. Se retira del cuerpo activo; el rol Operador
  de Despacho sale del alcance del OMS.
- **Armado de viajes / ruteo dinámico** — es de Planificación (intent
  `260825-route-planning-reqs`), no del OMS. Estas historias no lo modelan; solo
  citan la frontera del handoff (US9: Planificación lee la tabla del OMS).

### Nota: refined-mockups debe re-correrse alineado al modelo v3

`refined-mockups` (`mockups.md`) quedó desalineado. Al re-correrse debe
reconciliar: prioridad numérica invertida (no *tiers*); Motor de Reglas como
catálogo con **selector de scope** (no *rule builder*); Simulador con modal
previo + tabla-Cola; retirar la alerta "sincronización al lago"; **retirar toda
pantalla/rastro del Calendario de rutas** (E8 retirada). Se registra como
dependencia, no como historia.

Aportes de diseño del mob (a aterrizar en refined-mockups):
- **(D-1)** La ruta retirada del Calendario debe resolver a un **estado
  explicativo** ("el manejo de rutas se trasladó a Planificación"), no a un 404;
  retirar el ítem de navegación.
- **(D-2)** El detalle del pedido (US6) debe mostrar, **solo lectura**, la regla
  de ruta/corte aplicada (US7/US8) para que el override (US14) sea informado — sin
  reintroducir el calendario.
- **(D-4)** Selector de scope jerárquico: breadcrumb/pills del scope activo,
  herencia implícita visible, scope de un solo nivel como pill de solo lectura,
  navegable por teclado con `aria-label` de nivel.
- **(D-5)** Prioridad invertida **no dependiente solo del color** (número +
  etiqueta/ícono) y contraste AA.
- **(D-6/D-7)** Estados nuevos por la doble escritura (D6): **"handoff pendiente/
  desincronizado"** (si la escritura 2 al WMS falló tras la 1) y estado de handoff
  hacia Planificación (solo lectura, honesto si no hay dato). Posible historia de
  construcción, no de esta etapa.

Aportes de dominio/construcción del mob (a aterrizar en domain-design):
- **(dev/C2 — RESUELTO 2026-09-30)** La 1ª entrega **requiere construir el motor
  de priorización del OMS en Lambda (Python), NUEVO y propio del OMS, desde cero**:
  US9 escribe a Aurora + EFLOW, lo que el motor TS de frontend no puede hacer. El
  "esqueleto del motor de reglas propio del OMS en Lambda" es el **primer item** de
  la rebanada delgada, antes de US9. **C2 resuelto**: NO se porta el AST de
  `src/lib/tarifas/`, NO se comparte motor con el TMS, NO se toca Liquidaciones —
  "port TS→Python" y "regresión de Liquidaciones" quedan **fuera del alcance del
  OMS** (eliminados, no diferidos). OMS y TMS son módulos separados que se
  comunican.
- **(dev/US31)** La selección "la regla más específica gana" reusa la jerarquía de
  scopes (`covers()`) pero **aún no existe** en backend (hoy `covers()` resuelve
  autorización, no selección de regla) — es trabajo de domain-design/construcción.
- **(QA/US31)** Definir el **desempate de especificidad** cuando dos reglas están
  al mismo nivel de scope (determinista) — seguimiento para build-and-test.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  (v3, FR1–FR14 con FR12 retirado, NFR, Open Questions).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/personas.md`.
- `aidlc/spaces/default/memory/project.md` (`## Decided`: pivote D1–D6,
  C3-SUPERSEDE — invariantes del motor, Simulador-configurador, multi-compañía por
  scope, dos escrituras).
- `aidlc/spaces/default/codekb/sto_tms_olo/business-overview.md`,
  `component-inventory.md` — dominio y componentes reales (backend Python/SAM).

## Assumptions & Open Questions

Ver **Dependencias y supuestos** y **Fuera de alcance** arriba (mapea a
OQ-1..OQ-8 del `requirements.md` v3). La épica **E8/US28–US29 (Calendario de
rutas) queda RETIRADA** por D5. Las historias/reglas etiquetadas `[futuro]`
(Regla 4 viaje/bajada y Regla 5 inventario, que no generan historias propias) se
documentan pero no entran a construcción en este ciclo. La secuencia de
construcción priorizará la **rebanada delgada de las 2 reglas de 1ª entrega**
(T-1 + cliente retira/observaciones) — decisión de negocio a aplicar en
domain-design.
