---
name: intelix-task-tracker
description: Rastrea el plan de implementación de AI-DLC v1 (awslabs/aidlc-workflows) a nivel de tarea, con duraciones reales, verificación humana explícita e índice de ajustes. Usar siempre que se trabaje con un proyecto que tenga aidlc-docs/, con code-generation-plan, unidades de trabajo AI-DLC, o cuando el usuario pregunte por el avance, los tiempos o las tareas pendientes de un flujo AI-DLC.
---

# Task Tracker — Rastreo del plan de implementación AI-DLC (v1 y v2)

## Qué hace y qué NO hace

AI-DLC ya rastrea a nivel de **stage** en su `aidlc-state.md` y registra cada
interacción en su audit trail (append-only, ISO 8601). Esto vale para v1 y v2;
sólo cambia *dónde* viven esos archivos (ver "Compatibilidad de versiones").

Este skill cubre lo que **ninguna** de las dos versiones aporta, a nivel de
**tarea**:

| Necesidad | Lo cubre AI-DLC (v1/v2) | Lo cubre este skill |
|---|---|---|
| Progreso por stage / gate | ✅ `aidlc-state.md` | — |
| Historial de interacciones | ✅ audit trail | — |
| Progreso por tarea del plan | Checkbox `[ ]`/`[x]` | Seis estados |
| Duración real por tarea | ❌ | ✅ |
| Verificación humana distinta de "hecho" | ❌ | ✅ |
| Ajustes post-entrega y su ciclo | ❌ | ✅ |
| % global agregado del proyecto | ❌ | ✅ |

> **Nota sobre v2:** v2 introdujo gates de verificación por fase, pero esos
> gates son a nivel de *stage*, no de *tarea*, y no miden duración real ni
> separan "el agente lo hizo" de "un humano lo verificó". Por eso el skill
> aporta valor también en v2, en lugar de duplicar su rastreo.

**Regla dura:** el `aidlc-state.md` y el audit trail de AI-DLC son de **solo
lectura** en cualquier versión. Son propiedad del framework. Este skill escribe
únicamente en su carpeta `tracking/` (ver rutas por versión más abajo).

---

## Compatibilidad de versiones (v1 y v2)

La lógica de rastreo (estados, pesos, fórmulas, reportes) es **idéntica** en
ambas versiones. Lo único que cambia es la ubicación de los artefactos que el
skill lee y de la carpeta donde escribe. Esa diferencia está aislada en
`aidlc_paths.py` (`detect_layout(project_root)`); el resto del skill no necesita
saber qué versión hay. La implementación canónica vive en
`.intelix/scripts/aidlc_paths.py`; el archivo local `aidlc_paths.py` es solo un
adaptador de compatibilidad para los scripts históricos de esta skill.

| Concepto | AI-DLC v1 | AI-DLC v2 |
|---|---|---|
| Marca de detección | `aidlc-docs/` en la raíz | `aidlc/spaces/<space>/intents/<record>/` |
| Planes de code gen | `aidlc-docs/construction/plans/*code-generation-plan.md` | `<record>/construction/<unit>/code-generation/code-generation-plan.md` |
| Nombre de unidad | del nombre de archivo | del directorio `<unit>/` padre |
| Estado (read-only) | `aidlc-docs/aidlc-state.md` | `<record>/aidlc-state.md` |
| Audit (read-only) | `aidlc-docs/audit.md` | `<record>/audit/*.md` (shards por clon) |
| Mapeo tarea→US | `story_mapping.py` | `<record>/construction/<unit>/code-generation/traceability.json` (preferido), respaldo `story_mapping.py` |
| **Tracking (escritura)** | `aidlc-docs/tracking/` | `<record>/tracking/` |

Donde `<record>` es el intent record activo:
`aidlc/spaces/<space>/intents/<YYMMDD>-<label>/`. El space por defecto es
`default`. El intent se selecciona por argumento explícito, por
`aidlc/spaces/<space>/intents/active-intent` o, si solo existe uno, por ese
único intent. Si hay varios sin cursor válido, la operación se detiene: nunca
se adivina por fecha. Si coexisten ambas estructuras (proyecto migrado), **v2
gana**.

Los scripts (`check_drift.py`, generadores) resuelven todo esto por sí solos.
Cuando operes manualmente, deriva las rutas de la tabla según la versión que
detectes en la FASE 0.

---

## Activación

El rastreo no depende de que el usuario invoque la skill por nombre. `intelix-cli`
incluye el contrato mínimo en el bloque Intelix de `AGENTS.md` o `CLAUDE.md`:
marcar 🔄 al iniciar, 🟡 al terminar, usar timestamps reales y reservar ✅ para
la verificación humana. El detalle completo vive en este documento.

Reparto de responsabilidades:

| Mecanismo | Qué garantiza |
|---|---|
| Bloque Intelix de instrucciones | Que el contrato mínimo viaje con el repositorio |
| Este `SKILL.md` | El procedimiento completo, estados, fórmulas y formatos |
| `check_drift.py` | Detectar cuándo el índice quedó desalineado de los planes |

Las instrucciones no pueden forzar físicamente una edición. No existe un guard
preventivo: `check_drift.py`, la reconciliación contra el plan y la revisión de
Git permiten detectar y auditar desincronizaciones.

---

## FASE 0 — Detección de AI-DLC y su versión

### Paso 0.1 — Detectar presencia

Buscar en la raíz del proyecto:

- **Reglas core** — `aws-aidlc-rules/` en el directorio de reglas del agente:
  `.kiro/steering/`, `.amazonq/rules/`, `.clinerules/`,
  `.cursor/rules/ai-dlc-workflow.mdc`, `CLAUDE.md`, `.claude/CLAUDE.md`,
  `AGENTS.md`, `.github/copilot-instructions.md`
- **Reglas de detalle** — `aws-aidlc-rule-details/` o `.aidlc-rule-details/`
  con subcarpetas `common/`, `inception/`, `construction/`, `extensions/`,
  `operations/`
- **Variante de setup asistido** — `.aidlc/aidlc-rules/aws-aidlc-rules/core-workflow.md`
- **Artefactos v1** — `aidlc-docs/`
- **Artefactos v2** — `aidlc/spaces/<space>/intents/<record>/`

Basta con encontrar reglas **o** artefactos (v1 o v2) para considerar AI-DLC
presente.

### Paso 0.2 — Determinar la versión

El skill soporta ambas versiones. Determinar cuál hay:

- Si existe `aidlc/spaces/<space>/intents/<record>/` (un record con o sin
  `aidlc-state.md`) → **v2**.
- Si existe `aidlc-docs/` → **v1**.
- Si coexisten → **v2 gana** (es la estructura viva; v1 suele ser residual de
  una migración).

En vez de razonarlo a mano, delegar al resolvedor, que aplica exactamente esta
precedencia y devuelve todas las rutas resueltas:

```bash
python -c "import sys; sys.path.insert(0, '.kiro/skills/intelix-task-tracker'); \
from aidlc_paths import detect_layout; l = detect_layout('.'); \
print(l.version, l.record_dir, l.tracking_dir)"
```

Registrar la versión detectada; el resto de la FASE 1 y las reglas usan las
rutas de la tabla de "Compatibilidad de versiones" según esa versión.

### Paso 0.3 — Si no hay AI-DLC

1. Informar:

   > ⛔ **No se detectó AI-DLC en este proyecto.**
   > Este skill es una capa de rastreo sobre el flujo AI-DLC v1 de AWS
   > y no puede operar sin él.

2. Pedir permiso explícito:

   > ¿Me autorizas a descargar e instalar AI-DLC v1 desde el repositorio
   > oficial de AWS? → https://github.com/awslabs/aidlc-workflows

3. Si NO autoriza → terminar sin crear nada.
4. Si autoriza → Paso 0.4.

### Paso 0.4 — Instalación de v1

Preguntar SIEMPRE el agente, porque las rutas dependen por completo de él:

> ¿En qué agente vas a usar AI-DLC? (Kiro IDE, Kiro CLI, Amazon Q Developer,
> Cursor, Cline, Claude Code, GitHub Copilot, Codex CLI u otro)

Luego:

1. Consultar `https://api.github.com/repos/awslabs/aidlc-workflows/releases/latest`
   para confirmar el release vigente. No asumir un número de versión.
2. Descargar el asset `ai-dlc-rules-v<version>.zip` a una carpeta **fuera**
   del proyecto.
3. Extraer. Produce `aidlc-rules/` con dos subcarpetas: `aws-aidlc-rules/`
   (reglas core) y `aws-aidlc-rule-details/` (reglas de detalle referenciadas
   condicionalmente por las core).
4. Copiar según el agente. El patrón general es: `aws-aidlc-rules/` va donde el
   agente lee reglas de proyecto, y `aws-aidlc-rule-details/` va a un nivel
   hermano para que las reglas core puedan referenciarlo.

   | Agente | Reglas core | Reglas de detalle |
   |---|---|---|
   | Kiro | `.kiro/steering/aws-aidlc-rules/` | `.kiro/aws-aidlc-rule-details/` |
   | Amazon Q | `.amazonq/rules/aws-aidlc-rules/` | `.amazonq/aws-aidlc-rule-details/` |
   | Cursor | `.cursor/rules/ai-dlc-workflow.mdc` (core-workflow.md + frontmatter `alwaysApply: true`) | `.aidlc-rule-details/` |
   | Cline | `.clinerules/core-workflow.md` | `.aidlc-rule-details/` |
   | Claude Code | `CLAUDE.md` (o `.claude/CLAUDE.md`) | `.aidlc-rule-details/` |
   | GitHub Copilot | `.github/copilot-instructions.md` | `.aidlc-rule-details/` |
   | Codex CLI / otros | `AGENTS.md` | `.aidlc-rule-details/` |

   En Cursor, Cline, Claude Code, Copilot y Codex se copia el archivo
   `core-workflow.md` renombrado, no la carpeta completa.

5. Alternativa: el flujo *AI-Assisted Setup* del README deja las reglas en
   `.aidlc/aidlc-rules/` y crea un archivo puntero de una línea que apunta a
   `core-workflow.md`. Si se usa, añadir `.aidlc` a `.gitignore`.
6. Verificar que el agente cargó las reglas: `/context show` en Kiro y Amazon Q,
   panel de Rules en Cursor y Cline, `/instructions` en Copilot.
7. Confirmar al usuario las rutas reales creadas, no las esperadas.

### Paso 0.5 — Inicializar el rastreo

Crear, dentro de la carpeta `tracking/` correspondiente a la versión detectada
(ver tabla de compatibilidad), si no existen:

- `<tracking>/INDICE-PROGRESO.md`
- `<tracking>/INDICE-AJUSTES.md`

Rutas concretas:

- **v1** → `aidlc-docs/tracking/`
- **v2** → `<record>/tracking/`, es decir
  `aidlc/spaces/<space>/intents/<YYMMDD>-<label>/tracking/`

Si la estructura de artefactos aún no existe (`aidlc-docs/` en v1, o el intent
record en v2), no crearla a mano: aparece cuando AI-DLC ejecuta su primer stage.
Avisar al usuario que arranque el flujo (`Using AI-DLC, ...` en v1; `/aidlc` en
v2) y volver luego.

---

## FASE 1 — Poblado del índice desde el plan real

El plan de implementación (uno por unidad de trabajo) vive en:

- **v1**: `aidlc-docs/construction/plans/{unit-name}-code-generation-plan.md`.
  En proyectos de una sola unidad el modelo suele simplificar el nombre a
  `code-generation-plan.md`, sin prefijo. Buscar ambas formas con glob sobre
  `aidlc-docs/construction/plans/*code-generation-plan.md`.
- **v2**: `<record>/construction/{unit-name}/code-generation/code-generation-plan.md`.
  El nombre de la unidad es el directorio padre-padre, no el del archivo.
  Buscar con glob sobre `<record>/construction/*/code-generation/code-generation-plan.md`.

En ambos casos, `aidlc_paths.detect_layout('.').plan_files` ya devuelve la lista
correcta y `unit_name_from_plan(path, version)` deriva el nombre de la unidad.

Estos planes contienen pasos con checkboxes `[ ]`/`[x]` — esa es la lista de
tareas a rastrear.

Contexto complementario que conviene leer una vez (rutas según versión):

| Documento | v1 | v2 |
|---|---|---|
| Definición de unidades | `aidlc-docs/inception/application-design/unit-of-work.md` | `<record>/inception/units-generation/unit-of-work.md` |
| Orden de ejecución | `aidlc-docs/inception/application-design/unit-of-work-dependency.md` | `<record>/inception/units-generation/unit-of-work-dependency.md` |
| Mapa unidad→historias | `aidlc-docs/inception/application-design/unit-of-work-story-map.md` | `<record>/inception/units-generation/unit-of-work-story-map.md` |
| Plan de entrega / stages | `aidlc-docs/inception/plans/execution-plan.md` | `<record>/inception/delivery-planning/bolt-plan.md` |
| Trazabilidad tarea→US | (derivar de plan + mapa) | `<record>/construction/{unit}/code-generation/traceability.json` |

En v2, `traceability.json` es la fuente directa de la relación tarea→historia;
preferirla sobre inferencias manuales (ver "Trazabilidad tarea → historia").

### Procedimiento

1. Localizar todos los planes de code generation (glob según versión).
2. Por cada unidad, crear una sección en `INDICE-PROGRESO.md` y una fila por
   cada paso con checkbox del plan.
3. Asignar IDs estables: `{unidad-abreviada}-T01`, `-T02`, … El ID nunca se
   reutiliza ni se renumera, aunque el plan cambie.
4. Añadir una tarea `VER-XX` al cierre de cada unidad, con criterios de
   verificación concretos derivados del mapa unidad→historias y del stage de
   build-and-test cuando ya exista (`aidlc-docs/construction/build-and-test/`
   en v1; `<record>/construction/build-and-test/` en v2).
5. Si el plan se regenera y aparecen pasos nuevos, **añadirlos** conservando los
   IDs existentes; marcar como ⏭️ los que desaparecieron, con nota del motivo.
   Nunca reescribir el índice desde cero: se perderían los tiempos ya medidos.

---

## Estados de una tarea

| Estado | Símbolo | Peso | Significado |
|---|---|---|---|
| Pendiente | ⬜ | 0 | No iniciada |
| En progreso | 🔄 | 0 | El agente está trabajando |
| Completada (agente) | 🟡 | 0.9 | Terminada por el agente, falta verificación humana |
| En ajuste | 🔧 | 0.9 | El humano encontró correcciones (ver INDICE-AJUSTES) |
| Verificada | ✅ | 1.0 | El humano verificó y aprobó |
| Omitida | ⏭️ | — | Fuera de alcance; excluida del denominador |

El checkbox `[x]` del plan de AI-DLC equivale a 🟡, **nunca** a ✅. El framework
marca "el agente lo hizo"; el ✅ significa "un humano lo comprobó". Son cosas
distintas y esa distinción es la razón de ser de este skill.

---

## Reglas OBLIGATORIAS para el agente

### Tiempos
Leer siempre el reloj del sistema: `date -u +"%Y-%m-%dT%H:%M:%SZ"`. Nunca
estimar ni inventar una hora. Sin acceso a shell, registrar `sin-timestamp` y
avisarlo explícitamente. Duración en `HH:mm:ss`.

Si una tarea abarca varias sesiones, sumar intervalos en una columna de
duración acumulada en lugar de restar inicio y fin, que incluiría el tiempo en
que nadie trabajó.

### Al INICIAR una tarea
Registrar 🔄 y la hora de inicio **antes** de empezar el trabajo.

### Al TERMINAR una tarea
1. Marcar 🟡.
2. Registrar hora de fin y calcular duración.
3. Recalcular los porcentajes globales.
4. NUNCA marcar ✅. Es exclusivo del humano.

### Al FINALIZAR una unidad de trabajo
1. Confirmar que existe su `VER-XX`; si no, crearla.
2. Notificar al humano qué debe verificar, en concreto: qué probar, qué
   comando correr, qué criterio de aceptación revisar. Un aviso de
   "listo para verificar" sin instrucciones no sirve.

### Si el humano reporta ajustes
1. Crear entrada(s) en `INDICE-AJUSTES.md`: `AJ-XXX`, tarea origen,
   descripción, estado, tiempos.
2. Cambiar la tarea origen a 🔧.
3. La tarea origen no puede pasar a ✅ hasta que todos sus ajustes estén ✅.

### Al resolver un ajuste
1. Marcarlo 🟡 con su duración.
2. Cuando el humano lo apruebe → ✅.
3. Si todos los ajustes de la tarea origen están ✅, notificar que ya puede
   marcarse al 100%.

### Reconciliación al inicio de cada sesión

Ejecutar primero la verificación automática:

```bash
python .kiro/skills/intelix-task-tracker/check_drift.py
```

Detecta siete tipos de desincronización y **no escribe nada**: solo diagnostica,
para no fabricar timestamps. Códigos de salida: `0` sincronizado, `1`
discrepancias, `2` artefactos ausentes.

| Detecta | Significado |
|---|---|
| Plan `[x]` e índice ⬜/🔄 | Trabajo realizado sin rastrear |
| Índice terminado y plan `[ ]` | Plan desactualizado |
| Terminada sin `Inicio` o `Fin` | Timestamps faltantes |
| 🔄 sin `Inicio` | Tarea iniciada sin registrar hora |
| Step del plan sin fila | Falta añadir la tarea al índice |
| Fila sin step en el plan | Marcar ⏭️ con nota del motivo |
| Plan sin sección / unidad sin plan | Desalineación estructural |

Luego, manualmente:
1. Releer los `*code-generation-plan.md` y comparar sus checkboxes con el índice.
2. Si el plan marca `[x]` una tarea que el índice tiene en ⬜ o 🔄 — pasó en otra
   sesión sin rastreo. Marcarla 🟡, poner `sin-timestamp` en los tiempos y
   señalarlo al usuario en lugar de fabricar una duración.
3. Consultar el audit trail para recuperar los timestamps reales de esos huecos
   cuando sea posible (`aidlc-docs/audit.md` en v1; `<record>/audit/*.md` en v2,
   varios shards que se combinan por timestamp). Es append-only con ISO 8601 y
   suele permitir reconstruirlos.
4. En caso de conflicto, el plan de AI-DLC gana sobre el índice. Corregir el
   índice y avisar de la discrepancia.

---

## Cálculo del progreso

### Progreso global

```
% agente     = Σ(pesos) / nº tareas no omitidas × 100
% verificado = nº tareas ✅ / nº tareas no omitidas × 100
```

Reportar **siempre las dos cifras juntas**. Un proyecto al 90% agente y 10%
verificado no está casi terminado, y una sola cifra lo haría parecer así.

### Progreso por historia de usuario

Cada tarea puede asociarse con una o varias historias de usuario (relación N:M).
El cálculo por US se basa exclusivamente en las tareas que la mencionan en la
columna `Historias`:

```
T_u = tareas con US u en su columna Historias, excluyendo ⏭️
% agente(u) = Σ peso(estado(t)) / |T_u| × 100
% verificado(u) = tareas ✅ en T_u / |T_u| × 100
```

- Una tarea multi-US aporta su peso completo a cada historia (no se divide).
- Se deduplica por ID de tarea dentro de cada US.
- Si `|T_u| = 0`, el resultado es `N/A`, no 0%.

### Fechas por historia

- **Inicio US**: `min(Inicio)` de las tareas en `T_u` con timestamp válido.
- **Fin US**: `max(Fin)` de las tareas en `T_u`, **solo si todas** están
  terminadas (🟡, 🔧 o ✅) y todas tienen un `Fin` válido.
- Si quedan tareas pendientes: `En curso`.
- Si no hay timestamps: `—`.
- `sin-timestamp` se conserva como dato desconocido; no se estiman fechas.

---

## Trazabilidad tarea → historia de usuario

### Fuentes y cardinalidad

- **En v2, fuente directa**: `traceability.json` en
  `<record>/construction/{unit}/code-generation/`. Contiene el mapeo
  tarea→historia que el propio framework generó; preferirlo sobre cualquier
  inferencia manual y sobre `story_mapping.py`.
- **Fuente primaria (v1, o respaldo en v2)**: el mapa unidad→historias
  (`unit-of-work-story-map.md`, ruta según versión — ver tabla de FASE 1).
- **Fuente secundaria**: texto de cada paso en el plan de code generation
  (permite vincular una tarea con una o varias US del mapa).
- **Cardinalidad**: muchos-a-muchos. Una tarea puede contribuir a varias US;
  una US puede tener tareas de múltiples unidades.
- **Regla de oro**: si no existe evidencia directa (`traceability.json` en v2, o
  texto del plan + mapa), la celda de Historias es `—`. No se infiere "la unidad
  colabora, luego todas sus tareas pertenecen a todas sus US".

### IDs válidos

Los IDs válidos dependen del proyecto y se declaran en
`tracker_core.VALID_US_IDS` (en la plantilla viene **vacío**). El conjunto
válido lo determina el mapa de historias / `traceability.json` del proyecto;
poblar `VALID_US_IDS` con las historias oficiales (p. ej. `US-01`, `US-02`, …).
Mientras esté vacío no se valida contra una lista cerrada. Cualquier ID fuera
del conjunto declarado se rechaza.

### Mapeo estático (v1) vs traceability.json (v2)

- **v2**: la fuente es `traceability.json` por unidad. No mantener un mapeo
  estático a mano; leer el JSON al poblar o reconciliar el índice.
- **v1**: el mapeo derivado se mantiene en
  `.kiro/skills/intelix-task-tracker/story_mapping.py`. Este mapeo es
  **específico de cada proyecto** (IDs como `XX-T01`, `XX-T02`, …) y en la
  plantilla viene vacío; se puebla a partir de los artefactos del proyecto. Al
  regenerar el índice o reconciliar, usarlo como fuente y no inventar nuevas
  asociaciones.

### Reconciliación de historias

- Al añadir tareas nuevas, consultar la fuente de la versión (`traceability.json`
  en v2; plan + mapa en v1) para derivar sus US.
- Al eliminar un paso del plan (⏭️), su asociación se conserva para auditoría.
- Si la fuente cambia (una historia se depreca, cambia `traceability.json`),
  actualizar el mapeo/lectura y recalcular el resumen.

---

## Formato de los índices

El formato es idéntico en ambas versiones; sólo cambia la carpeta contenedora
(`aidlc-docs/tracking/` en v1, `<record>/tracking/` en v2) y la etiqueta de
versión de la cabecera.

`<tracking>/INDICE-PROGRESO.md`:

```markdown
# Índice de Progreso — <proyecto>
AI-DLC <v1|v2> · Agente: <nombre> · Actualizado: <ISO>
**Progreso agente: <X>% · Verificado: <Y>%**

## Unidad: <unit-name>
Plan: `<ruta-del-plan-según-versión>`

| ID | Tarea | Estado | Inicio | Fin | Duración | Ajustes | Historias |
|---|---|---|---|---|---|---|---|
| API-T01 | Definir esquema de usuarios | ✅ | 2026-08-21T09:00:00Z | 2026-08-21T09:42:10Z | 00:42:10 | — | US-01 |
| API-T02 | Endpoint de autenticación | 🔧 | 2026-08-21T09:45:00Z | 2026-08-21T11:03:22Z | 01:18:22 | AJ-001 | US-01, US-02 |
| VER-01 | Verificación humana de la unidad | ⬜ | — | — | — | — | US-01, US-02 |

**Criterios de VER-01:** correr `npm test`, validar login contra US-003 y US-004.
```

`<tracking>/INDICE-AJUSTES.md`:

```markdown
# Índice de Ajustes
| ID | Origen | Descripción | Estado | Inicio | Fin | Duración |
|---|---|---|---|---|---|---|
| AJ-001 | API-T02 | El token no expira; falta validar `exp` | 🔧 | 2026-08-21T11:10:00Z | — | — |
```

---

## Control de versiones

Añadir la carpeta `tracking/` al repositorio: el historial de tiempos y ajustes
es información de proyecto, no artefacto temporal.

- **v1**: versionar `aidlc-docs/tracking/`. El README de AI-DLC ya recomienda
  versionar las reglas y `aidlc-docs/`.
- **v2**: versionar `<record>/tracking/`. La `.gitignore` de v2 ya commitea el
  contenido del intent record (artefactos, estado, audit shards) e ignora sólo
  cursores per-user y estado derivado; `tracking/` encaja como artefacto
  commiteable del record.

---

*Verificado contra el repositorio awslabs/aidlc-workflows (v1 rama `main`; v2
rama `v2` / docs de AI-DLC Workflows 2.0) el 2026-08-28. Si el plan de
implementación cambia de ubicación o nombre en un release posterior, actualizar
la FASE 1 y `aidlc_paths.py`.*


---

## Reporte HTML visual

> **Rutas por versión:** los ejemplos de comandos usan las rutas de v1
> (`aidlc-docs/tracking/...`). En **v2**, sustituir ese prefijo por la carpeta
> de tracking del intent record: `<record>/tracking/...`, es decir
> `aidlc/spaces/<space>/intents/<YYMMDD>-<label>/tracking/...`. Los generadores
> reciben las rutas como argumentos, así que funcionan igual en ambas versiones.

Además del índice Markdown, el skill genera un reporte HTML interactivo con:
- KPIs visuales (tareas totales, pendientes, en progreso, completadas, verificadas, en ajuste)
- Barra de progreso global con doble indicador (agente vs verificado)
- Cards por unidad con barra de progreso individual
- Tabla de tareas por unidad con estados coloreados y duraciones
- Sección de ajustes post-entrega

### Uso

```bash
python .kiro/skills/intelix-task-tracker/generate_tracking_report.py \
  aidlc-docs/tracking/INDICE-PROGRESO.md \
  aidlc-docs/tracking/INDICE-AJUSTES.md \
  aidlc-docs/tracking/reporte-progreso.html
```

Si no hay ajustes aún:
```bash
python .kiro/skills/intelix-task-tracker/generate_tracking_report.py \
  aidlc-docs/tracking/INDICE-PROGRESO.md \
  aidlc-docs/tracking/reporte-progreso.html
```

### Cuándo ejecutarlo

Los reportes HTML y PDF se generan **solo cuando el usuario los solicita**. No
se regeneran automáticamente al actualizar el índice.

Lo que sí es obligatorio y automático es la **actualización del
`INDICE-PROGRESO.md`** al iniciar y terminar cada tarea. Esa obligación está
declarada en `.kiro/steering/task-tracker-enforcement.md`, que se carga en toda
conversación del workspace (`inclusion: always`).

| Acción | Cuándo ocurre |
|---|---|
| Actualizar `INDICE-PROGRESO.md` | **Siempre**, al iniciar y terminar cada tarea |
| Actualizar `INDICE-AJUSTES.md` | Siempre que el humano reporte un ajuste |
| Generar `reporte-progreso.html` | Solo a petición del usuario |
| Generar `reporte-progreso.pdf` | Solo a petición del usuario |

Los reportes se escriben en `aidlc-docs/tracking/`.

### Reporte PDF

También se genera un PDF con el mismo contenido, ideal para compartir o imprimir:

```bash
python .kiro/skills/intelix-task-tracker/generate_tracking_pdf.py \
  aidlc-docs/tracking/INDICE-PROGRESO.md \
  aidlc-docs/tracking/INDICE-AJUSTES.md \
  aidlc-docs/tracking/reporte-progreso.pdf
```

Requiere `reportlab` (`pip install reportlab`).

El PDF incluye:
- Tabla de KPIs con totales y porcentajes
- Leyenda de estados con colores
- Tabla por unidad con estado coloreado por celda
- Criterios de verificación por unidad
- Sección de ajustes (si existen)
