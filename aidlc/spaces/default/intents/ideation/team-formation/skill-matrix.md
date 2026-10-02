# Skill Matrix & Gap Analysis — TMS OLO

> Companion to `team-assessment.md`. "Requerido" columns reflect the official
> stack decision recorded in `project.md` (AWS serverless, Python/Lambda
> backend, React frontend, PostgreSQL, SAM, deploy exclusivo Intelix) plus
> what each module's own documentation demands. "Disponible" reflects what
> each person is actually doing today per `CONTEXTO_PROYECTO_TMS.md`.

## Por persona

| Skill | Jean Carlo | Justin | Andrey | Dylan | Jesús | Eduardo |
|---|---|---|---|---|---|---|
| React/TypeScript (frontend actual) | ✅ | ✅ (+ mobile) | ✅ | ✅ | ✅ | ✅ |
| Python (backend oficial) | — | — | — | — | — | — |
| AWS Lambda / SAM / serverless | Parcial (infra) | — | — | — | — | — |
| PostgreSQL / diseño de esquema | ✅ (crea tablas vía agente Claude) | — | Parcial (RLS) | Parcial (tarifario) | — | Parcial (`route_dispatch_schedule` propuesto) |
| RLS / seguridad / JWT | Parcial | — | ✅ (dueño) | — | — | — |
| Reglas de negocio de dominio | Transversal | Tracking | — | ✅ Liquidación | Planificación (clustering, Google Maps) | ✅ OMS (priorización) |
| Mobile (apps) | — | ✅ | — | — | — | — |
| Motor de reglas configurable (rule engine) | — | — | — | Necesario (Ignacio/Mayoreo) | — | Necesario — **mismo patrón que Dylan, no construir dos veces (ver abajo)** |
| Integraciones externas (EPRAC, WMS/EFLOW) | ✅ (mapa de flujo) | — | — | — | — | Necesario (réplica `EFLOW_OLO` aún no existe) |

Leyenda: ✅ tiene el skill hoy · Parcial = lo toca pero no es su especialidad ·
— = no consta que lo tenga.

## Gaps críticos (bloquean o retrasan Construcción)

1. **Python/Lambda/SAM — brecha de todo el equipo.** El stack oficial de
   construcción (no el prototipo) es Python serverless; el equipo actual es
   100% React/TypeScript. Ningún documento fuente registra capacitación
   planificada. **Recomendación:** o Intelix aporta el perfil backend Python
   para la fase de Construcción (ya está previsto que Intelix sea quien
   despliega), o se capacita a 1-2 personas del equipo actual antes de
   `code-generation` en cualquier módulo — decisión de Jean Carlo/Palencia.
2. **Motor de reglas configurable duplicado en riesgo.** `PLAN_MODULO_OMS.md`
   §1 ya señala que Dylan (Liquidación) y Eduardo (OMS) necesitan
   conceptualmente el mismo patrón de "rule builder" — pero el `project.md`
   "Decided" (2026-09-10) aclara que para el OMS **no es un builder dinámico
   en UI, la lógica va en código** (catálogo semi-configurable, no reglas
   libres). Esto puede o no aplicar igual a Liquidación — **sin confirmar**,
   riesgo de que Dylan y Eduardo construyan dos soluciones distintas al mismo
   problema si nadie lo arbitra. Candidato claro para el agente de
   arquitectura propuesto en `CONTEXTO_PROYECTO_TMS.md` §6.
3. **Bus factor en Jean Carlo.** Única persona con visión de infraestructura +
   superusuario + dueño del flujo de datos completo. Ningún backup
   identificado. Mitigación natural: el diagrama de flujo de datos que Jean
   Carlo ya se comprometió a mantener (§3 del contexto) debería vivir en el
   repo de documentación compartido, no solo en su cabeza.
4. **RLS/seguridad sin bloqueos resueltos.** Andrey lleva bloqueado desde la
   Reunión 7 esperando el mapeo de módulos de Ana para poder entregar la lista
   de agentes — este mismo documento + `team-assessment.md` puede servir de
   insumo directo para desbloquearlo (con la salvedad de que el mapeo
   "oficial" sigue siendo de Ana, no de este documento).
5. **Integración EFLOW/WMS para el OMS no tiene datos reales todavía.** La
   réplica de `EFLOW_OLO` (CR) que el OMS necesita como fuente de pedidos
   "AÚN NO EXISTE" (`project.md`, 2026-09-10) — es un prerequisito de
   infraestructura, no de habilidad de equipo, pero bloquea igual el avance
   real de Eduardo más allá de datos mock.

## Skills sobrantes / bien cubiertos

- React/TypeScript del prototipo: cubierto por todo el equipo, reutilizable
  como base de UI/UX aunque el backend final cambie a Python.
- PostgreSQL: cubierto operativamente (esta misma sesión de trabajo llevó la
  base real de Supabase a Aurora PostgreSQL en AWS con esquema, migraciones y
  una API propia) — ver `../../../../../server/tms-schema.mjs` y
  `../../../../../server/tms-relations.mjs` como referencia de patrón, aunque
  el target final de Construcción sea Python/Lambda y no Node/Express.

## Agentes IA — huecos que el framework AI-DLC no cubre

`CONTEXTO_PROYECTO_TMS.md` §6 ya identificó (Reunión 6-7) que parte de la
documentación que se pensaba cubrir con agentes custom ya la genera
automáticamente AI-DLC — el trabajo pendiente es identificar **qué no cubre**:

| Agente propuesto (Reunión 6) | ¿Lo cubre AI-DLC hoy? | Estado real |
|---|---|---|
| Revisión de código (estándares) | Parcial — sensors + reviewer agents | Ya existía antes de AI-DLC, mantenerlo |
| Contexto del proyecto | Sí — `aidlc-knowledge` + este mismo espacio | Ya existía, ahora vive también en DocumentKB |
| Consistencia visual (tipografía, look & feel) | No | "En construcción" a la fecha de la Reunión 6 — seguía pendiente |
| Documentación/roadmap (para Ana) | Parcial — `aidlc-outcomes-pack`/`aidlc-session-cost` dan métricas, pero no un roadmap de portafolio de ~40 proyectos | Ana sigue sin agente propio |
| RLS/seguridad (Andrey) | No — AI-DLC tiene un `aidlc-compliance-agent` genérico, no un especialista en el modelo RLS específico de este TMS | Hueco real |
| Base de datos | Parcial — esta sesión demostró el patrón (esquema + migraciones vía Claude, todo por PR) pero no quedó como un agente reutilizable | Hueco — se puede formalizar |
| Arquitectura/infraestructura | Sí, parcial — `aidlc-architect-agent` + `aidlc-aws-platform-agent` genéricos | Cubierto en principio, falta especializarlo al stack Python/SAM de este proyecto |
| Roadmap (para Ana, ~40 proyectos) | No | Hueco real — fuera del alcance de un solo proyecto AI-DLC |
| Agente por módulo (ej. Dylan/Liquidación) | No — los 14 agentes de AI-DLC son roles de ciclo de vida (product/architect/developer...), no especialistas de dominio de negocio | Hueco real y el más importante para el OMS (ver abajo) |

**El más urgente: un agente especialista de OMS.** Dado que el OMS es "el
módulo más delicado" (instrucción explícita para esta corrida) y que su
gobernanza cambió de dirección a media construcción (aprobación humana → 100%
automático, ver `OMS_ESPECIFICACION_DETALLADA.md` §2), un agente que cargue
siempre esa corrección y el resto de los "Decided" del `project.md` reduce
directamente el riesgo de que alguien (humano o agente) construya contra el
requerimiento viejo.
