# Project-Level Rules

> Project-specific specialisation and corrections. Loaded after `org.md` and
> `team.md` as strict-additive guidance; contradictions with broader policy
> are rejected. Populated by practices-discovery and the self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project needs stable, durable guidance beyond the
> team practice (for example, package-specific release checks or an additional
> regression suite for a legacy component).

## Way of Working

<!-- Project-specific specialisation. Example: -->
<!-- This monorepo requires package-scoped branch names and a package owner -->
<!-- review in addition to the team's normal merge policy. -->

## Walking Skeleton

<!-- Project-specific specialisation. Example: -->
<!-- The walking skeleton must exercise the legacy service adapter as well -->
<!-- as the new service boundary. -->

## Testing Posture

<!-- Project-specific specialisation. -->
- La lógica de negocio (en especial el cálculo de prioridad del OMS) debe extraerse a módulos `.ts` puros, fuera de los componentes `.tsx` de página, para que sea probable sin montar React (learned 2026-08-28)

## Deployment

<!-- Project-specific specialisation. -->

## Code Style

<!-- Project-specific specialisation. -->
- ALWAYS endurecer el tipado en el subárbol del OMS antes de tocar el cálculo de prioridad: activar `strictNullChecks` localmente para ese código, aunque el `tsconfig.app.json` global tenga `strict: false` (learned 2026-08-28)

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->
- DECIDED: El cálculo de prioridad del OMS es 100 % automático (motor de reglas). La única intervención humana permitida es que el rol Responsable del OMS altere la prioridad de un pedido puntual. NO existe ningún paso de aprobación humana (ni de Jefe de Almacén ni de ningún otro rol) antes del alistamiento, porque detendría el flujo automático. Fuente vigente: Adenda del 2026-08-26 (`knowledge/documents/2026-08-26-reunion-oms-roles.md`). (Stage reverse-engineering, 2026-08-28)
- DECIDED: Las prioridades del OMS son NUMÉRICAS (deben hacer match con el WMS; menor número = mayor prioridad — prioridad 1 va antes que 2 y antes que 50), NO niveles nombrados (crítico/alto/medio/bajo). EPA y Cofersa usan 2 prioridades. Contradice el modelo `priority_tier` de `requirements.md` y los mockups: corregir al re-correr requerimientos. Fuente: `knowledge/documents/2026-09-01-reunion-oms-revision-mockup.md`. (2026-09-02)
- DECIDED: La fuente de verdad del calendario de rutas es el TMS (módulo de rutas), NO el OMS; el OMS lo CONSUME. Se mantiene el CRUD en el OMS gated a rol administrador. El calendario es POR CLIENTE (EPA, Cofersa…) y responde a acuerdos Olo↔cliente con implicación tarifaria. Ajusta el supuesto de `PLAN_MODULO_OMS.md` §5 de que el OMS es dueño del calendario. Fuente: reunión de revisión del mockup (2026-09-02). (2026-09-02)
- DECIDED: El stack de construcción del TMS/OMS es OFICIAL y es el estándar Intelix: AWS (serverless), Python + Lambdas (backend), React (frontend), PostgreSQL, arquitectura por eventos, plantillas SAM; los despliegues los hace EXCLUSIVAMENTE Intelix. El código actual sobre Supabase es del prototipo (Readdy) y NO es el target — la construcción va sobre este stack. Ref: `Estandares_Desarrollo_AWS_Intelix.md` y `knowledge/documents/2026-09-02-reunion-portafolio-suite-repos-bd.md`. (2026-09-03)
- DECIDED (parcial/pendiente): multi-país + multi-compañía (CR: Cofersa/EPA/comercializadora; VE: Beval/Febeca…) sobre una arquitectura de BD PostgreSQL cuya forma exacta sigue ABIERTA (mismas tablas con ID vs. esquema por compañía vs. BD por compañía). Recomendación técnica del asistente: esquema por compañía en una BD compartida (ver `knowledge/documents/2026-09-02-reunion-portafolio-suite-repos-bd.md`). NO es oficial: decidir con más análisis. (2026-09-03)
- DECIDED: El TMS es UN solo sistema con módulos interdependientes que comparten un NÚCLEO de datos (pedido, ruta, chofer, camión). El OMS CONSUME ese núcleo; sus tablas PROPIAS son `route_dispatch_schedule`, `order_priority_*` y el motor de prioridad. Distinguir "núcleo compartido" vs. "propio del OMS" es clave para el Domain Design. Fuente: `knowledge/documents/2026-09-03-reunion-arquitectura-repos-javier.md`. (2026-09-04)
- DECIDED (arquitectura de repos, contexto de construcción): backend en MONOREPO (`tms-back`) con un stack SAM por módulo + despliegue selectivo por ruta + proyecto `common-services` (API Gateway compartido, Secrets, EventBridge, RDS, núcleo). Frontend en repo APARTE (`tms-front`, SPA React → Amplify desde GitLab; CodeCommit ya no es necesario). SOLO Intelix despliega. El cliente ve todo el TMS pero NO otros proyectos de OLO (aislamiento por subgrupo de GitLab, no entre módulos del TMS). La Suite OLO queda FUERA del alcance inicial. (2026-09-04)
- DECIDED (alcance del OMS): el OMS TERMINA EN "ALISTADO" (deja el pedido listo para picking cambiando la situación a "generada"). La CREACIÓN del viaje es del TMS/Planificación, NO del OMS; el OMS consume el viaje ya abierto por el TMS y le asigna el pedido + bajada + prioridad. Picking, guía de carga y ruteo de entrega quedan FUERA (WMS y TMS). Fuente: `knowledge/documents/2026-09-08-reunion-funcional-oms-reglas-priorizacion-antonio.md`. (2026-09-10)
- DECIDED (mecánica del OMS): el OMS NO escribe fechas. Lee la `fecha de expedición planificada` (la fecha de ENTREGA que envía el cliente) como INSUMO y NO la modifica; NO existe un campo "fecha de alisto". Su acción es cambiar `estado=disponible` + `situación=generada` (+ la prioridad del día). "Con la fecha se DECIDE; con el estado/situación se EJECUTA". La `fecha de generación` de EPRAC cambia sola al generar. (Reunión funcional Antonio 2026-09-08). (2026-09-10)
- DECIDED (fuente de datos): los pedidos salen del WMS/EFLOW (BD `EFLOW_OLO`, producción CR), cruzando `expedición_cabecera` + `expedición_detalle` + `almacén_movimiento_carga_camión` por la clave `pedido + almacén + compañía + sucursal` (cabecera = ruta/fecha_expedición_planificada/observaciones/estado/situación; carga_camión = trabajado/cerrado `fecha_de_cierre` y nº de viaje WMS). `assignment_date` de `Journey Orders` es a nivel de VIAJE, no de pedido. La RÉPLICA de `EFLOW_OLO` (CR) AÚN NO EXISTE (hay que solicitarla). Nombres de tablas/campos `[verificar]`. Fuente: `knowledge/documents/2026-09-07-reuniones-oms-origen-datos-pedidos.md`. (2026-09-10)
- DECIDED (prioridad, refina el DECIDED de prioridades numéricas): la prioridad va ATADA A LA FECHA DE DESPACHO — regla T-1 (listo = entrega − 1, ajustada por duración de ruta y horas de corte). Numérica invertida (menor número = mayor prioridad); idealmente ~2 prioridades/día (lo de mañana + cliente retira). (Reunión funcional Antonio 2026-09-08). (2026-09-10)
- DECIDED (reglas y alcance de entrega): 5 MACRO-REGLAS: (1) cálculo de fecha, (2) análisis de observaciones (texto libre: dirección/fecha/urgencia/cita, sin estándar), (3) cliente retira (subconjunto de observaciones → prioridad más alta + viaje/cliente dummy), (4) asignación de viaje/bajada (el viaje lo abre el TMS), (5) inventario/capacidad (futuro, "carta al niño"). PRIMERA ENTREGA = 2 reglas: generación automática por fecha + cliente retira/observaciones. (Reunión funcional Antonio 2026-09-08). (2026-09-10)
- DECIDED (vista Motor de Reglas): NO es un constructor DINÁMICO de reglas desde la UI (las reglas son complejas y específicas → su lógica va en CÓDIGO). La vista es un CATÁLOGO SEMI-CONFIGURABLE: lista de reglas (nombre, descripción) con activar/desactivar, peso/score, parámetros editables (T-1, cortes, umbral de inyección, prioridad de cliente retira) y configuración por compañía; aloja además la tabla de prioridades y el override manual. (2026-09-10)
- DECIDED (facturación/despacho): son reglas del TMS y POR COMPAÑÍA (Cofersa/mayoreo factura; EPA/terceros no). Un pedido no se despacha sin estar facturado; la guía la genera el TMS. Fuera del núcleo del OMS. (Reunión funcional Antonio 2026-09-08). (2026-09-10)
- DECIDED (ABIERTO — decisión de alcance mayor, NO cerrada): falta decidir si el OMS AUTOMATIZA EL FLUJO ACTUAL (hace los "clics" de la torre de control: lee `DIS/DIS` del WMS y escribe el estatus en el WMH) o si se REDISEÑA el flujo (pedido → TMS → OMS → WMS, sin que el WMS vea nada no validado). Antonio empuja el rediseño. En etapa 1 el WMH NO se puede quitar (es quien dispara las tareas de picking). Otros pendientes: Cofersa no envía la fecha de entrega (la llena por default); score ponderado vs. filtro; tabla de prioridades del cliente. (2026-09-10)

## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: NEVER [behavior] (affirmed [date]) -->
<!-- Example: NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->

## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->

## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
- NEVER tratar como vigente el paso de aprobación humana de la propuesta de priorización del OMS: `CONTEXTO_PROYECTO_TMS.md` §2.4 y `PLAN_MODULO_OMS.md` §7.0 están DESACTUALIZADOS en ese punto y quedan superados por la Adenda del 2026-08-26 (cálculo 100 % automático, sin aprobación). No reintroducir ese requisito ni preguntarlo de nuevo (learned 2026-08-28)
- ALWAYS al reescribir requerimientos a partir de una matriz previa (p. ej. la generada con Kiro), tratarla como base a CORREGIR, no a repetir: verificar cada aparición del concepto eliminado o corregido en TODOS los FR/NFR/roles/glosario/triggers, no solo en el requerimiento más obvio (learned 2026-08-28)
- ALWAYS al maquetar un módulo nuevo sobre un sistema existente, mapear cada componente al design system real del repo (`src/components/base/*`, `src/components/feature/*`) antes de inventar; lo que falte se construye como wrapper en `shared/`, nunca como kit de UI nuevo (learned 2026-08-28)
- ALWAYS la ventana de tiempo del indicador "% override manual" del Panel OMS debe ser CONFIGURABLE (filtro de horas: 24h/12h/semana), no fija; retener datos de métricas ~3–5 meses (learned 2026-09-02)
- ALWAYS en la Cola de Priorización, el detalle del pedido va en un MODAL (no panel lateral), para que la fila use todo el ancho — el WMS trae muchas columnas (learned 2026-09-02)
- NEVER modelar el "Motor de Reglas" del OMS como constructor dinámico de reglas desde la interfaz: las reglas son demasiado complejas/específicas y su lógica va en CÓDIGO; la vista es solo un catálogo semi-configurable (on/off, peso/score, parámetros, por compañía) (learned 2026-09-10)
- NEVER asumir que el OMS calcula o escribe una "fecha de alisto": ese campo NO existe. El OMS usa la fecha de entrega como criterio de decisión (no la modifica) y actúa cambiando `estado`/`situación` + prioridad (learned 2026-09-10)
- ALWAYS recordar que la creación del VIAJE es del TMS/Planificación, no del OMS: el OMS consume el viaje ya abierto y termina en "alistado" (no hace picking, guía de carga ni ruteo de entrega) (learned 2026-09-10)
- Los hooks de AI-DLC están instalados pero NO conectados en .claude/settings.json (decisión de equipo, ver docs/work/2026-08/2026-08-24-install-aidlc-workflows.md). Consecuencia: HUMAN_TURN no se registra y los checkpoints/gates quedan irresolubles. Correr los comandos aidlc con AIDLC_SKIP_HUMAN_PRESENCE_GUARD=1 (ya en settings.local.json env), y compilar runtime-graph.json a mano con `bun .claude/tools/aidlc-runtime.ts compile` cuando un comando lo reclame. (learned 2026-08-31) <!-- cid:260831-devoluciones-pickups:intent-capture:f48547392b69b5ac03c094513d7a5a5b9fe9c2f889afb8e0cbd972993178f4c7 -->
- En domain-design sobre código existente (brownfield), verificar la dirección real de los imports/llamadas en el código antes de declarar `depends_on`/`dependents` — no asumirla por el nombre del componente. Ej. FR16: `capacity-fit.ts` orquesta `optimize-stops.ts`, no al revés. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:domain-design:c516f4c13967d19234429c9ff8e31d05493d3e04473901ff066c6b9e1594f5fc -->
- En units-generation, cuando la etapa User Stories está saltada, el sensor `traceability` reporta `invalid_targets`/`gaps` porque su chequeo de story-map solo casa IDs `US`, no `FR`. Es un falso positivo y el sensor es advisory (no bloquea). Poblar el story-map y `traceability.json` con IDs `FR` y continuar. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:units-generation:bc57cc91c53c698c4b79da352ab696edc28d7043cd70f642b0413fbce7d69a4d -->
- En functional-design de una unidad `kind: ui`: aunque `produces_kinds` no lista `rules` para ui, crear igualmente `rules.md` con el bloque `yaml` de reglas `BRx.y` — el sensor `traceability` busca los BR IDs en `rules.md` y falla (`invalid_targets: target BRx.y is absent from rules.md`) si el archivo no existe. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:functional-design:a02023d7d6ef6f5ebe2eadbfde596d10f21ef8eed8fe0018449e0a3992c1700f -->
- Si `aidlc-orchestrate.ts next` falla con "The directive could not be published", correr `bun .claude/tools/aidlc-utility.ts doctor` — puede haber un active-directive lock trabado (dead-owner). Si doctor lo reporta "not cleared — the lock owner changed during diagnosis" repetidamente (carrera en el auto-reparador), borrarlo a mano: `rm -rf <record>/.aidlc-active-directive.lock/` (confirmar antes que el pid del owner.json esté muerto), luego reintentar `next`. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:code-generation:a996fbc6f52ec3ffbb2998b05a6c6980d4b400cf84ebb26fa302a9da670909db -->
- En code-generation, antes de dispatchear la revisión, escribir `<record>/construction/<unit>/code-generation/source-manifest.json` (`{stage, unit, version:1, writes:[{path},...]}` con cada archivo de código de aplicación tocado) — el reviewer lo exige y el developer-agent no lo genera solo. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:code-generation:39dc1a14c36d1dfd5ee6b6391ca65bac96b30c70718b2d7c8bd61acbc05a020e -->
