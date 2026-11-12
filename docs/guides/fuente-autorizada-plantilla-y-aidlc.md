# Fuente autorizada: plantilla Git + AI-DLC V2

Como asegurar que **cada desarrollador** use la plantilla aprobada en GitLab
y la **version autorizada** de AI-DLC en su PC.

Proyecto: intelix-estandar-frontend · Actualizado: 2026-10-28

---

## 1. Principio

Hay **dos artefactos** que deben quedar controlados:

| Artefacto | Donde se decide | Como llega al Dev |
|-----------|-----------------|-------------------|
| **Plantilla INTELIX** (skills, docs, Gate 0, estandares) | Repo GitLab de la plantilla / `intelix-cli` versionado | Clon del proyecto generado o `intelix-cli sync` |
| **Runtime AI-DLC** (binario + harness) | Pin `aidlcVersion` en `.intelix/config.json` del proyecto | `intelix-cli init/sync` o instalador oficial con esa version |

Si cada uno baja “lo ultimo de GitHub” o copia una carpeta vieja del escritorio, se rompe el estandar.

---

## 2. Plantilla aprobada en Git (lado organizacion)

### 2.1 Una sola fuente

1. Publicar la plantilla / `intelix-cli` en **un repo GitLab oficial** (ej. grupo corporativo).
2. Proteger la rama de entrega (`develop` o `main`) y exigir MR + aprobacion de Arquitectura.
3. Marcar releases aprobados con **tag semantico** (ej. `plantilla-1.2.0`) o, como minimo, un commit conocido en la wiki del equipo.
4. Declarar en el wiki: *“La unica plantilla valida es el tag / rama X del repo Y”*.

### 2.2 Como nace un proyecto (Lider, no el Dev)

El Lider/Maintainer:

1. Actualiza la plantilla oficial (`git pull` del tag/rama aprobada).
2. Genera el proyecto con el flujo corporativo:
   - preferido: `intelix-cli init` instalado desde ese mismo repo/tag, **o**
   - runbook `docs/guia-nuevo-proyecto-lider.md` (copia limpia + push a GitLab).
3. Protege `develop` / `qa` / `master` en el proyecto nuevo.
4. Invita al Dev como **Developer** (no Owner de la plantilla).

El desarrollador que ya recibio el link del proyecto **clona ese repo**. Si en cambio su carpeta local es un clon de `template_base`, primero desvincula el repositorio base y asocia el repo nuevo (procedimiento del programador en `docs/guia-nuevo-proyecto-lider.md` y en la skill `intelix-git-flow`). No ejecutes esos comandos sobre la copia con la que el equipo actualiza la plantilla, ni uses `git remote set-url` en ella.

### 2.3 Como el Dev se mantiene al dia

```bash
git clone <url-del-proyecto-en-gitlab>
cd <proyecto>
git checkout develop
git pull
```

Si el equipo actualiza skills/docs desde el CLI:

```bash
# intelix-cli debe ser el instalado desde el repo/tag aprobado
intelix-cli sync --force
```

**Prohibido:** ZIP de un companero, copia de `C:\temp\...` sin commit, o `git pull` de un fork personal como fuente de verdad.

### 2.4 Controles GitLab utiles

| Control | Efecto |
|---------|--------|
| Project template en GitLab (Settings → General) | “New project from template” solo desde el repo oficial |
| Branch protection + MR obligatorio | Nadie mete cambios a la plantilla sin revision |
| Variable de grupo `INTELIX_AIDLC_VERSION` (opcional) | Refuerza el pin en CI |

La resolución de versión no concede permiso para actualizar. Si
`.intelix/config.json` declara `aidlcPolicy: preserve`, cualquier valor de
entorno distinto del pin registrado detiene `sync`. El cambio requiere
`--aidlc-policy upgrade --aidlc-version <v>`. Con `aidlcPolicy: none`, `sync` no
instala el runtime aunque no se repita `--skip-aidlc`.
| Job `gate0_discovery` / documentacion en `docs/` | El proyecto trae las reglas visibles |

---

## 3. Version autorizada de AI-DLC en la PC (lado runtime)

### 3.1 El pin vive en el proyecto

`intelix-cli init` lo registra en `.intelix/config.json` (versionado):

```json
"aidlcPolicy": "preserve",
"aidlcVersion": "2.8.2"
```

Ese valor es la **version autorizada del equipo**. El proyecto no lleva `.env` de Intelix: el
default lo trae compilado el propio CLI.
Orden de resolucion de `intelix-cli`:

1. `--aidlc-version` (solo para casos excepcionales documentados)
2. Variable de entorno de maquina `INTELIX_AIDLC_VERSION` (CI)
3. `.intelix/config.json` (pin del proyecto)
4. Default del CLI (`2.8.2`)

### 3.2 Instalacion correcta en la PC del Dev

**Opcion A — Recomendada (via intelix-cli del tag aprobado)**

```bash
# 1) Instalar el CLI desde el repo/tag aprobado de la plantilla
git clone <url-oficial-intelix-cli>
cd intelix-cli
git checkout <tag-aprobado>   # ej. plantilla-1.2.0
npm install && npm run build && npm link

# 2) En el proyecto del equipo
cd <proyecto>
intelix-cli sync
# El CLI lee el pin de .intelix/config.json, descarga ese release AI-DLC, verifica checksums y corre aidlc config
aidlc doctor
```

**Opcion B — Instalador nativo AWS con la misma version del pin**

```powershell
# Leer el pin del proyecto
Get-Content .intelix\config.json | Select-String aidlcVersion

# Instalar exactamente esa version (ejemplo 2.8.2)
irm https://github.com/awslabs/aidlc-workflows/releases/download/v2.8.2/install.ps1 -OutFile install.ps1
./install.ps1 -Version 2.8.2
aidlc config
aidlc doctor
```

```bash
curl -fsSL https://github.com/awslabs/aidlc-workflows/releases/download/v2.8.2/install.sh | sh -s -- --version 2.8.2
aidlc config
aidlc doctor
```

Sustituir `2.8.2` por el valor exacto de `aidlcVersion` en `.intelix/config.json`.

### 3.3 Que NO hacer

| Incorrecto | Por que |
|------------|---------|
| Instalar con `releases/latest` | Puede ser 2.9.x u otra linea no aprobada |
| Clonar la rama `v2` de aidlc-workflows | Flotante; no es el pin del equipo |
| Usar el Kiro Power que baja `heads/v2.zip` sin verificar version | Puede divergir del pin del proyecto |
| `npm install aidlc` del registry publico | No es el runtime AWS AI-DLC Workflows |
| Editar `aidlcVersion` en `.intelix/config.json` a mano | El cambio va por `sync --aidlc-policy upgrade` y MR |

---

## 4. Verificacion (Dev, 2 minutos)

En la raiz del proyecto:

```bash
# 1) Pin del repo (campos aidlcVersion / aidlcAgent)
type .intelix\config.json   # Windows
# cat .intelix/config.json  # macOS/Linux

# 2) Runtime saludable
aidlc doctor

# 3) Chequeo automatico de la plantilla (si esta disponible)
python .intelix/scripts/verify_authorized_stack.py
```

Criterio de OK:

- `aidlcVersion` coincide con la version publicada por Arquitectura.
- `aidlc doctor` no reporta harness roto.
- Skills/docs vienen del ultimo `sync` (o del scaffold del Lider), no de una carpeta suelta.

---

## 5. Responsabilidades

| Rol | Debe |
|-----|------|
| **Arquitectura** | Aprobar tag de plantilla y valor de `INTELIX_AIDLC_VERSION` |
| **Lider / Maintainer** | Crear proyectos solo desde la fuente oficial; proteger ramas |
| **Dev** | Clonar el **proyecto** en GitLab; no improvisar plantilla ni runtime |
| **CI** | Fallar o avisar si Gate 0 / documentacion critica falta; opcional: assert del pin |

---

## 6. Flujo resumido

```text
[Tag aprobado plantilla + pin 2.8.2]
        │
        ▼
 Lider: intelix-cli init / runbook → repo GitLab del producto
        │
        ▼
 Dev: git clone <proyecto> → npm/python segun skills → intelix-cli sync (si aplica)
        │
        ▼
 Runtime: AI-DLC = aidlcVersion de .intelix/config.json → aidlc doctor
        │
        ▼
 Trabajo: Product-Definition → Gate 0 → /aidlc o Handoff
```

---

## 7. Cuando se autoriza un cambio de version

1. Arquitectura publica nota + nuevo valor en el `.env` del repo del CLI (`npm run build` lo compila como default; ese `.env` no viaja a los proyectos).
2. Tag nuevo de `intelix-cli` / plantilla (los proyectos nuevos nacen con ese pin).
3. En cada proyecto existente: MR con `intelix-cli sync --aidlc-policy upgrade --aidlc-version <v>` → `aidlc doctor`.
4. Comunicar al equipo: *“a partir de fecha X, solo pin Y.Y.Y”*.

Checklist detallado de bump: mantener alineado con `GUIA-CONTENIDO.md` (seccion version AI-DLC) del repo del CLI.
