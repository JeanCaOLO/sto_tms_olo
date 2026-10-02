# Team Assessment — TMS OLO

> Stage: `team-formation` (Ideation) · Bare-space, single-stage run (no active
> intent — this is the general, project-wide team/agent assessment the space
> itself asked for, not a per-module plan).
> Sources: `aidlc/spaces/default/knowledge/documents/CONTEXTO_PROYECTO_TMS.md`,
> the OMS meeting-note series (2026-08-26 → 2026-09-08), and this stage's own
> `project.md` "Decided" log (surfaced in `rules_content`, dated up to
> 2026-09-10). No `scope-document`/`intent-backlog` existed to consume — see
> `memory.md`.

## Team availability (development team, one module each)

| Person | Module / responsibility | AI tooling | Notes |
|---|---|---|---|
| **Jean Carlo** *(also "Giancarlos"/"Yanca")* | Liderazgo técnico, infraestructura, superusuario del sistema base | Claude + Kiro | Gestiona accesos/licencias del equipo, comparte prototipos base (clustering CR, estudio de costos CR). Mantiene el índice maestro de módulos con Justin. |
| **Justin** | Tracking (mobile + web) | Claude/Kiro (asumido) | Experto en apps móviles; prioridad MVP junto con Liquidación. |
| **Andrey** | RLS / Seguridad (transversal a todos los módulos) | Claude/Kiro | También participa en la parte web general. Ya armó una lista de agentes IA propuestos (§6 del contexto) pero quedó bloqueado esperando el mapeo de módulos de Ana — este documento puede servir de insumo para desbloquearlo. |
| **Dylan** | Liquidación / Tarifas + mapeo de rutas Venezuela | Claude/Kiro | Basado en Venezuela; no carga horas en Xtiming (excepción del equipo). Ya generó requerimientos funcionales + un primer prototipo. Prioridad MVP. |
| **Jesús** | Planificación de rutas/viajes | Claude/Kiro | Recibe de Jean Carlo el prototipo de clustering+Google Maps y coordenadas CR. Pendiente: research de costo/límite de la API de Google Maps. |
| **Eduardo** | OMS (satélite) | Kiro (licencia solicitada en Reunión 6; ya generó `kiro-oms-requirements.md`/`design.md` para Reunión 9-01/9-08) | Módulo más delicado del proyecto — ver `../../../../knowledge/documents/OMS_ESPECIFICACION_DETALLADA.md`. Su intent AI-DLC propio (`260826-modulo-oms`) ya está en Inception/`domain-design`. |

**Utilización/capacidad:** no hay datos de horas/semana ni de disponibilidad
porcentual en ninguna fuente disponible — **abierto**, ver Preguntas.

## Stakeholders / roles no-desarrollo (no cuentan para capacidad de build)

| Persona | Rol | Relevancia para formación de equipo |
|---|---|---|
| **Palencia** | Coordinación de negocio | Propuso el esquema "una persona por módulo"; coordina asignaciones, no tiene módulo de desarrollo propio. |
| **Ana** (Intelix) | PM / documentación | Centraliza documentación, reportes de avance, y **es quien debe confirmar el mapeo de módulos que tiene bloqueado a Andrey** (ver Preguntas). Lleva ~40 proyectos a la vez — candidata directa a un agente de roadmap/documentación. |
| **Ricardo** | Consultor externo (ex-logística Walmart) | Aporta reglas de negocio de Liquidación/Planificación — insumo, no ejecutor. |
| **Ignacio** | Stakeholder cliente Mayoreo | Pide flexibilidad en motor de reglas de cobro — insumo de negocio para Liquidación y (por analogía de patrón) OMS. |
| **Toño / Antonio** | Encargado de procesos CR | Referente clave y **bloqueante** para cerrar cuántos niveles de prioridad maneja el OMS (WMS/EPA/Cofersa/Mayoreo a homologar). |

## Módulos sin dueño asignado (huecos de capacidad, no de agentes)

`Devoluciones/Logística inversa`, `Guías de despacho`, `Mantenimiento de
flota`, `Backhaul`, `Contratos y documentos legales`, `Reportería`,
`Configuración`. Ninguno tiene desarrollador ni agente propio todavía — no se
propone un agente especializado para un módulo sin dueño humano (ver
`skill-matrix.md`).

## Competing initiatives / carga compartida

- **RLS/Seguridad (Andrey)** es transversal — compite por atención con *todos*
  los módulos en construcción activa (OMS, Planificación, Devoluciones per
  roadmap de la reunión del 26-ago-2026).
- **Jean Carlo** combina liderazgo técnico + infraestructura + superusuario —
  es el mayor punto único de carga/riesgo de bus-factor del equipo (ver
  `skill-matrix.md`).

## Time zones / ubicación

Costa Rica y Venezuela (Dylan explícitamente basado en Venezuela). Reunión
semanal 2:00 p.m. CR = 4:00 p.m. VE; seguimiento interno martes 9:00 a.m. hora
Venezuela. No hay más detalle de ubicación por persona — **abierto**.

## Recursos externos

Soporte de especialistas de Intelix (arquitectura, BD, aplicaciones,
seguridad) — asesoría, no ejecución directa. No hay AWS Professional Services
contratado que conste en las fuentes.

## Decisión de stack oficial (afecta directamente la capacidad requerida)

El `project.md` de este espacio registra (2026-09-03, ver `rules_content` de
esta misma etapa) que el **stack de construcción oficial** es AWS serverless +
**Python en Lambdas** (backend) + React (frontend) + PostgreSQL, desplegado
**exclusivamente por Intelix**, sobre un monorepo backend (`tms-back`, un
stack SAM por módulo) y un repo de frontend separado (`tms-front`). El código
actual sobre Supabase (y la migración a Aurora PostgreSQL hecha en esta misma
sesión de trabajo) es del **prototipo** (Readdy) — útil para validar UI y
reglas de negocio, pero **no es el target de construcción final**. Esto es
relevante para la formación de equipo: el equipo actual (React/TS, sin
Python) necesita o bien capacitación en Python/Lambda/SAM, o bien que Intelix
aporte ese perfil en la fase de Construcción — ver gap en `skill-matrix.md`.
