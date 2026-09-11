# Agentes de IA propuestos en las reuniones — cómo se construyen en Kiro

> Documento de referencia técnica, transversal a todo el proyecto TMS OLO (no específico de un
> módulo). Responde a la pregunta: los "agentes" que se nombraron en las reuniones de kickoff
> (`CONTEXTO_PROYECTO_TMS.md` §6) — ¿cómo se crean y cómo se usan en Kiro? ¿Con Specs, Agent
> Hooks, Agent Steering o Skills?
> Última actualización: 2026-08-18.

---

## 1. Punto de partida: Kiro no tiene "agentes" como entidades separadas

Antes de mapear cada agente propuesto, una aclaración importante para no sobre-construir:

**Kiro no tiene un concepto de "crear un agente nuevo" como si fuera un bot independiente con
su propia identidad.** Hay un solo agente conversacional; lo que lo hace comportarse como "el
agente de RLS" o "el agente de Liquidación" es **qué contexto tiene cargado en ese momento** —
una combinación de Steering + Skills + Hooks + MCP. En las transcripciones de las reuniones se
habla de "agentes" como si fueran entidades separadas; construir uno por módulo literalmente
(en vez de composición de contexto) sería sobre-construir justo lo que el propio equipo ya
identificó como riesgo (`CONTEXTO_PROYECTO_TMS.md` §6: *"si se generan de más, después hay que
estar modificándolos"*).

**Dato de contexto:** este repo (`sto_tms_olo`) todavía no tiene ninguna carpeta `.kiro/`. El
"agente de revisión de código" y el "agente de contexto" que el kickoff dice que ya existen
probablemente viven en el `~/.kiro/steering` personal de alguien (Jean Carlo/Andrey) o quedarán
en el futuro repo centralizado de documentación (pendiente en `CONTEXTO_PROYECTO_TMS.md` §9),
no en este repo por ahora.

---

## 2. Las 4 piezas reales de Kiro y qué son en la práctica

Verificado contra la documentación oficial de Kiro (no asumido de memoria, dado que Kiro
evoluciona rápido):

| Feature | Qué es | Dónde vive | Cómo se activa |
|---|---|---|---|
| **Steering** | "System prompt" persistente — reglas/estándares/contexto que el agente sigue siempre, sin que se lo repitas | `.kiro/steering/*.md` (workspace) o `~/.kiro/steering/*.md` (global) | `always` (siempre cargado), `fileMatch` (solo si tocas ciertos archivos), `manual` (`#nombre-archivo`), o `auto` (Kiro decide por relevancia) |
| **Skills** | Paquete de instrucciones + scripts reutilizables, con "*progressive disclosure*": solo el nombre+descripción se cargan al inicio, y el contenido completo se carga cuando el pedido calza con la descripción | `.kiro/skills/<nombre>/SKILL.md` (+ carpetas opcionales `scripts/`, `references/`) | On-demand, por match de descripción, o invocación manual tipo slash command |
| **Hooks** | Automatizaciones disparadas por eventos (guardar archivo, crear archivo, antes/después de una herramienta, fin de tarea, etc.) — pueden ejecutar un comando o inyectar un prompt al agente | `.kiro/hooks/*.json` | Automático, por el evento configurado (`PostFileSave`, `PreToolUse`, `Stop`, `PreTaskExec`, etc.) |
| **Specs** | Flujo estructurado Requirements → Design → Tasks que convierte una idea en un plan ejecutable con tareas trazables (se ejecutan en "waves" según dependencias) | Se generan por conversación con el agente; quedan como artefactos versionables en el repo | Se inician manualmente ("crea un spec para X") |
| **MCP** *(no preguntado explícitamente, pero necesario para uno de los casos — ver §3)* | Conecta el agente a herramientas/APIs externas (fuentes de datos vivos) | Se configura en `.kiro/` | El agente lo usa como herramienta durante la conversación |

Fuentes: [Kiro Docs — Steering](https://kiro.dev/docs/steering/), [Kiro Docs — Specs](https://kiro.dev/docs/specs/), [Kiro Docs — Hooks](https://kiro.dev/docs/hooks/), [Kiro Docs — Skills](https://kiro.dev/docs/skills/).

**Diferencia clave Steering vs. Skills** (la más relevante para decidir dónde va cada agente
propuesto):

- **Steering** = reglas de fondo que deben aplicar *siempre* o *siempre que se toque cierto
  tipo de archivo* — el usuario no lo invoca, simplemente está presente.
- **Skills** = conocimiento especializado que se consulta *bajo demanda*, cuando el pedido
  calza con su descripción — puede incluir scripts que hacen tareas determinísticas (generar
  SQL, escanear componentes, etc.) en vez de dejárselo 100% al LLM.

---

## 3. Mapeo de cada agente propuesto en las reuniones

| Agente (como se nombró en la reunión) | Qué es realmente en Kiro | Por qué |
|---|---|---|
| **Revisión de código** *(ya existe)* | Steering `always` con el contenido de `Estandares_Desarrollo_AWS_Intelix.md` (idealmente vía `#[[file:...]]` para que quede siempre actualizado) **+** Hook `PreToolUse` en `commit` o `PostFileSave` sobre `src/**/*.{py,tsx}` | Necesita aplicarse *siempre* sin que nadie lo invoque — eso es Steering `always` + un Hook que dispare la revisión automáticamente |
| **Contexto del proyecto** *(ya existe)* | Steering `always` con `CONTEXTO_PROYECTO_TMS.md` referenciado | Contexto de negocio que debe estar presente en cualquier prompt, no algo que se invoque a mano |
| **Skill de consistencia visual** *(en construcción)* | Literalmente un Kiro Skill — `.kiro/skills/design-consistency/SKILL.md`, con la tabla de tokens del design system (colores, componentes base `Card`/`Button`/`Badge`/`Input`/`Select`, iconografía Remix Icon — ver `PLAN_MODULO_OMS.md` §4 para el detalle ya extraído del repo) | El propio kickoff ya lo llama "skill" — es el término correcto, confirma que el equipo ya distingue esto |
| **Generalista de documentación** *(apoya a Ana)* | Skill que sabe generar/actualizar los 5 documentos vivos del AI/DLC (matriz de requerimientos, plan de desarrollo, reporte de ejecución con factor de aceleramiento, matriz de incidencias) **+** Steering `always` con las reglas de formato de esos documentos | Necesita conocimiento invocable ("actualiza la matriz de incidencias"), no una regla de fondo constante |
| **RLS / Seguridad** *(Andrey, transversal)* | Skill `.kiro/skills/rls-security/SKILL.md` con reglas de roles/permisos/JWT **+** Steering `fileMatch` sobre rutas de auth/hooks de sesión, para que aplique automático sin invocarlo cada vez | Transversal a todos los módulos: combina "siempre presente cuando toco auth" (Steering condicional) con "consulta profunda al diseñar permisos nuevos" (Skill) |
| **Prototipado / UI** | Skill que empaqueta el design system + opcionalmente scripts de scaffolding de pantallas (`Page → useController → Api`, según `Estandares_Desarrollo_AWS_Intelix.md` §11) | Conocimiento reutilizable entre módulos, no una regla que aplique en cada mensaje |
| **Base de datos** | Skill con las convenciones de esquema Postgres/RDS + scripts de plantillas SQL/migraciones — justo lo que pide `Estandares_Desarrollo_AWS_Intelix.md` §6: *"es obligatorio usar agentes de IA para generar el esquema"* | Generar DDL es una tarea determinística — los scripts en `scripts/` dentro del Skill son más confiables que dejárselo puramente al LLM |
| **Arquitectura / Infraestructura** | Skill fuerte en SAM/CloudFormation, con scripts que generen templates base y validen contra el checklist de producción (`Estandares_Desarrollo_AWS_Intelix.md` §14) | Mucho de esto es plantillas determinísticas + checklist, buen candidato a scripts dentro del Skill |
| **Roadmap** *(para que Ana consulte avance)* | Distinto a los anteriores: necesita **datos vivos** (horas en Xtiming, estado real de tareas/specs), no solo instrucciones estáticas. Candidato a **MCP** (conectar Kiro a la fuente de datos real) **+** un Hook que actualice el roadmap al cerrar una tarea/spec | Steering/Skills son solo instrucciones; para "que Ana consulte avance" el agente necesita *leer* estado externo — ese es el rol de MCP, no de Steering/Skills |
| **Agentes por módulo** *(ej. reglas de Liquidación de Dylan, priorización de OMS de Eduardo, clustering de Planificación de Jesús)* | Un Skill workspace-scoped por módulo — `.kiro/skills/liquidacion-rules/`, `.kiro/skills/oms-priorizacion/`, etc. — que **no repite** las reglas generales (esas ya están en Steering `always`), solo agrega lo específico del dominio | Es literalmente lo que dice la transcripción: *"se apega a las reglas del agente generalista, para evitar contradicciones"* — es la jerarquía nativa Steering(general) + Skill(específico) de Kiro, no algo que haya que inventar |

---

## 4. La pieza que ya está decidida (y que valida todo el mapeo anterior)

El propio contexto del proyecto dice (`CONTEXTO_PROYECTO_TMS.md` §6.1):

> *"Cada desarrollador genera su propio plan (horas, fecha inicio/fin) usando los **skills de
> la metodología** instalados en Kiro."*

Es decir, el **AI/DLC completo (Levantamiento → Discovery → Historias → Plan → Diseño) ya está
pensado como un Skill** que, al invocarse, genera un **Spec** (requirements.md / design.md /
tasks.md). Ejemplo concreto con el OMS de Eduardo: cuando tome `PLAN_MODULO_OMS.md` como
insumo, el flujo esperado en Kiro sería:

1. Cargar el Skill de metodología AI/DLC → genera el Spec del OMS (`requirements.md` con
   historias/criterios de aceptación por cada submódulo, `design.md` con la arquitectura
   propuesta, `tasks.md` con tareas trazables).
2. El Skill `.kiro/skills/oms-priorizacion/` (a crear) aporta el conocimiento específico del
   dominio (reglas de negocio de priorización, no FIFO).
3. Steering `always` (contexto del proyecto + estándar técnico) mantiene todo alineado sin que
   Eduardo tenga que repetírselo en cada sesión.
4. Un Hook opcional recuerda actualizar el "reporte de ejecución con factor de aceleramiento"
   al cerrar cada tarea del Spec.

Este mismo flujo aplica para cualquier otro dueño de módulo (Dylan/Liquidación,
Jesús/Planificación, etc.) — solo cambia qué Skill específico de módulo se carga en el paso 2.

---

## 5. Estructura de carpetas propuesta (`.kiro/`)

```
.kiro/
  steering/
    product.md              # resumen de CONTEXTO_PROYECTO_TMS.md — inclusion: always
    tech.md                 # resumen de Estandares_Desarrollo_AWS_Intelix.md — inclusion: always
    structure.md            # convención de carpetas/router del repo — inclusion: always
    security-rls.md         # reglas de Andrey — inclusion: fileMatch sobre rutas de auth/RLS
  skills/
    design-consistency/     # skill visual, ya "en construcción" según el kickoff
    db-schema/               # agente de base de datos
    infra-sam/               # agente de arquitectura/infraestructura
    docs-generalista/        # agente de documentación (apoya a Ana)
    module-liquidacion/       # agente específico de Dylan
    module-oms-priorizacion/  # agente específico de Eduardo
    module-planificacion/     # agente específico de Jesús
    ...                       # uno por módulo, solo para los módulos con dueño confirmado
  hooks/
    code-review-on-save.json
    update-living-docs-on-task-complete.json
```

**Regla de secuencia:** los Skills por módulo (`module-*`) solo se crean para módulos que ya
tengan dueño confirmado — construirlos antes es exactamente el trabajo que Andrey ya señaló
que se quiere evitar (ver §6 siguiente).

---

## 6. Bloqueo real ya identificado en el kickoff

Andrey ya tiene la lista completa de agentes armada, pero está bloqueado esperando que **Ana
confirme el mapeo final de quién trabaja en qué módulo** (`CONTEXTO_PROYECTO_TMS.md` §6/§9).
Con la tabla de la §3 de este documento, ese mapeo se traduce directamente a "qué
Steering/Skills hay que crear y para quién" — en cuanto Ana confirme, Andrey puede usar esta
tabla como checklist de construcción en vez de partir de cero.

---

## 7. Próximos pasos

- [ ] Compartir este documento con Andrey — puede acelerar su lista de agentes ya armada.
- [ ] Confirmar con Jean Carlo si el repo centralizado de documentación (pendiente en §9 del
      contexto) es donde debería vivir `.kiro/steering/` y `.kiro/skills/` compartidos, o si
      cada repo de módulo tiene su propio `.kiro/` local.
- [ ] Una vez Ana confirme el mapeo de módulos, crear primero el Steering `always` (product,
      tech, structure) — es la base que todos los Skills de módulo van a heredar.
- [ ] Validar con Andrey si el "agente de roadmap" realmente necesita MCP (acceso a Xtiming en
      vivo) o si, para una primera versión, basta con que alguien pegue el estado manualmente y
      sea un Skill simple sin integración en vivo.
