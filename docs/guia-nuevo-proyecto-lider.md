# Runbook del Líder — Crear un Proyecto Nuevo con intelix-cli

> **Para quién:** el líder/maintainer (Owner en GrupoMayoreo) que arranca proyectos
> nuevos. **Objetivo:** de la plantilla a un repo nuevo en GitLab, con toda la
> metodología/skills/docs, ramas protegidas y listo para que el desarrollador se conecte.

> **Canal único (decisión D1):** la plantilla se distribuye como el paquete `intelix-cli`
> publicado en el Package Registry privado de GitLab. El líder **no copia la carpeta
> `template_base`** ni clona el repo de la plantilla para derivar proyectos: instala el CLI y
> ejecuta `intelix-cli init`. La copia manual de carpetas queda **deprecada** (ver el final de
> esta guía).

> **Concepto clave (leer una vez):** la **config del servidor GitLab** (protección de
> ramas, approval rules, roles, schedules) **NO se hereda** al crear el repo — vive
> en el servidor, atada a cada repo. Lo que `intelix-cli` entrega es el **contenido del repo**
> (`.kiro/`, skills, steering, `docs/`, estándares, scripts, CI). Por eso este
> runbook cubre los dos lados: generar el contenido (CLI) **y** aplicar la protección
> (servidor) en cada proyecto nuevo.

---

## Requisitos previos (una vez)

- Ser **Owner o Maintainer** del grupo `grupomayoreo` en GitLab.
- Tener un **Personal Access Token** con scope `api` (Settings > Access Tokens) para crear el repo
  y proteger ramas.
- **Tener instalado `intelix-cli`.** La instalación y autenticación (token personal o Deploy Token)
  están en el `README.md` del CLI, sección "Quien instala el CLI y como se autentica". Verifica con:

  ```bash
  intelix-cli --version
  ```

- Node.js 20.12+, Git, Bun y acceso de red a `https://git.intelix.biz`.
- El token **nunca** se escribe en el repo ni se comparte; solo se exporta en tu terminal.

---

## Vista rápida del flujo

```text
1. Instalar/actualizar intelix-cli     (desde el Package Registry; ver README del CLI)
2. Generar el proyecto                 (intelix-cli init  — carpeta nueva con el ADN INTELIX)
3. Crear el repo en GitLab + subir     (lanzador crear-proyecto)
4. Proteger master/qa/develop          (configurar-gitlab.js + tu token)
5. Invitar al desarrollador            (rol Developer)
6. Entregar el link                    (el dev clona y empieza a trabajar)
```

---

## Paso 1 — Instalar o actualizar intelix-cli

La plantilla llega por el CLI, no por copia de carpeta. Para instalar o traer una versión nueva,
sigue el `README.md` del CLI (sección de instalación con token personal o Deploy Token):

```bash
npm install --global intelix-cli@<version> \
  --registry=https://git.intelix.biz/api/v4/projects/2300/packages/npm/
intelix-cli --version
```

> Instalar una versión nueva del paquete trae la metodología, skills y docs actualizados. No hace
> falta `git pull` sobre `template_base`: eso es solo para quienes desarrollan el propio CLI.

## Paso 2 — Generar el proyecto

### Proyecto nuevo (greenfield)

Crea la carpeta del proyecto con todo el ADN INTELIX. El wizard clasifica el proyecto (tipo de
solución, nuevo/existente, baseline agentic/AI-DLC, infraestructura) antes de pedir nombre y
agentes:

```bash
intelix-cli init mi-proyecto-nuevo
```

Para automatización sin prompts, pasar el perfil por flags (ver `README.md`, sección "Opciones"):

```bash
intelix-cli init mi-proyecto-nuevo --yes \
  --agents cursor \
  --solution-type web-app --project-lifecycle new --infrastructure serverless
```

El proyecto queda en `./mi-proyecto-nuevo/` con su propio historial git por iniciar. No hay que
borrar ningún `.git` heredado de la plantilla: el CLI no copia el repo de la plantilla.

### Proyecto existente (brownfield)

Si el repo ya existe, no se usa `init` a ciegas: primero el preflight de solo lectura y luego la
adopción transaccional (ver `README.md`, sección "Uso" y `docs/guides/matriz-soporte-intelix.md`):

```bash
cd mi-repo-existente
intelix-cli adopt --analyze
# si no hay bloqueantes:
intelix-cli adopt --apply --agents <agente> --aidlc-agent <agente>
```

## Paso 3 — Crear el repo en GitLab y subir

> Aplica a un proyecto **nuevo** que todavía no tiene repo remoto. Un proyecto existente ya tiene su
> `origin`; para ese caso, omite este paso.

Entra a la carpeta del proyecto generado e inicia su historial:

```powershell
cd mi-proyecto-nuevo
git init
git add -A
git commit -m "chore: scaffold inicial con intelix-cli"
```

Exporta tu token (en tu terminal, no en el repo):

```powershell
$env:GITLAB_TOKEN = "<tu-token-con-scope-api>"
```

### 3.1 Elegir el nombre (opcional, propone slugs válidos)

```powershell
node scripts/git-flow/nuevo-proyecto.js --sugerir "Nombre largo del proyecto"
```

### 3.2 Vista previa (DRY-RUN, no ejecuta nada)

```powershell
node scripts/git-flow/nuevo-proyecto.js --nombre "mi-proyecto-nuevo" --crear-repo
```

Revisa que el nombre, el grupo (`grupomayoreo`) y la visibilidad (`private`) sean correctos.

### 3.3 Ejecutar de verdad (crea el repo por API, apunta el remoto, crea ramas y sube)

```powershell
node scripts/git-flow/nuevo-proyecto.js --nombre "mi-proyecto-nuevo" --crear-repo --apply --push
```

Esto hace, en un solo paso:
- **Paso 0:** crea el repo en GitLab por API (grupo `grupomayoreo`, `private`).
- **Paso 1:** apunta `origin` al repo recién creado.
- **Paso 2:** crea las ramas `master`/`qa`/`develop`.
- **Paso 3:** sube (push) las tres ramas con todo el contenido generado.

> Si prefieres crear el repo a mano en la UI de GitLab y solo subir, omite `--crear-repo`
> y pasa la URL con `--repo <url>`.

## Paso 4 — Proteger las ramas del proyecto nuevo (Capa 2)

Genera los comandos `curl` para ESTE proyecto y ejecútalos con tu token. Primero define
las variables (apuntando al repo nuevo, no a la plantilla):

```powershell
$env:GITLAB_URL     = "https://git.intelix.biz"
$env:GITLAB_PROJECT = "grupomayoreo/mi-proyecto-nuevo"
$env:GITLAB_TOKEN   = "<tu-token-con-scope-api>"
$env:GITLAB_PROJECT_ENC = [uri]::EscapeDataString($env:GITLAB_PROJECT)
```

Genera e inspecciona los comandos (no ejecuta nada, solo imprime):

```powershell
node scripts/git-flow/configurar-gitlab.js todo
```

Copia y ejecuta los `curl` que imprime. Aplican la protección objetivo:

| Rama | Push | Merge | Force push |
|------|------|-------|------------|
| `master` (producción) | No one | Maintainer | OFF |
| `qa` (calidad) | No one | Maintainer | OFF |
| `develop` (desarrollo) | No one | Developer+ | OFF |

> También puedes hacerlo por la UI: `Settings > Repository > Protected branches`.
> En GitLab 15.11 el control de push es *Allowed to push and merge* = **No one** y
> *Allowed to merge* = **Maintainers** (dos dropdowns separados por rama).

> **Aclaración Owner vs. Maintainer (importante):** con *push = No one*, **nadie** hace
> `git push origin master` directo, ni siquiera tú como Owner — todo entra por Merge
> Request. Pero *Allowed to merge = Maintainers* significa **“Maintainer o superior”**, y en
> GitLab la jerarquía es `Guest < Reporter < Developer < Maintainer < Owner`. Como **Owner
> es superior a Maintainer**, tú **sí puedes aprobar y mergear** los MR hacia `master`.
> Resumen: push directo a rama protegida = bloqueado para todos; mergear el MR = permitido
> a Maintainer y Owner. No quedas excluido; solo cambia el *cómo* (por MR, no por push).

### 4.1 Ajustes de Merge Request (recomendado)

En `Settings > Merge requests`: *Pipelines must succeed* ON, *All threads resolved* ON,
*Delete source branch* ON (solo borra ramas efímeras `feature/*` al mergear).

> **No marcar “Delete source branch”** al mergear MRs cuya rama origen sea permanente
> (`master`/`qa`/`develop`): borraría una rama permanente. El auto-delete es para `feature/*`.

## Paso 5 — Invitar al desarrollador

En `Manage > Members` del repo nuevo, invita a cada persona con su rol:

| Quien | Rol GitLab |
|-------|------------|
| Desarrolladores del proyecto | Developer |
| Otro maintainer/líder | Maintainer |
| Soluciones (SL) | Reporter (solo lectura) |
| Apoyo (BD) | Solo si la tarea lo requiere |

Detalle nominal del equipo: `docs/roles-y-accesos-gitlab.md`.

## Paso 6 — Entregar el proyecto al desarrollador

El repo ya tiene el commit inicial con TODO el ADN INTELIX (metodología, skills, steering,
docs, estándares). Envíale al desarrollador:

1. **El link del repo:** `https://git.intelix.biz/grupomayoreo/mi-proyecto-nuevo`.
2. **Instrucciones para conectarse y empezar:**

```powershell
git clone https://git.intelix.biz/grupomayoreo/mi-proyecto-nuevo.git
cd mi-proyecto-nuevo
git checkout develop

# Crear su rama de trabajo para una tarea/issue (nace de develop):
node scripts/git-flow/bootstrap-ramas.js branch --tipo feature --id ISSUE-45 --desc "login" --apply
```

> El desarrollador que solo trabaja sobre el proyecto **no necesita instalar `intelix-cli`**: las
> skills y los docs ya viven en el repo clonado. Solo instalan el CLI quienes vayan a arrancar o
> adoptar otros proyectos.

3. A partir de ahí, el desarrollador trabaja en su `feature/*`, commitea con el ID
   (`seleccionar-commit.js`, opcional `--commit`) e integra por **Merge Request** hacia
   `develop`. El líder aprueba y promueve `develop → qa → master` por MR.

---

## Actualizar un proyecto ya entregado

Para traer una versión nueva de la plantilla a un proyecto ya configurado, el líder instala la
versión nueva del CLI y corre `sync` dentro del proyecto:

```bash
cd mi-proyecto-nuevo
intelix-cli sync                 # refresca skills, docs y AI-DLC segun la politica persistida
intelix-cli sync --template-only # solo skills/docs/overlays, sin tocar el runtime AI-DLC
intelix-cli status               # diagnostico de integridad (solo lectura)
```

---

## Notas y advertencias

- **Copia manual de carpetas: deprecada.** No derivar proyectos copiando `template_base` ni
  clonando el repo de la plantilla y reseteando git. Esa vía producía skills y docs distintos entre
  proyectos (drift) y no deja versión trazable. El canal único es `intelix-cli` desde el Package
  Registry (decisión D1). `clone + build + link` queda solo para quienes **desarrollan** el CLI.
- **No endurecer las ramas de `template_base`:** la plantilla está en desarrollo activo por el
  equipo; la protección se aplica en **cada proyecto derivado**, no en la plantilla.
- **La protección no se hereda:** repetir el Paso 4 en cada repo nuevo.
- **Token:** úsalo solo en tu terminal; no lo dejes en archivos ni en el historial de shell.
- **Borrar un repo** (si una prueba sale mal) requiere rol **Owner**; un Maintainer no puede.

## Documentos relacionados

- `README.md` del CLI — instalación, autenticación y comandos (`init`, `adopt`, `sync`, `status`).
- `docs/guides/matriz-soporte-intelix.md` — escenarios soportados y lo que queda fuera de alcance.
- `docs/guia-configuracion-gitlab.md` — detalle de protección, approval rules y push rules.
- `docs/roles-y-accesos-gitlab.md` — cuadro nominal de roles del equipo.
- `docs/protocolo-hotfixes.md` — runbook de hotfixes.
- `.kiro/steering/branching-rules.md` — directiva de gobierno de ramas (Capa 1).
- `scripts/git-flow/nuevo-proyecto.js` y `configurar-gitlab.js` — herramientas usadas aquí.
