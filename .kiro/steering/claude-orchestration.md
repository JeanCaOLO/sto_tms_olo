# Delegar tareas a Claude Code

Kiro puede pasarle una tarea suelta a Claude Code (headless) y recibir el
resultado. Wrapper: `scripts/claude-run.mjs`.

## Cuándo usarlo

- Tareas concretas y acotadas: "arregla este bug", "escribe este archivo",
  "investiga por qué falla X", "haz este refactor".
- Cuando Claude ya tiene contexto/memoria útil de este repo que a Kiro le
  costaría reconstruir.

## Cuándo NO usarlo

- **AI-DLC.** Ese flujo (`/aidlc`) tiene gates de aprobación interactivos por
  diseño y lo conduce Claude con el humano directamente. No lo manejes por
  aquí.

## Cómo llamarlo (PowerShell)

El brief va en un archivo, nunca como argumento entre comillas.

```powershell
# tarea nueva
node scripts/claude-run.mjs --brief-file .\brief.md

# continuar la misma conversación (usa el session_id que devolvió la anterior)
node scripts/claude-run.mjs --brief-file .\respuesta.md --session <session_id>
```

Si `claude` no está en el PATH de tu shell: agrega `%APPDATA%\npm` al PATH, o
llama con la ruta completa a `claude.cmd`.

Opciones útiles: `--model <id>` (default `claude-sonnet-5`),
`--max-turns <n>` (tope de seguridad), `--cwd <dir>` (carpeta del proyecto),
`--yolo` (sin pedir permisos — solo en un worktree desechable).

## Formato del brief (`brief.md`)

```markdown
## Tarea
<qué hay que hacer, en una o dos frases>

## Contexto
- repo: <ruta>
- archivos relevantes: <rutas>
- antecedentes: <lo que ya se intentó, o "ninguno">

## Listo cuando
<cómo sé que quedó bien: tests verdes, archivo creado, etc.>

## Salida
Termina con un bloque RESULT: qué hiciste, archivos tocados, decisiones,
qué queda pendiente. Si NO puedes avanzar sin una decisión humana, escribe
una sola línea que empiece con `NEEDS_HUMAN:` y la pregunta, y detente. No
adivines.
```

## Leer el resultado

El wrapper imprime una línea JSON:

```json
{ "session_id": "...", "status": "done|needs_human|error",
  "needs_human": false, "question": null, "result": "<texto de Claude>",
  "cost_usd": 0.12, "num_turns": 8 }
```

- `status: "done"` → listo. Lee `result`.
- `status: "needs_human"` → pásale `question` al usuario. Con su respuesta,
  llama otra vez con `--session <session_id>` y un brief que sea la respuesta.
- `status: "error"` → algo falló; `result` trae el detalle.

Guarda el `session_id` mientras la tarea siga abierta.
