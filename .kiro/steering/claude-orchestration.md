# Delegar tareas a Claude Code (vía Orca)

Kiro puede pasarle una tarea suelta a Claude Code y recibir el resultado,
usando Orca para abrir y manejar la sesión de Claude. No hay script propio:
todo es `orca` + su skill `orca-cli`.

## Cuándo usarlo

- Tareas concretas y acotadas: "arregla este bug", "escribe este archivo",
  "investiga por qué falla X", "haz este refactor".
- Cuando Claude ya tiene contexto/memoria útil de este repo.

## Cuándo NO usarlo

- **AI-DLC** (`/aidlc`). Ese flujo tiene gates de aprobación interactivos y lo
  conduce Claude con el humano directamente. No pasa por aquí.

## Antes de empezar

1. Carga la guía real de Orca: `orca skills get orca-cli` — trae los comandos
   exactos de la versión instalada. No adivines flags de memoria.
2. Confirma que Orca corre: `orca status --json` (si no, `orca open --json`).
3. Si el shell de Kiro no encuentra `claude`, agrega `%APPDATA%\npm` al PATH
   (Orca lanza el agente `claude` por su cuenta, así que suele no hacer falta).

## Delegar y esperar el resultado (supervisado)

**Opción A — en el checkout actual, sin worktree nuevo:**

```
orca terminal create --worktree active --command "claude" --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca terminal send --terminal <handle> --text "<brief>" --enter --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 600000 --json
orca terminal read --terminal <handle> --json
```

- `<handle>`: `startupTerminal.handle` de la respuesta de create, o
  `orca terminal list --worktree active --json`.
- El `terminal read` final trae la respuesta de Claude. Para respuestas largas,
  pagina con cursores (`nextCursor` mientras `limited` sea true).
- Seguimiento: otro `terminal send` al mismo `<handle>` — Claude mantiene el
  contexto de la conversación.

**Opción B — en un worktree aislado** (mejor si la tarea toca muchos archivos):

```
orca worktree create --name <tarea> --agent claude --prompt "<brief>" --json
```

Claude arranca en la primera terminal del worktree con el brief ya enviado.
Usá el `startupTerminal.handle` de la respuesta para `wait` / `read`.

## Handoff (Kiro NO espera el resultado)

```
orca worktree create --name <tarea> --no-parent --agent claude --prompt "<brief>" --json
```

Reportá el worktree creado y dejá de monitorear.

## Formato del brief

```markdown
## Tarea
<qué hay que hacer, 1-2 frases>

## Contexto
- archivos relevantes: <rutas>
- antecedentes: <lo intentado, o "ninguno">

## Listo cuando
<criterio de terminado: tests verdes, archivo creado, etc.>

## Salida
Termina con un bloque RESULT: qué hiciste, archivos tocados, qué queda
pendiente. Si NO podés avanzar sin una decisión humana, escribí una línea
`NEEDS_HUMAN: <pregunta>` y detenete. No adivines.
```

## Leer la respuesta

`terminal read` devuelve el texto crudo de la terminal. Buscá el bloque
`RESULT` al final. Si aparece `NEEDS_HUMAN:`, pasale esa pregunta al usuario y
con su respuesta hacé otro `terminal send` al mismo handle.

## Coordinación estructurada

Si necesitás ask/reply con seguimiento, DAG de tareas o un loop de
coordinador, usá la skill `orchestration` (`orca orchestration ...`) en vez de
`terminal send` suelto.
