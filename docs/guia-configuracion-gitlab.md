# Guía de Configuración de GitLab — Protección, Permisos y Gestión (INTELIX / IA-DLC)

> **Guía de configuración (M4).** Capa 2 (bloqueo por infraestructura GitLab) del
> gobierno de ramas + la gestión de trabajo de la **Fase 2** del plan de
> integración. Cierra las brechas B2, B4, B5, B6, B9.
>
> **La Capa 2 es la más importante: sin ella, todo lo demás es sugerencia.** El
> agente IA guía (Capa 1) pero un humano en terminal puede ignorarlo; solo el
> servidor GitLab **rechaza** de verdad las acciones prohibidas.

**Mapeo de nombres:** `master` = producción, `qa` = calidad, `develop` = desarrollo.
Escrito para **GitLab CE 15.11 self-hosted**.

---

## 0. Dos caminos: UI o API (curl)

Toda esta configuración se puede aplicar de dos formas equivalentes:

1. **Por la UI de GitLab** (pasos manuales, secciones 1-4 de abajo).
2. **Por la API REST** con los `curl` que **genera** el script (no ejecuta ni
   guarda token):

   ```
   node scripts/git-flow/configurar-gitlab.js todo
   ```

   El script imprime los comandos de Branch Protection, Approval Rules, MR
   settings y Push Rules. **Los ejecuta el líder** con su token, nunca el agente.

> **Quién aplica esto:** el **Líder de Arquitectura / DevOps (Owner o Maintainer)**
> del proyecto, una sola vez al crear el repo. Requiere un **Personal/Project
> Access Token con scope `api`**.

### Preparar el token (fuera del historial de shell)

```powershell
# PowerShell
$env:GITLAB_URL     = "https://git.intelix.biz"
$env:GITLAB_PROJECT = "grupomayoreo/mi-proyecto"
$env:GITLAB_TOKEN   = "<tu token con scope api>"   # NUNCA en el repo
$env:GITLAB_PROJECT_ENC = [uri]::EscapeDataString($env:GITLAB_PROJECT)
```

---

## 1. Protección de ramas (Branch Protection) — cierra B2

`Settings > Repository > Protected branches`

| Rama | Allowed to push | Allowed to merge | Aprobaciones |
|------|-----------------|------------------|--------------|
| `master` (producción) | ❌ No one | Maintainer | ✅ 1 (Arquitectura) |
| `qa` (calidad) | ❌ No one | Maintainer | ✅ 1 (QA o Arquitectura) |
| `develop` (desarrollo) | ❌ No one | Developer + | ✅ 1 (Líder Técnico) |
| `feature/*` | Developer | Developer + | Opcional |

> **Efecto real:** si alguien (humano o agente) intenta `git push origin master`,
> GitLab responde `403 Forbidden`. No hay forma de saltarlo sin ser Admin.

Generar por API: `node scripts/git-flow/configurar-gitlab.js proteger`
(setea `push_access_level=0`, `merge_access_level=40/30`, `allow_force_push=false`).

---

## 2. Reglas de aprobación (Merge Request Approval Rules) — cierra B4

`Settings > Merge requests > Merge request approvals`

- **Approvals required = 1** como mínimo para MR hacia `master`, `qa`, `develop`.
- Aprobadores según la rama (ver matriz de permisos, sección 5).
- Recomendado: **"Prevent approval by the author"** para evitar autoaprobación.

Generar por API: `node scripts/git-flow/configurar-gitlab.js aprobaciones`.

---

## 3. Ajustes de Merge Request — cierra B6 y B9

`Settings > Merge requests`

| Configuración | Valor | Efecto |
|---------------|-------|--------|
| Merge method | **Fast-forward** (o Squash) | Historial limpio al integrar features |
| Squash commits when merging | **Require / Encourage** | Squash & Merge para `feature/*` y `bugfix/*` |
| Pipelines must succeed | ✅ Activado | No se puede mergear si falla lint/test |
| All threads must be resolved | ✅ Activado | No se mergea con observaciones abiertas |
| Delete source branch | ✅ Activado | Auto-delete de ramas efímeras (**cierra B9**) |

> **Hotfix:** usa **Merge Commit** (no squash) para preservar la trazabilidad del
> parche en las tres ramas (ver `docs/protocolo-hotfixes.md`).

Generar por API: `node scripts/git-flow/configurar-gitlab.js mergerequest`.

---

## 4. Push Rules (nomenclatura obligatoria) — cierra B5 parcial

`Settings > Repository > Push rules`

| Regla | Regex / Valor | Efecto |
|-------|---------------|--------|
| Branch name | `^(master\|qa\|develop\|feature\/\|bugfix\/\|hotfix\/\|release\/)` | Rechaza ramas mal nombradas |
| Commit message | `^(feat\|fix\|docs\|style\|refactor\|test\|chore)(\(.+\))?: .+` | Rechaza commits no semánticos |
| Prevent secrets | ✅ Activado | Bloquea `.env`, llaves privadas, etc. |

> **Nota CE:** las Push Rules son de GitLab Premium en algunas versiones. Si tu
> CE 15.11 no las expone, el regex de rama se cubre en la Capa 1 (agente + script
> `bootstrap-ramas.js`) y el de commit en `commit-rules.md`.

Generar por API: `node scripts/git-flow/configurar-gitlab.js pushrules`.

---

## 5. Matriz de permisos por rol — cierra B5

`Manage > Members` (se asigna el rol del proyecto a cada miembro):

| Rol GitLab | `feature/*` | `develop` | `qa` | `master` |
|------------|-------------|-----------|------|----------|
| **Developer** (colaboradores) | Push + MR | Solo MR | Solo lectura | Bloqueado |
| **Maintainer** (Líder Técnico) | Push + MR | Aprobar + Merge | Aprobar + Merge | Solo MR |
| **Reporter** (QA) | Lectura | Lectura | Validar + MR | Lectura |
| **Owner/Admin** (DevOps) | Lectura | Admin CI/CD | Admin CI/CD | Aprobar + Tag |

Referencia informativa: `node scripts/git-flow/configurar-gitlab.js permisos`.

> **Cuadro de roles del equipo:** el listado nominal de quién entra a cada repo y
> con qué rol (Maintainers, Developers, SL como Reporter, BD on-demand) está en
> `docs/roles-y-accesos-gitlab.md`. Resumen del mapeo prefijo → rol GitLab:
>
> | Grupo (prefijo en el roster) | Rol GitLab |
> |---|---|
> | Maintainers (definidos en el roster del proyecto) | Maintainer / Owner |
> | Desarrolladores (sin prefijo) | Developer |
> | Soluciones (`SL`) | Reporter (invitado de solo lectura) |
> | Apoyo (`BD`) | Solo si la tarea lo requiere |

> **Limitación honesta de la Capa 2:** GitLab **no** puede evitar el olvido del
> backporting de un hotfix, ni un "rubber stamp" (aprobación sin revisión real).
> Eso se cubre con la Capa 3 (`backport-check`) y cultura/auditoría.

---

## 6. Gestión del trabajo (Fase 2 del plan de integración)

La configuración de **gestión del sprint** (Milestones, Issue Boards, Labels de
flujo y excepción, time tracking `/estimate` `/spend`) está documentada en detalle
en **`docs/guia-seguimiento-gitlab.md`**. Resumen de lo que hay que crear:

- **Milestones** por sprint con fechas de inicio/fin (`Plan > Milestones`).
- **Issue Board** (Kanban) con columnas por label de estado
  (`Status::To Do`, `Status::In Progress`, `Status::In Review`, `Status::Done`).
- **Labels de excepción** para el recordatorio diario:
  `Status::Certificación`, `On-Hold::Vacaciones`, `Pausa`.
- **Time tracking summary** activado en el board (Plan vs. Realizado).

> El `/spend` lo **confirma el desarrollador**, la IA solo sugiere
> (`commit-rules.md`). Nunca se imputa tiempo sin validación humana.

---

## 7. Pipeline y recordatorio diario (Fase 3)

- El fragmento `.gitlab/intelix-ci.yml` trae `daily_sync_check` (recordatorio
  diario por comentario en issues) y `build_dashboard` (artefacto del reporte).
  Debe estar activado desde `.gitlab-ci.yml` mediante el include documentado en
  `docs/guides/integracion-ci-aditiva.md`.
- El pipeline **completo** por rama (lint/test/build/deploy dev-qa-prod,
  `backport-check`, `orphan-branches`) está en **`.gitlab-ci.yml.reference`** (M5),
  para adaptar por proyecto.
- Configuración del token del recordatorio (`SYNC_CHECK_TOKEN`) y el schedule:
  ver `docs/guia-seguimiento-gitlab.md`, sección 6.

---

## 8. Orden de aplicación recomendado

1. Crear las ramas permanentes localmente y empujarlas:
   `node scripts/git-flow/bootstrap-ramas.js init --apply --push`.
2. Aplicar protección de ramas (sección 1).
3. Aplicar approval rules y ajustes de MR (secciones 2-3).
4. Aplicar push rules si tu edición las soporta (sección 4).
5. Asignar roles a los miembros (sección 5).
6. Configurar Milestones, Boards y Labels (sección 6).
7. Configurar el token y schedule del `daily_sync_check` (sección 7).

Todo lo generable por API: `node scripts/git-flow/configurar-gitlab.js todo`.

---

## 9. Documentos relacionados

- `docs/estrategia-control-versiones.md` — modelo formal de branching (M1).
- `docs/protocolo-hotfixes.md` — runbook de hotfixes (M3).
- `docs/guia-seguimiento-gitlab.md` — Milestones, Boards, Labels, `/spend`.
- `.gitlab-ci.yml.reference` — pipeline por rama + detección (M5).
- `scripts/git-flow/configurar-gitlab.js` — generador de los `curl` de esta guía.
- `scripts/git-flow/bootstrap-ramas.js` — creación local del árbol de ramas.
- `.kiro/steering/branching-rules.md` — directiva Capa 1.
