# Guía de Seguimiento del Proyecto en GitLab (CE 15.11)

Esta guía configura el seguimiento gráfico del avance en un servidor **GitLab
Self-Hosted Community Edition (CE) 15.11**. En CE 15.11 el **Burndown/Burnup Chart
nativo NO está disponible** (es una función Premium), por lo que el seguimiento
visual se cubre con el **dashboard HTML propio** del template
(`.intelix/outputs/reporte_avance/reporte-avance.html`), publicado en GitLab Pages
o descargable como artefacto del pipeline.

> **Nota sobre el runner:** este pipeline esta escrito para un runner GitLab
> de tipo **shell** (ejecuta en el servidor, sin Docker). No instala paquetes
> (`apk`/`apt`): usa lo que el servidor ya tenga (git, node, curl, jq). Si
> falta alguna herramienta, el job avisa y termina sin romper el pipeline
> (`allow_failure: true`). Los jobs del dashboard solo corren cuando cambia el
> Índice de Progreso v1 (`aidlc-docs/tracking/INDICE-PROGRESO.md`), el tracking
> de un intent v2 (`aidlc/spaces/*/intents/*/tracking/`) o la CLI del reporte,
> no en cada commit.

## Qué SÍ tienes en CE 15.11 (gratis)

| Función | Uso |
|--------|-----|
| **Milestones** (por proyecto) | Agrupar issues por sprint/iteración con fechas |
| **Time tracking** (`/estimate`, `/spend`) | Plan vs. Realizado en horas por issue |
| **Issue Board** (1 por proyecto) | Kanban con columnas por label |
| **Labels con scope** (`::`) | Estados mutuamente excluyentes |
| **Time tracking summary** en el board | Barras de horas estimadas vs. consumidas |
| **Pipeline schedules** (cron) | Base del recordatorio diario (Fase 3) |
| **GitLab Pages** (si el admin lo habilitó) | Publicar el dashboard HTML |

## Qué NO tienes en CE 15.11

- **Burndown/Burnup Chart nativo** (Premium). Se suple con el dashboard HTML.
- **Múltiples Issue Boards** por proyecto (Premium). Uno solo basta.

---

## 1. Milestones (sprints)

`Plan > Milestones > New milestone`

- Crea un milestone por sprint con **fecha de inicio y fin** (ej. "Sprint 1").
- Asigna a ese milestone los issues de la iteración.
- Sirve para agrupar y filtrar el avance del periodo.

## 2. Estimación y tiempo real por issue

En la descripción o en un comentario de cada issue, usa las quick actions:

- `/estimate 8h` — tiempo **planificado** del issue (el "Plan").
- `/spend 2h 30m` — tiempo **real** invertido (el "Realizado").

> El `/spend` lo **confirma el desarrollador** (ver `commit-rules.md`); la IA solo
> sugiere una estimación a partir del diff. Nunca se imputa tiempo sin validación
> humana, para que el dato sea creíble.

GitLab muestra en cada issue la barra "estimado vs. consumido" y el agregado por
milestone y por columna del board.

## 3. Issue Board (Kanban)

`Plan > Issue Boards`

- Crea columnas basadas en labels de estado (ver seccion 4):
  `Status::To Do`, `Status::In Progress`, `Status::In Review`, `Status::Done`.
- Activa **"Show time tracking summary"** (parte superior del board) para ver las
  barras de horas por columna.
- Úsalo en el stand-up diario para mover tarjetas.

## 4. Labels (flujo y excepción)

`Manage > Labels` (a nivel de proyecto)

Crea estas labels. Las que empiezan con un prefijo y `::` son **mutuamente
excluyentes** (scoped labels): un issue solo puede tener una del mismo prefijo.

**De flujo (estado):**

| Label | Color sugerido |
|-------|----------------|
| `Status::To Do` | #6699cc |
| `Status::In Progress` | #f0ad4e |
| `Status::In Review` | #8e44ad |
| `Status::Done` | #5cb85c |

**De excepción (para el recordatorio diario de la Fase 3):**

| Label | Significado |
|-------|-------------|
| `Status::Certificación` | La tarea pasó a QA/UAT; no requiere nuevos commits del dev |
| `On-Hold::Vacaciones` | El desarrollador asignado está ausente |
| `Pausa` | La tarea está bloqueada temporalmente |

Estas labels de excepción permiten que el control de sincronización diaria ignore
issues que legítimamente no deben tener commits.

## 5. Dashboard gráfico (camino B: suple el Burndown)

El template genera `reporte-avance.html` (Chart.js) con progreso global, gráficos
de distribución de estados y barras por unidad de trabajo, a partir del Índice de
Progreso AI-DLC. En CE 15.11 este dashboard es el que aporta la **vista gráfica de
avance** que el Burndown nativo no ofrece.

> El pipeline usa `GIT_DEPTH: 0` para disponer del historial completo cuando el
> job lo necesite; el reporte en sí se calcula desde el Índice de Progreso.

### 5.1. Estado en este servidor: GitLab Pages DESHABILITADO

En esta instancia de GitLab, **Pages esta deshabilitado** a nivel de servidor
(no aparece en `Deployments` ni en `Settings`). Por lo tanto, el dashboard NO se
publica por URL. Se entrega como **artefacto descargable** del pipeline.

### 5.2. Como obtener el dashboard (artefacto)

1. Ve a `CI/CD > Pipelines` y abre el pipeline mas reciente de la rama por defecto.
2. Abre el job **build_dashboard**.
3. En el panel derecho, usa **Download** o **Browse** para descargar el reporte de
   `.intelix/outputs/reporte_avance/` (el HTML es autocontenido, se abre en
   cualquier navegador).

Alternativa local: `generar-reporte.bat` genera el mismo `reporte-avance.html`
sin necesidad de CI.

> **Si el administrador habilita Pages** en el servidor en el futuro, se puede
> reintroducir un job `pages` en `.gitlab-ci.yml` para publicar el dashboard por
> URL y agregar un badge en el README.

## 6. Recordatorio diario de sincronización (`daily_sync_check`)

El pipeline incluye el job `daily_sync_check` que, cada día hábil, detecta issues
activos sin actividad reciente y **publica un comentario** en cada uno mencionando
al responsable, para recordar commitear y sincronizar (push). La sincronización es
prioritaria para medir el avance real.

### Qué hace

- Corre **solo en pipelines programados** (schedule), no en pushes normales.
- Recorre los issues **abiertos** del proyecto.
- **Ignora** los que tengan una label de excepción: `Status::Certificación`,
  `On-Hold::Vacaciones` o `Pausa`.
- Para los issues activos **sin actividad en los últimos 4 días**, publica un
  comentario recordatorio (con `@mención` al asignado si existe).
- Si la variable `PROJECT_PAUSED = "true"`, omite todo el control (proyecto en
  pausa o congelamiento).

### Configuración (una vez por proyecto)

**Paso 1 — Crear el token de acceso de proyecto.**
`Settings > Access Tokens` (o `Settings > CI/CD > Access Tokens` según la versión):
- Nombre: `sync-check-bot` (o similar).
- Rol: `Reporter` o superior (necesita comentar issues).
- Scope: **`api`** (leer issues y crear notas).
- Copia el token generado (solo se muestra una vez).

> En GitLab CE 15.11, `CI_JOB_TOKEN` NO tiene permiso para leer la API de issues
> ni comentar; por eso se usa un token de proyecto dedicado.

**Paso 2 — Guardar el token como variable CI/CD.**
`Settings > CI/CD > Variables > Add variable`:
- Key: `SYNC_CHECK_TOKEN`
- Value: el token del paso 1.
- Marca **Masked** (enmascarada) y, si aplica, **Protected**.
- (Opcional) Agrega `PROJECT_PAUSED` = `true` cuando quieras pausar el control de
  todo el proyecto.

**Paso 3 — Programar el pipeline.**
`Build > Pipeline schedules > New schedule`:
- Descripción: "Recordatorio diario de sincronización".
- Intervalo (cron): `0 18 * * 1-5` (lunes a viernes, 6:00 PM).
- Rama objetivo: la rama por defecto.
- Guarda. El job `daily_sync_check` correrá según ese horario.

### Matriz de responsabilidad en excepciones

- **Desarrollador:** marca su issue con `On-Hold::Vacaciones` (al ausentarse) o
  `Status::Certificación` (al pasar la tarea a QA), para que el control lo ignore.
- **Líder / PM:** marca `Pausa` en tareas bloqueadas puntuales, o activa
  `PROJECT_PAUSED = true` en las variables CI/CD cuando todo el proyecto se detenga.

### Si falta el token

Si `SYNC_CHECK_TOKEN` no está configurada, el job no falla: emite una advertencia
en el log y termina sin comentar. Así el pipeline sigue siendo válido aunque el
recordatorio no esté activo todavía.

---

## Resumen del flujo de seguimiento en CE 15.11

1. Crea el **Milestone** del sprint con fechas.
2. En cada issue, define `/estimate` (plan) y registra `/spend` (real, confirmado).
3. Trabaja moviendo tarjetas en el **Issue Board** con "time tracking summary".
4. Usa las **labels de excepción** para issues que no deben tener commits.
5. Consulta el **dashboard HTML** (Pages o artefacto) para la vista gráfica.
6. (Fase 3) El **pipeline programado** recuerda sincronizar los issues activos.
