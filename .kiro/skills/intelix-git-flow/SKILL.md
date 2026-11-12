---
name: intelix-git-flow
description: >-
  Prepara el gobierno de ramas GitFlow adaptado INTELIX en un proyecto que parte
  de la plantilla template_base. Crea el arbol de ramas permanentes (master/qa/
  develop), crea la rama de trabajo del colaborador (feature/bugfix/hotfix/release)
  desde su rama origen correcta, y genera los comandos GitLab (curl a la API) para
  proteger ramas, exigir Merge Requests con aprobacion y aplicar reglas de
  nomenclatura. Usar cuando el usuario pida: preparar ramas, inicializar git flow,
  crear rama de feature/bugfix/hotfix, proteger ramas en GitLab, configurar
  branch protection, flujo de trabajo git, gobierno de ramas, o clonar la
  plantilla para un proyecto nuevo.
---

# INTELIX Git Flow — Gobierno de ramas para proyectos de la plantilla

## Que hace

Implementa el modelo de branching de INTELIX (GitFlow adaptado) en tres capas de
enforcement, tal como define el `Reporte de Control de Versiones`:

- **Capa 1 — Prevencion (agente + docs):** la directiva `branching-rules.md` y
  `AGENTS.md` hacen que el agente guie al desarrollador por el camino correcto.
- **Capa 2 — Bloqueo (GitLab):** protecciones de rama, reglas de MR y push rules
  que el servidor **rechaza** aunque alguien las intente saltar. Esta skill
  **genera los comandos**; los ejecuta el lider con su token.
- **Capa 3 — Deteccion:** jobs de CI (verificador de backporting, ramas
  huerfanas) — fuera del alcance de esta skill, viven en el pipeline.

Esta skill cubre lo que se puede hacer **desde el clon**: crear ramas locales y
empujarlas, y **preparar** (no aplicar) la configuracion de GitLab.

## Modelo de ramas (nombres en ingles)

| Rama | Concepto | Nace de | Protegida | Recibe merge de |
|---|---|---|---|---|
| `master` | produccion | — | si | `qa`, `hotfix/*` (via MR) |
| `qa` | calidad | `develop` | si | `develop`, `hotfix/*` (via MR) |
| `develop` | desarrollo | `master`/base | si | `feature/*`, `bugfix/*` (via MR) |
| `feature/<id>-<slug>` | trabajo | `develop` | no | — |
| `bugfix/<id>-<slug>` | correccion | `develop` | no | — |
| `hotfix/<id>-<slug>` | emergencia | `master` | no | — |
| `release/vX.Y.Z` | version | `develop` | no | — |

Flujo de promocion: `feature/*` → `develop` → `qa` → `master`, **cada salto por
Merge Request aprobado por el lider**. Nadie hace push directo a las protegidas.

## Herramientas

| Script | Capa | Que hace |
|---|---|---|
| `crear-proyecto.bat` / `crear-proyecto.sh` | 1 (lider) | **Lanzador guiado del Maintainer.** Pregunta el nombre; ofrece **crear el repo en GitLab por API** (requiere `GITLAB_TOKEN`) o usar una URL manual; muestra un dry-run y, tras confirmar, arranca el proyecto. Envuelve `nuevo-proyecto.js`. |
| `scripts/git-flow/nuevo-proyecto.js` | 1 (lider) | Orquesta: (opcional) crea el repo por API (`--crear-repo`, token por env), apunta el remoto, crea master/qa/develop (delega en bootstrap), commit inicial e imprime los pasos de GitLab. **Dry-run por defecto.** |
| `scripts/git-flow/bootstrap-ramas.js` | 1 (local) | Crea master/qa/develop y las ramas de trabajo. **Dry-run por defecto.** |
| `scripts/git-flow/configurar-gitlab.js` | 2 (GitLab) | Genera los `curl` para proteger ramas, MR y push rules. **No ejecuta nada.** |
| `scripts/entregables/seleccionar-commit.js` | — | Arma el mensaje de commit con el ID jerarquico. Con `--commit` tambien commitea (confirmacion s/n, respeta el staging). |
| `scripts/git-flow/prepare-commit-msg.js` | — | Hook que pre-rellena el mensaje con el ID jerarquico de la rama (integracion IDE). Se instala con `install-hook-commit.bat/.sh`. |

## Roles y accesos del equipo

Quien entra a cada repo y con que nivel de GitLab esta en el **cuadro de roles**
`docs/roles-y-accesos-gitlab.md`. Resumen:

- **Maintainers:** definidos en el roster del proyecto (uno designado como
  principal). Crean los repos, dan acceso a los demas, aprueban/mergean MR y
  tambien desarrollan.
- **Developers (sin prefijo):** rol **Developer**. Hacen los commits (push a
  `feature/*`/`bugfix/*` + MR hacia `develop`).
- **Soluciones (SL):** rol **Reporter** (invitado de solo lectura); revisan
  seguimientos y planes.
- **Apoyo (BD):** acceso **on-demand**, solo si la tarea lo requiere.

## Procedimiento del programador — desvincular template_base

Si la carpeta local es un clon de la plantilla, `origin` sigue apuntando al
repositorio base. El programador corta ese vinculo **en una copia o en un clon
nuevo**, nunca en la carpeta con la que el equipo actualiza `template_base`.
`git remote set-url` no alcanza: el proyecto heredaria el historial de la
plantilla y, ejecutado sobre la copia de trabajo, reescribiria su `origin`.

```powershell
# 1. Clonar la plantilla en otra carpeta
git clone <url-de-template_base> mi-proyecto
cd mi-proyecto

# 2. Desvincular el repositorio base de la plantilla
git remote remove origin

# 3. Cortar el historial (el .git sigue siendo el de la plantilla)
Remove-Item -Recurse -Force .git
git init
git add -A
git commit -m "chore: scaffold inicial desde template_base IA-DLC"

# 4. Asociar el repositorio nuevo del proyecto
git remote add origin <url-del-repo-nuevo>
```

Despues, el arbol `master` / `qa` / `develop` lo crea el lanzador o
`bootstrap-ramas.js init --apply --push`. No renombres la rama a `main`.

## Flujo del LIDER (clonar la plantilla y arrancar un proyecto)

### Camino rapido (recomendado): lanzador guiado

Desde el clon ya desvinculado (procedimiento del programador, arriba), el Maintainer ejecuta:

```
crear-proyecto.bat        (Windows: doble clic o consola)
./crear-proyecto.sh       (Linux/macOS)
```

El lanzador pregunta el **nombre del proyecto** y luego ofrece dos caminos para el
repositorio: **(1) crearlo automaticamente en GitLab por API** (grupo `grupomayoreo`,
visibilidad `private`; requiere exportar `GITLAB_TOKEN` con scope `api`) o **(2) usar
la URL de un repo creado manualmente**. Muestra una **vista previa (dry-run)** de lo
que hara y, tras tu confirmacion, ejecuta: (crea el repo si elegiste API), apunta el
remoto, crea `master`/`qa`/`develop`, hace el **commit inicial** y te imprime los
**siguientes pasos** (proteger ramas e invitar miembros por rol).

> **Token (seguridad):** genera un Personal Access Token en GitLab
> (`Preferences > Access Tokens`, scope `api`, expiracion corta) y exportalo en la
> terminal antes de ejecutar: `\$env:GITLAB_TOKEN = "<token>"` (Windows) o
> `export GITLAB_TOKEN="<token>"` (Linux/macOS). Nunca se guarda en el repo; el
> dry-run muestra los `curl` con el token enmascarado.

> Equivale a `node scripts/git-flow/nuevo-proyecto.js --nombre "<n>" --repo <url> --apply --push`
> o, creando el repo por API, `node scripts/git-flow/nuevo-proyecto.js --nombre "<n>" --crear-repo --apply --push`.
> Sin `--apply` es dry-run; anade `--push` para empujar las ramas.

### Camino manual (paso a paso, si prefieres control fino)

1. Clonar `template_base` en **otra carpeta** y aplicar el procedimiento del
   programador (desvincular `origin`, borrar `.git`, `git init`, commit inicial,
   `git remote add origin <url-del-repo-nuevo>`). No uses `git remote set-url`
   sobre la copia de trabajo de la plantilla.
2. Ver que ramas faltan (sin cambiar nada):
   ```
   node scripts/git-flow/bootstrap-ramas.js status
   ```
3. Crear el arbol permanente (revisar el dry-run y luego aplicar y empujar):
   ```
   node scripts/git-flow/bootstrap-ramas.js init            # dry-run
   node scripts/git-flow/bootstrap-ramas.js init --apply --push
   ```
4. Preparar la proteccion en GitLab (genera los comandos; NO los ejecuta):
   ```
   node scripts/git-flow/configurar-gitlab.js todo
   ```
   Exportar `GITLAB_URL`, `GITLAB_PROJECT`, `GITLAB_TOKEN` (token del lider, scope
   `api`) y ejecutar los `curl` que imprime. El token nunca va al repo.
5. Invitar a los miembros (GitLab > Manage > Members) segun el cuadro de roles
   `docs/roles-y-accesos-gitlab.md`: Developers del proyecto → Developer, SL →
   Reporter, BD → solo si hace falta. Ver tambien
   `node scripts/git-flow/configurar-gitlab.js permisos`.

## Flujo del COLABORADOR (dia a dia)

1. Traer lo ultimo y crear la rama de trabajo desde `develop`:
   ```
   node scripts/git-flow/bootstrap-ramas.js branch --tipo feature --id ISSUE-45 --desc "login" --apply
   ```
   (para correcciones: `--tipo bugfix`; para emergencia desde `master`: `--tipo hotfix`.)
2. Trabajar y, al cerrar la unidad, armar el commit con el ID jerarquico:
   ```
   node scripts/entregables/seleccionar-commit.js
   ```
   Ver `commit-rules.md` (tipo + ID + issue de rama) y `unit-commit-gate.md`.
3. `git push` de la rama de trabajo y abrir un **Merge Request** hacia `develop`.
   El colaborador NO mergea a develop/qa/master: eso lo aprueba el lider.

## Protocolo de hotfix (resumen)

`hotfix/*` nace de `master`, se corrige, se abre MR a `master` (aprobacion del
lider), se etiqueta `vX.Y.Z`, y **es obligatorio backportear** el mismo cambio a
`develop` y a `qa`. Detalle en `.kiro/steering/branching-rules.md`.

## Seguridad y limites (honestos)

- `bootstrap-ramas.js` corre **dry-run** salvo `--apply`; el push solo con `--push`.
- `configurar-gitlab.js` **no ejecuta ni guarda tokens**: solo imprime comandos.
- La proteccion real de ramas y la aprobacion de MR **viven en el servidor
  GitLab** (capa 2). Un agente o script local no puede impedir por si mismo un
  `git push` directo si el servidor no esta protegido. Por eso el paso 4 del
  camino manual (proteger ramas en GitLab) es imprescindible.
- `master`, `qa` y `develop` son **por proyecto**; cada repo que parta de la
  plantilla aplica su propia proteccion con el token de su lider.
