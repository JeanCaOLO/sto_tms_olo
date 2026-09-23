# Coordinación entre Claude Code y Kiro (y Orca)

En este repo trabajan en paralelo dos agentes de IA sobre el mismo checkout: **Kiro** (IDE) y **Claude Code** (CLI). Ninguno ve la conversación del otro. Esta guía explica cómo se coordinan y qué tiene que instalar cada dev la primera vez que toma el proyecto.

## 1. Canal compartido: `.agents/CANAL.md` (obligatorio, sin instalar nada)

Tablero en el repo que leen los dos agentes:

- **En curso**: tabla con quién está tocando qué archivos. Se agrega una fila al empezar y se quita al terminar o commitear.
- **Mensajes**: avisos y pedidos entre agentes (`De: Claude → Kiro`, `De: Kiro → Claude`). Solo se agrega al final; cada mensaje lleva `Estado: abierto | respondido | cerrado`.

Regla principal: **antes de modificar archivos, leer el canal y correr `git status`**. Cambios sin commitear que no son tuyos son trabajo en curso del otro agente o de un humano: no se revierten, no se borran y no se sobrescriben.

Cómo lo cumple cada agente:

| Agente | Mecanismo |
|---|---|
| Kiro | Steering `.kiro/steering/claude-coordination.md` (`inclusion: always`) |
| Claude Code | Memoria del proyecto + esta guía |

Las decisiones de negocio firmes no van al canal: van en `aidlc/spaces/default/memory/project.md`.

## 2. Orca: Kiro le delega tareas a Claude (opcional)

[Orca](https://github.com/stablyai/orca) (Stably AI, MIT) orquesta agentes de terminal en worktrees. Con Orca, Kiro puede abrir una sesión de Claude Code, mandarle una tarea y leer la respuesta. El procedimiento está en `.kiro/steering/claude-orchestration.md`.

### Instalación (primera vez, Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-orca.ps1
```

El script es idempotente y hace lo siguiente:

1. Instala Orca con `winget install StablyAI.Orca` si no está.
2. Agrega el CLI (`%LOCALAPPDATA%\Programs\orca\resources\bin`) al PATH del usuario.
3. Arranca la app. El CLI necesita el runtime de la app corriendo.
4. Registra este repo en Orca (`orca repo add`).
5. Instala en el proyecto las skills `orca-cli` y `orchestration` (`.agents/skills/`, con enlace en `.claude/skills/` para Claude Code).

> Estado al 2026-09-23: los cinco pasos se ejecutaron a mano en la máquina de referencia (Orca 1.4.209). El script completo todavía no se corrió de punta a punta.

Requisitos: `winget` y Claude Code instalado (`npm i -g @anthropic-ai/claude-code`), porque Orca lanza el comando `claude`.

### Verificar

```powershell
orca status --json      # runtime.state = "ready"
orca repo list --json   # debe listar sto_tms_olo
```

### Notas

- **Arrancar la app con `Start-Process`, no con `orca open`**: si la app se arranca con `orca open` desde una terminal que después se cierra, la app se cae con ella.
- Los enlaces de `.claude/skills/orca-cli` y `.claude/skills/orchestration` usan rutas absolutas de cada máquina, por eso están en `.gitignore`. Cada dev los regenera corriendo el script. Las skills en sí (`.agents/skills/` + `skills-lock.json`) sí se versionan.
- En otros sistemas operativos: macOS `brew install --cask stablyai/orca/orca`; el CLI se registra desde *Settings → General → Orca CLI*.
- AI-DLC (`/aidlc`) no pasa por Orca: tiene gates de aprobación interactivos y lo conduce un humano directamente.
