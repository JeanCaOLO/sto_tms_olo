# Historias de usuario — Módulo OMS

> Intent: `260826-modulo-oms`. Etapa: User Stories (Inception). Derivadas del
> `requirements.md` v2 (14 FR) y de las decisiones firmes de `project.md`.
> Formato Given/When/Then (BDD). Cada historia traza a su(s) FR y lleva una
> **etiqueta de entrega**: `[1ª entrega]`, `[siguiente]` o `[futuro]`.
> Actores en `personas.md` (P1–P6).

## Story map (épicas)

| Épica | Historias | FR cubiertos |
|---|---|---|
| E1 — Cola de Priorización | US1–US6 | FR1, FR10 |
| E2 — Motor de priorización (automático) | US7–US11 | FR2, FR3, FR6, FR8 |
| E3 — Análisis de observaciones con IA | US12–US13 | FR6.2, FR6.3, FR7 |
| E4 — Override manual | US14–US15 | FR4 |
| E5 — Motor de Reglas (catálogo) | US16–US18 | FR5, FR6 |
| E6 — Simulador (configurador) | US19–US24 | FR9 |
| E7 — Panel y Auditoría | US25–US27 | FR11 |
| E8 — Calendario de rutas | US28–US29 | FR12 |
| E9 — Multi-compañía y seguridad | US30–US33 | FR13, FR14 |

---

## E1 — Cola de Priorización

### US1 — Ver la cola de pedidos a priorizar `[1ª entrega]` (FR1, FR10)
Como **Responsable del OMS**, quiero ver los pedidos candidatos a priorizar,
para gestionar el alistamiento del día.
- Given pedidos en `expedición_cabecera` con `fecha_de_cierre IS NULL` y
  `situación = DISP` sin `NUMEROVIAJEWMH`, When abro la Cola, Then veo esos
  pedidos y no los que ya están en `almacén_movimiento_carcam`.
- Given la Cola recién abierta, When carga, Then el filtro de situación entra
  por defecto en `DISP`.

### US2 — Filtrar la cola `[1ª entrega]` (FR10.1, FR10.2)
Como **Responsable del OMS**, quiero filtrar por situación, almacén y compañía,
para acotar lo que veo.
- Given la Cola, When cambio el filtro de situación a `GENERADA`, Then veo los
  pedidos ya generados.
- Given una compañía con varios almacenes, When selecciono un almacén, Then la
  cola muestra solo ese almacén.

### US3 — Seleccionar/alternar compañía en la vista `[siguiente]` (FR10.2, FR13.2)
Como **Responsable del OMS**, quiero alternar de compañía dentro de la misma
vista (sin cambiar de perfil), para operar varias compañías.
- Given un perfil con acceso a varias compañías, When selecciono otra compañía,
  Then la cola muestra sus pedidos sin cambiar de perfil.

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

---

## E2 — Motor de priorización (automático)

### US7 — Calcular cuándo preparar por fecha (T-1) `[1ª entrega]` (FR2)
Como **Sistema/Motor OMS**, calculo si un pedido debe prepararse hoy según su
fecha de entrega, para alistar en el momento correcto.
- Given un pedido con `fecha de expedición planificada` = mañana, When el motor
  corre hoy y hoy es su T-1, Then lo marca para preparar hoy.
- Given ese cálculo, When el motor actúa, Then **no escribe ninguna fecha**
  (invariante): la `fecha de expedición planificada` queda intacta.

### US8 — Respetar horas de corte `[siguiente]` (FR2.3)
Como **Sistema/Motor OMS**, aplico las horas de corte de la ruta, para no
adelantar ni atrasar el alistamiento.
- Given un pedido que entra después del corte de su ruta, When el motor lo
  evalúa, Then rueda al siguiente evento de esa ruta.

### US9 — Generar el pedido (DISP → GENERADA) `[1ª entrega]` (FR2.4, FR8)
Como **Sistema/Motor OMS**, cambio la situación del pedido a `GENERADA` cuando
la regla se cumple, para mandarlo a preparar.
- Given un pedido `DISP` cuya regla T-1 se cumple, When el motor lo procesa,
  Then su transición es **`DISP` → `GENERADA`** y se asigna su prioridad.
- Given un pedido cuya regla no se cumple, When el motor lo procesa, Then no
  cambia su situación (no lo genera todavía).
- Given cualquier escritura del motor, When actúa, Then escribe **solo** a nivel
  WMS/EFLOW (no WMH, no intermedias) — invariante.

### US10 — Asignar prioridad numérica con score `[1ª entrega]` (FR3)
Como **Sistema/Motor OMS**, asigno una prioridad numérica invertida calculada
por score ponderado, para ordenar el alistamiento.
- Given las reglas activas que aplican a un pedido, When el motor calcula, Then
  la prioridad es un **número invertido** (menor = más urgente) resultado del
  **score ponderado** (suma de pesos; mayor peso = cliente retira, luego fecha).
- Given dos pedidos, When uno tiene prioridad 1 y otro 2, Then el 1 se atiende
  antes.

### US11 — Revisitar prioridades periódicamente `[siguiente]` (FR3.3, NFR1)
Como **Sistema/Motor OMS**, corro al menos una vez al día y en las horas de
corte, para actualizar prioridades según la capacidad.
- Given pedidos no alcanzados hoy, When el motor corre al día siguiente, Then
  suben de prioridad.

---

## E3 — Análisis de observaciones con IA

### US12 — Interpretar observaciones con IA `[siguiente]` (FR6.2, FR7)
Como **Sistema/Motor OMS**, interpreto el texto libre de `observaciones` con un
modelo de IA (Amazon Bedrock), para no depender de que un humano lea 400–500/día.
- Given un pedido con observación en texto libre, When el motor la procesa, Then
  el modelo la clasifica y dispara la acción correspondiente.
- Given el diseño, When se ejecuta, Then el **prompt vive en la Lambda** y no es
  editable desde la UI.

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

### US15 — Impedir override sin permiso `[1ª entrega]` (FR4.3, FR14)
Como responsable de seguridad, quiero que solo roles autorizados hagan override,
para proteger el cálculo.
- Given un usuario sin permiso de override, When intenta alterar la prioridad,
  Then la acción se deniega.

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
  decisión.

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
- Given el Panel, When lo abro, Then veo los KPIs de la operación del día.

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

---

## E8 — Calendario de rutas

### US28 — Consultar el calendario de rutas `[siguiente]` (FR12)
Como **Operador de Despacho**, quiero consultar el calendario de rutas y días de
despacho por compañía, para saber cuándo despacha cada ruta.
- Given una compañía/país, When abro el calendario, Then veo sus rutas y días de
  salida.

### US29 — Mantener el calendario (CRUD gated) `[futuro]` (FR12.1)
Como **Operador de Despacho** (rol administrador), quiero mantener el calendario
en el OMS, entendiendo que su **fuente de verdad es el TMS**.
- Given permiso de administrador, When creo/edito/desactivo una ruta, Then se
  persiste; la implementación de la UI de alta queda diferida (ver OQ/Decided).

---

## E9 — Multi-compañía y seguridad

### US30 — Aislar datos por compañía/país `[siguiente]` (FR13, NFR5)
Como responsable de seguridad, quiero que las operaciones no crucen datos entre
compañías/países, para garantizar aislamiento.
- Given un usuario operando en una compañía, When lee o escribe, Then solo
  afecta datos de esa compañía/país (columnas `compañía`/`país`).

### US31 — Regla específica por compañía `[siguiente]` (FR13.1)
Como **Sistema/Motor OMS**, aplico la Lambda de reglas específica de la compañía
del pedido, para respetar su lógica particular.
- Given un pedido de una compañía, When el motor corre, Then usa la Lambda de esa
  compañía (la regla identifica su compañía).

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
- OQ-5 (score vs. filtro estricto; umbral de inyección) → afina US10/US9.
- OQ-6 (duración de rutas y horas de corte) → habilita US8.
- OQ-1 (BD `logistica_olo`) y OQ-7 (viaje cliente retira) → contexto de E6/E8.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  (FR1–FR14, NFR, Open Questions).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/personas.md`
  (P1–P6).
- `aidlc/spaces/default/memory/project.md` (`## Decided`: invariantes del motor,
  Simulador-configurador, multi-compañía).
- `aidlc/spaces/default/codekb/sto_tms_olo/business-overview.md`,
  `component-inventory.md` — dominio y componentes existentes.

## Assumptions & Open Questions

Ver la sección **Dependencias y supuestos** arriba (mapea a OQ-1..OQ-7 del
`requirements.md`). Las historias etiquetadas `[futuro]` (US29 alta de
calendario; Regla 4 viaje/bajada y Regla 5 inventario, que no generan historias
propias por estar fuera de alcance) se documentan pero no entran a construcción
en este ciclo.
