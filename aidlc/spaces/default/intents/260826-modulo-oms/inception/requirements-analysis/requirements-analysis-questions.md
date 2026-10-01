# Requirements Analysis — Preguntas de la re-corrida (pivote WMH, Módulo OMS)

> Intent: `260826-modulo-oms`. Etapa: Requirements Analysis (Inception,
> **re-corrida por el pivote de reemplazo del WMH**). El `requirements.md` v2
> (14 FR) es la **base a CORREGIR** (regla L2): se barre cada concepto que
> cambia en TODAS sus apariciones (FR, NFR, actores, glosario, restricciones,
> OQ), no solo el FR más obvio.
>
> Lo firme NO se re-pregunta: D1–D5 y C3 ya están en `project.md` `## Decided`.
> C1 (Python/SAM) y C3 (scope, no Lambda por compañía) ya se confirmaron contra
> el código. C2 (motor de reglas) se resuelve en domain-design. Estas preguntas
> son de **precisión de alcance** de la corrección. Responde en cada `[Answer]:`.

---

## Q1 — Alcance de la corrección (aplicar el pivote sobre la base)

¿Aplico las correcciones del pivote sobre el `requirements.md` v2 existente, sin
re-abrir lo firme?

- **A. (default)** Sí: tratar el v2 como base a corregir y aplicar
  quirúrgicamente: (1) **retirar FR12** (Calendario de rutas del OMS) y toda su
  huella (actores/glosario/OQ) por D5; (2) reencuadrar el posicionamiento de
  "reemplazo **progresivo** del WMH" a **"reemplazo desde la salida"** (D1/D2),
  citando `docs/wmh-actual/` como fuente de lo que se reemplaza; (3) marcar que
  el **rediseño del flujo** pedido→TMS→OMS→WMS **entra en alcance** (D4); (4)
  corregir el encabezado punto 6 de "Lambda por compañía" a **reglas con scope
  CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL** (C3-SUPERSEDE); (5) añadir la **jerarquía
  País→Almacén→Cliente→Cliente Final** como contexto de datos (02-to-be §2, ya
  implementada). Mantener intacto lo demás (T-1, score, IA, simulador, cola,
  auditoría, seguridad).
- **B.** Reescritura más amplia (revisar cada FR a fondo contra el 02-to-be y el
  WMH, no solo los tocados por el pivote).
- **X. Other (please specify)**

[Answer]: A

---

## Q2 — FR12 / Calendario de rutas: retirar o deprecar

D5 elimina el Calendario de Rutas del OMS (ruteo dinámico). ¿Cómo lo dejo en el
requirements?

- **A. (default)** **Retirar** FR12 del cuerpo de FR y moverlo a "Fuera de
  alcance" con una nota de deprecación (por qué se elimina: rutas dinámicas, "la
  ruta manda", D5), para conservar la trazabilidad histórica sin que siga siendo
  un requerimiento activo. La épica E8/US28–US29 se retira en user-stories (etapa
  siguiente).
- **B.** Borrar FR12 por completo (sin rastro).
- **X. Other (please specify)**

[Answer]: A

---

## Q3 — Reparto WMH → módulos (D2) en el requirements del OMS

D2 dice que las funciones del WMH se reparten entre OMS, Planificación y quizá un
tercer módulo. ¿Cuánto de ese reparto entra en ESTE requirements (del OMS)?

- **A. (default)** Solo lo del **OMS** (priorización/alistamiento del pedido: el
  ciclo de la Figura 7 — ingreso→enriquecimiento→reglas→priorización→handoff a
  Planificación→auditoría). Lo de **Planificación** (armado de viajes, "Nuevo
  Viaje" del WMH, ruteo dinámico) es del intent `260825-route-planning-reqs`
  (Fase 3), no de este requirements. Se cita la frontera OMS↔Planificación
  (el OMS deja "alistado"; Planificación arma el viaje) sin absorber sus FR.
- **B.** Incluir aquí también los requerimientos de Planificación.
- **X. Other (please specify)**

[Answer]: A — Planificación va a su intent 260825-route-planning-reqs (Fase 3); aquí solo se cita la frontera del handoff (el OMS deja el pedido en situación=generada; Planificación arma el viaje) sin absorber sus FR.

---

## Q4 — Jerarquía País→Almacén→Cliente→Cliente Final en el OMS

La jerarquía ya está implementada (módulo `context`). ¿Cómo la reflejo?

- **A. (default)** Como **contexto de datos y aislamiento** (multi-tenancy por
  scope) que el OMS consume: la Cola, el maestro de compañías y el filtro de la
  UI operan sobre esa jerarquía; los pedidos se aíslan por país/almacén/cliente.
  No la convierto en un FR de CRUD de la jerarquía (eso es del módulo context/
  catálogos, no del OMS). Actualiza FR10 (cola/filtros) y FR13 (multi-compañía)
  para hablar de scope país→almacén→cliente en vez de solo "compañía".
- **X. Other (please specify)**

[Answer]: A

---

## Q5 — §13 nada nuevo / seguir

¿Algo más que deba capturar la re-corrida antes de generar el requirements
corregido?

- **A. (default)** No; proceder a generar el `requirements.md` corregido con lo
  de Q1–Q4 y presentarlo en el gate.
- **X. Other (please specify)**

[Answer]: A

[Answer]:

---

## Assumptions & Open Questions

- Las OQ del v2 se mantienen salvo las ligadas a FR12 (calendario): réplica
  `EFLOW_OLO` inexistente, fecha de Cofersa, tabla de prioridades del cliente,
  score-vs-filtro/umbral, cortes/duración de rutas, viaje cliente retira, BD no
  oficial. Se añade el gap peso/volumen (`capacity_known:false`) como dependencia
  del handoff a Planificación.
- C2 (motor de reglas: portar AST TS→Python vs. motor nuevo) NO se decide aquí;
  es de domain-design.

## Consolidated Summary Confirmation

Resumen del requirements.md v3 (re-corrida por el pivote WMH), confirmado en
conversación: reemplazo del WMH desde la salida (D1); FR12 y rol Operador de
Despacho retirados, E8/US28–US29 fuera (D5); multi-compañía por scope
CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL en Lambdas compartidas (C3-SUPERSEDE); rediseño
del flujo en alcance (D4); stack Python/Lambdas confirmado (C1); flujo de dos
escrituras OMS→Planificación con tabla de pedidos propia del OMS como superficie
de handoff (D6). C2 (motor de reglas compartido OMS+TMS) diferido a domain-design;
OQ-8 (gap peso/volumen) abierta. Petición de secuencia anotada: rebanada delgada
de las 2 reglas de 1ª entrega en domain-design. Sensores: required-sections PASS,
upstream-coverage PASS.

[Answer]: Looks correct
