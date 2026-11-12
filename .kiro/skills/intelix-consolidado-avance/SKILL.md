---
name: intelix-consolidado-avance
description: >-
  Consolida el avance del proyecto a partir de VARIAS ramas y colaboradores en un
  reporte único, con el MISMO formato del reporte de avance normal (dashboard de
  entregables → tareas). Usa DOS fuentes: el plan de estimación
  (PLAN-ESTIMACION-*-FINAL.xlsx) como baseline inicial (entregables, tareas,
  colaboradores y fechas planificadas) y el índice de progreso (INDICE-PROGRESO.md)
  como estado durante el desarrollo. El avance OFICIAL se calcula solo desde la rama
  canónica (develop) tras integrar los MR; el CONSOLIDADO toma el estado más avanzado
  de cada tarea entre todas las ramas y muestra la columna Rama de procedencia, más
  el progreso por colaborador. Usar cuando el usuario pida: reporte de avance
  consolidado, avance de todo el proyecto, avance de todas las ramas, consolidar el
  avance de los colaboradores, avance global multi-rama, progreso por desarrollador.
---

# Consolidado de Avance — Multi-rama / Multi-colaborador

## Modelo de dos fuentes

El consolidado combina el **plan** (lo planificado) con el **índice** (lo real):

| Momento                       | Fuente                                                       | Aporta                                                           |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Avance inicial (baseline)** | `PLAN-ESTIMACION-*-FINAL.xlsx` (skill `intelix-estimacion`)  | Entregables, tareas, **colaboradores** y **fechas planificadas** |
| **Durante el desarrollo**     | `INDICE-PROGRESO.md` por rama (skill `intelix-task-tracker`) | El **estado** real de cada tarea (⬜ 🔄 🟡 🔧 ✅)                |
| **Procedencia**               | git (ramas remotas)                                          | De qué **rama** viene el estado más avanzado de cada tarea       |

El resultado se presenta con el **mismo formato del reporte de avance normal**
(dashboard: entregables → tareas con estado, fechas, progreso y gráficos), añadiendo
las columnas **Colaborador** y **Fecha planificada** (del plan) y **Rama** (de git),
más una sección de **Progreso por Colaborador**.

## Principio rector (NO negociable)

> El avance **OFICIAL** del proyecto se calcula **únicamente** desde el índice de la
> rama **canónica de integración** (por defecto `develop`), **después** de integrar
> los Merge Requests. El **consolidado** (todas las ramas) toma el estado más
> avanzado de cada tarea e **incluye trabajo aún no integrado**: es visibilidad del
> avance real, **no** el número oficial. Nunca se suman índices de varias ramas de
> forma que se dupliquen tareas o se superen el 100%.

La cabecera del reporte muestra siempre las **dos cifras juntas**: avance **oficial**
(solo `develop`) y avance **consolidado** (todas las ramas).

## Dos modos (automáticos)

La skill detecta sola en qué modo opera:

- **Modo completo** — existe un `PLAN-ESTIMACION-*-FINAL.xlsx` y `openpyxl` está
  disponible. La tabla se enriquece con **Colaborador** y **Fecha planificada** del
  plan, y se genera el **Progreso por Colaborador**.
- **Modo solo-índice** (degradado) — no hay plan (o falta `openpyxl`). El dashboard
  se genera igual con estado, rama, fechas reales y progreso; se avisa el motivo.
  Nunca falla por ausencia de plan.

## Qué hace

1. **Recolecta el índice** de la rama canónica (`git show <remoto>/<rama>:<índice>`,
   sin checkout) y el de cada rama **remota** `feature/*`/`bugfix/*` (solo remotas:
   el trabajo local no compartido aún no cuenta).
2. **Consolida por tarea**: para cada (unidad, ID de tarea) toma el **estado más
   avanzado** presente en cualquier rama (⬜ < 🔄 < 🟡/🔧 < ✅) y registra la **rama**
   de donde viene ese estado ganador.
3. **Cruza con el plan** (modo completo): empareja el entregable del plan con la
   unidad del índice por **nombre**, y la tarea por **posición** dentro de la unidad
   (mismo mecanismo que `intelix-seguimiento-plan`), añadiendo colaborador y fechas
   planificadas por tarea.
4. **Calcula dos avances**: oficial (solo `develop`) y consolidado (todas), con los
   mismos pesos del tracker (⬜ 0 · 🔄 0 · 🟡 0.9 · 🔧 0.9 · ✅ 1.0 · ⏭️ excluida).
5. **Progreso por colaborador** (modo completo): agrega el avance de las tareas
   asignadas a cada persona en el plan → progreso local por desarrollador.

## Precondición para el consolidado multi-rama: índice versionado

Para leer el avance de **otras** ramas, el índice de progreso **debe viajar por git**
(cada rama lleva su copia). En un proyecto real: versionar el directorio `tracking/`
del registro AI-DLC activo (`aidlc-docs/` en v1 o el intent activo en v2)
(quitarlo del `.gitignore` y commitearlo en cada rama).

| Escenario                       | Índice                    | Consolidación multi-rama                           |
| ------------------------------- | ------------------------- | -------------------------------------------------- |
| **A (proyecto real)**           | Versionado, viaja por git | ✅ Lee el estado de todas las ramas                |
| **B (plantilla / un solo dev)** | Ignorado o no versionado  | ⚠️ Solo el checkout actual (usar `--fuente-local`) |

En la **plantilla**, el índice es un ejemplo local ignorado. La skill **detecta el
Escenario B** y lo avisa con guía, en lugar de fallar; con `--fuente-local` se puede
generar el dashboard del checkout actual (validación o desarrollador único).

## Uso

```bash
# Escenario A (proyecto real, índice versionado): consolidado de todas las ramas
python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py

# Cambiar la rama canónica o el remoto
python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --rama-canonica develop --remoto origin

# Validación / desarrollador único (índice del working tree, un solo checkout)
python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --fuente-local

# Salida JSON (para el agente / integraciones), no escribe MD/HTML
python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --json

# Solo actualizar los alias estables, sin copia con timestamp
python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --no-versionado
```

El plan de estimación se toma del más reciente `PLAN-ESTIMACION-*-FINAL.xlsx` en
`.intelix/outputs/estimacion/` (mayor versión). `--fuente-local` **no rompe el
principio rector**: el avance oficial se sigue calculando desde el índice de la rama
canónica; solo cambia de dónde se lee ese índice cuando aún no está versionado.

### Dependencias

La skill usa **solo la librería estándar de Python 3** (sin `requirements.txt` ni
entorno virtual propio). El **modo completo** requiere `openpyxl` (para leer el plan
`.xlsx`); si falta, la skill cae a **modo solo-índice** con aviso, sin romperse.

## Salida

`.intelix/outputs/consolidado_avance/`

- `CONSOLIDADO-AVANCE-YYYYMMDDHHMM.md` + alias estable `CONSOLIDADO-AVANCE.md`
- `consolidado-avance-YYYYMMDDHHMM.html` + alias estable `consolidado-avance.html`

Cada corrida crea una copia con timestamp (histórico) y refresca los alias estables.
El dashboard incluye: cabecera con avance oficial vs consolidado, gráficos, tabla de
entregables → tareas (con Colaborador / Fecha plan. / Estado / Rama / fechas reales /
Progreso), resumen por unidad y, en modo completo, Progreso por Colaborador.

## Flujo operativo (el ciclo del proyecto)

```text
[Inicio] Estimación (intelix-estimacion) → PLAN-ESTIMACION-*-FINAL.xlsx  ← BASELINE
                                                     │
[Desarrollo] cada dev en su rama actualiza el INDICE-PROGRESO (task-tracker)
                                                     │
   feature/* o bugfix/*  →  commit  →  Merge Request  →  develop
                                                     │
[Reporte] consolidado (esta skill):
   • Avance oficial  = índice de develop (lo integrado)
   • Consolidado     = todas las ramas (estado más avanzado + columna Rama)
   • Progreso local  = por colaborador, según asignación del plan
                                                     │
                                    promover develop → qa → master (MR)
```

## Qué NO hace (por diseño)

- **No suma** índices de varias ramas de forma que dupliquen tareas o pasen del 100%.
- **No usa el número de commits como porcentaje de avance.**
- **No hace checkout** ni modifica ramas: solo lee (`git show`).
- **No modifica** el plan `.xlsx` ni el índice: solo los lee.
- **No lee ramas locales** no compartidas: solo remotas.
- **No marca ✅**: la verificación humana es exclusiva del `intelix-task-tracker`.

## Relación con las otras skills

- **`intelix-estimacion`** produce el plan definitivo (`PLAN-ESTIMACION-*-FINAL.xlsx`)
  = baseline (entregables, tareas, colaboradores, fechas). Esta skill lo **consume**.
- **`intelix-task-tracker`** mantiene el `INDICE-PROGRESO.md` por rama = estado. Esta
  skill lo **consume**; no lo modifica.
- **`intelix-seguimiento-plan`** cruza plan + índice para un **solo** checkout (snapshot
  Excel). Esta skill añade la dimensión **multi-rama / multi-colaborador**; reutiliza
  el mismo criterio de cruce sin modificar esa skill (usa un lector propio del plan).
- **`intelix-git-flow`** / `branching-rules.md` definen el gobierno de ramas
  (`feature/*` → `develop` → `qa` → `master`) sobre el que opera este consolidado.

## Archivos de la skill

- `consolidado_core.py` — núcleo: git (git show/log), parseo del índice por rama,
  lector del plan de estimación, consolidación por tarea (estado más avanzado + rama)
  y cruce con el plan. No escribe nada.
- `generar_consolidado.py` — CLI y generadores MD/HTML/JSON del dashboard.
