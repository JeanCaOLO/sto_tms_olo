---
name: repo-orchestrator
description: "Orquestacion de repositorios y automatizacion de contexto mediante grafos de conocimiento. Mapea requerimientos a codigo existente, vincula dependencias entre issues (congelando/notificando cuando una esta retrasada), asigna tareas por perfil de skill + carga de trabajo, y genera briefings automaticos al mover un issue a In Progress. Requiere que /graphify ya se haya corrido sobre el repo, y un GITHUB_TOKEN/GH_TOKEN valido con scope repo."
---

# /repo-orchestrator

Convierte el grafo de conocimiento de graphify + el historial de git + la API de
GitHub en un asistente de gestion de equipo: sabe que archivos toca un
requerimiento nuevo, quien deberia hacerlo, si esta bloqueado por otra tarea, y le
da a un desarrollador el contexto completo apenas empieza a trabajar.

## Usage

```
/repo-orchestrator init                                        # primera vez en este repo: valida token, construye roster, verifica el grafo
/repo-orchestrator roster refresh                               # re-escanea git log + collaborators de GitHub (correr al sumar gente al equipo)
/repo-orchestrator map "<descripcion del requerimiento>"        # capacidad 1a: que archivos/modulos existentes toca esto
/repo-orchestrator deps link <issue> depends-on <issue> ["razon"]  # declarar una dependencia manual
/repo-orchestrator deps discover                                # detectar dependencias declaradas en los cuerpos de los issues
/repo-orchestrator deps check                                   # capacidad 1b: revisar y congelar/descongelar issues bloqueados (idempotente)
/repo-orchestrator profile [--module "Nombre Modulo"] [--author email]  # capacidad 2a: perfil de skill por modulo
/repo-orchestrator workload [--author login]                    # capacidad 2b: carga de trabajo actual por persona
/repo-orchestrator assign <issue-number>                        # capacidad 2c: recomienda (y con confirmacion, asigna)
/repo-orchestrator briefing <issue-number>                      # capacidad 3: genera (y con confirmacion, publica) el briefing
/repo-orchestrator schedule-setup                                # agenda `deps check` (y opcionalmente `briefing` automatico) via el skill `schedule`
```

Si no se da subcomando, o se pide ayuda, imprime el bloque `## Usage` y detente.

## Que hacer al ser invocado

### Paso 0 — Resolver el repo objetivo

El working directory actual (o el que el usuario indique) es el repo target. Resuelve:
- `git_root`: la raiz del repo git (busca `.git` hacia arriba desde cwd si hace falta).
- `owner/name`: parsea `git remote get-url origin` (formatos `https://github.com/OWNER/NAME.git` o `git@github.com:OWNER/NAME.git`).
- `graph_root`: mismo `git_root` (donde vive `graphify-out/`), salvo que el usuario diga otra cosa.
- Rutas de estado: `<git_root>/.claude/orchestrator/{config.json,roster.json,dependency_state.json}`.

Si `graphify-out/graph.json` no existe bajo `graph_root`, dile al usuario que corra
`/graphify` primero (map, profile y briefing lo necesitan; deps y workload no).

### Paso 1 — Preflight de autenticacion (siempre, antes de cualquier llamada a GitHub)

Sigue `references/github-api.md`:
```bash
python scripts/gh_api.py rate-limit
```
Si falla, **detente y reporta exactamente el error** (token ausente vs invalido —
son problemas distintos con distinta solucion). No sigas adivinando ni reintentando
en loop.

### `init` — primera vez en un repo

1. Preflight (Paso 1).
2. Verifica `graphify-out/graph.json` (Paso 0), avisa si falta pero no bloquees `init`.
3. Crea `.claude/orchestrator/config.json` con los defaults de
   `references/config-schema.md` si no existe (sustituye `repo` con el owner/name real).
4. Construye el roster desde DOS fuentes (no solo una — ver nota abajo):
   ```bash
   python scripts/roster.py build --git-root . --repo OWNER/NAME --roster-path .claude/orchestrator/roster.json
   python scripts/roster.py seed-collaborators --repo OWNER/NAME --roster-path .claude/orchestrator/roster.json
   ```
   - `build` lee `git log`: solo ve gente que YA hizo commits.
   - `seed-collaborators` lee `/repos/{repo}/collaborators` de GitHub: ve a todo
     el que tiene acceso al repo, haya o no commiteado. Corre siempre los dos —
     un equipo con integrantes nuevos que aun no commitean solo aparece via
     `seed-collaborators`.
   Si hay `unresolved_emails` (de `build`), pregunta al usuario el usuario de
   GitHub para cada uno y edita `roster.json` a mano (`source: "manual"`).
   Re-correr `init` (o solo estos dos comandos) cada vez que se agregue un
   integrante nuevo al equipo — no hay watch automatico sobre la lista de
   collaborators todavia.
5. Recuerda crear en GitHub el label `blocked-by-dependency` (o el que se
   configure) una sola vez — `gh_api.py` no expone `label create`; usar la UI de
   GitHub o `POST /repos/{repo}/labels` directo.
6. Resume lo que quedo configurado y lo que falta (emails sin resolver, label por crear).

### `roster refresh` — mantener el roster al dia cuando entra gente nueva

```bash
python scripts/roster.py build --git-root . --repo OWNER/NAME --roster-path .claude/orchestrator/roster.json
python scripts/roster.py seed-collaborators --repo OWNER/NAME --roster-path .claude/orchestrator/roster.json
```
Correr esto (o `init` de nuevo, es idempotente) cada vez que se agregue alguien al
equipo/repo. `skill_profile.py` no necesita nada de esto — lee `git log`
directamente y a alguien sin commits simplemente no le sale score en ningun modulo
(correcto: todavia no tiene un perfil de skill que ofrecer). `workload.py` si
depende de que el `github_login` este resuelto en `roster.json` para poder
consultar sus issues asignados.

### `map "<texto>"` — capacidad 1a, extraccion de contexto base

```bash
python scripts/context_map.py --graph-root . --text "<texto>" --grep-root . --top 15
```
Presenta: nodos/archivos mas relevantes (con `source_file#source_location`),
comunidades/modulos involucrados, y los `grep_hits` como fallback para
funcionalidad que aun no existe en el grafo (aclaralo: "no hay nodos existentes,
esto seria codigo nuevo"). Si el texto viene de un issue especifico en vez de una
descripcion suelta, usa `title + body` del issue como `--text`.

### `deps link` / `deps discover` / `deps check` — capacidad 1b

- `link`: `python scripts/dependency_graph.py link --state-path .claude/orchestrator/dependency_state.json --issue N --depends-on M --reason "..."`
- `discover`: `python scripts/dependency_graph.py discover --repo OWNER/NAME --state-path ...` — solo agrega edges nuevas, nunca pisa una manual.
- `check`: `python scripts/dependency_graph.py check --repo OWNER/NAME --state-path ... --config-path .claude/orchestrator/config.json`
  - Este es el comando que corre el job agendado. Lee `references/dependency-rules.md`
    para el detalle del estado active/frozen y por que es idempotente.
  - Reporta las `transitions` devueltas (issues recien congelados o descongelados)
    en texto plano al usuario, no solo el JSON crudo.
  - Cuando se invoca on-demand (no desde el scheduler), esta accion SI escribe en
    GitHub (labels + comentarios) sin pedir confirmacion adicional — es exactamente
    lo que el usuario pidio automatizar. Si corres esto por primera vez en una
    sesion interactiva y no estas seguro de que el usuario quiere que ya escriba en
    GitHub, muestra `--dry-run` primero y confirma.

### `profile` / `workload` — capacidad 2a/2b

```bash
python scripts/skill_profile.py build --git-root . --graph-root .
python scripts/skill_profile.py top-for-module --git-root . --graph-root . --module "Route Planning Config" --n 3
python scripts/workload.py compute --repo OWNER/NAME --roster-path .claude/orchestrator/roster.json --config-path .claude/orchestrator/config.json
```
Presenta como tabla legible (persona, score, modulos top), no como JSON crudo.

### `assign <issue-number>` — capacidad 2c, matching

1. `gh_api.py issue-get --number N` → titulo + body.
2. `context_map.py` sobre titulo+body → modulo(s) dominante(s).
3. `skill_profile.py top-for-module` para ese modulo → ranking de candidatos.
4. `workload.py compute` → filtra/anota candidatos saturados (ver
   `references/workload-scoring.md` para la logica exacta de cuando saltar a un
   segundo candidato vs solo advertir).
5. Presenta la recomendacion con el razonamiento explicito (por que este, por que
   no el mas obvio si aplica) y **pregunta antes de ejecutar**
   `gh_api.py issue-assign` — es una accion visible para todo el equipo en GitHub.

### `briefing <issue-number>` — capacidad 3

```bash
python scripts/briefing.py generate --repo OWNER/NAME --number N --git-root . --graph-root .
```
Sin `--post` solo genera y muestra el markdown para revision. Con `--post` lo
publica como comentario en el issue. Comportamiento por defecto segun como se
invoco:
- **Invocacion manual** (`/repo-orchestrator briefing N` tecleado por un humano en
  esta sesion): muestra el preview primero, pide confirmacion, luego corre con
  `--post` si confirma.
- **Invocacion desde el watcher agendado** (detecto que un issue paso a
  "in progress" via `deps check`/polling periodico, ver `schedule-setup`): correr
  directo con `--post` sin pedir confirmacion — es la automatizacion que el
  usuario pidio explicitamente para esta capacidad.

### `schedule-setup` — conectar la vigilancia periodica

Usa el skill `schedule` (ya disponible en este entorno) para crear un cron agent
que, cada N horas (pregunta al usuario el intervalo, sugiere 2-4h), en el
directorio de este repo corra:
```
/repo-orchestrator deps check
```
y opcionalmente detecte issues recien movidos a "in progress" (label `in-progress`
agregado desde el ultimo check, via `gh_api.py issue-timeline`) y dispare
`briefing.py generate --post` para esos. Documenta en el resumen al usuario que
esto empieza a escribir en GitHub automaticamente (labels + comentarios) apenas se
agenda — confirma que quiere eso antes de crear el cron job.

## Principios de seguridad de la automatizacion

- Las escrituras del **job agendado** (`deps check`, briefings automaticos por
  transicion a in-progress) estan pre-autorizadas por diseño — el usuario eligio
  explicitamente este modo. No pidas confirmacion en cada corrida o el scheduler
  no sirve de nada.
- Las escrituras **on-demand que un humano dispara en el momento** (`assign`,
  `briefing` manual) siempre muestran preview + piden confirmacion antes de tocar
  GitHub, porque son decisiones de juicio (a quien asignar) que vale la pena que
  un humano confirme, no solo automatizacion de rutina.
- Nunca inventes una dependencia entre issues sin que este declarada (manual o
  `discover`) o confirmada por un humano — ver `references/dependency-rules.md`.
- Si `roster.json` tiene emails `unresolved`, no asumas quien es esa persona;
  pregunta.
