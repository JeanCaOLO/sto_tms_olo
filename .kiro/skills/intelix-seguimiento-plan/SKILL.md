---
name: intelix-seguimiento-plan
description: >-
  Genera reportes de seguimiento (snapshots) del plan de estimación DEFINITIVO,
  cruzando el baseline del plan -FINAL con el avance real del task-tracker
  (INDICE-PROGRESO.md del registro AI-DLC activo, compatible con v1/v2). Produce un Excel versionado por
  fecha/hora con % de avance por tarea y por entregable, en doble indicador
  (agente y verificado). Usar cuando el usuario pida: seguimiento del plan,
  avance del proyecto, reporte de avance, snapshot de progreso, cómo va el plan,
  status del plan definitivo, seguimiento de la estimación, reporte de seguimiento.
---

# Seguimiento del Plan — Snapshots del avance sobre el plan definitivo

## Qué hace

Genera un **snapshot inmutable** del avance del proyecto contra el plan de
estimación **definitivo**. Cada ejecución produce un Excel nuevo, versionado por
la fecha/hora de ejecución, de modo que la colección de snapshots forma el
histórico de avance.

La skill **no mantiene estado propio ni recalcula el avance**: consume las
fuentes de verdad existentes y las cruza.

| Fuente | Aporta |
|---|---|
| `docs/scripts/project-config.json` | **Config central**: `code` y `name` del proyecto (compartida con estimación y task-tracker). |
| `docs/PLAN-ESTIMACION-{CODE}-v{N}-FINAL.xlsx` | Baseline: entregables, HH estimadas, fechas, **ID Jerárquico**. **Congelado.** |
| `INDICE-PROGRESO.md` del registro activo | Avance real por tarea (estados con pesos) y por unidad. |
| `INDICE-AJUSTES.md` del registro activo | Ajustes post-entrega (si existen). |

**Regla dura:** el archivo `-FINAL` queda **congelado**; la skill nunca lo
modifica. El seguimiento solo lee.

## Configuración central del proyecto (nombre y código)

El **código** (`code`) y el **nombre** (`name`) del proyecto **no se hardcodean**:
se leen de `docs/scripts/project-config.json`, la misma fuente que usan las skills
de estimación y task-tracker. El código es la clave de los nombres de archivo
(`PLAN-ESTIMACION-<code>-...`, `SEGUIMIENTO-<code>-...`). Si el JSON no existe,
la skill usa un valor de fallback inerte. El flag `--code` sigue permitiendo
forzar otro código puntualmente.

## Precondición

Debe existir al menos un plan **definitivo**
`docs/PLAN-ESTIMACION-{CODIGO}-v{N}-FINAL.xlsx`. Si no existe, la skill se
detiene y avisa: no tiene sentido dar seguimiento a un plan que aún es borrador.
Primero se confirma la estimación como definitiva (skill de estimación con
`--final`). Si hay varios `-FINAL`, se usa el de mayor versión.

## Cálculo del avance (idéntico al task-tracker)

Pesos por estado de tarea:

| Estado | Símbolo | Peso agente | Cuenta como verificada |
|---|---|---|---|
| Pendiente | ⬜ | 0.0 | no |
| En progreso | 🔄 | 0.0 | no |
| Completada (agente) | 🟡 | 0.9 | no |
| En ajuste | 🔧 | 0.9 | no |
| Verificada | ✅ | 1.0 | sí |
| Omitida | ⏭️ | — (excluida del denominador) | no |

- **% Agente** = Σ(pesos) / nº tareas no omitidas × 100.
- **% Verificado** = nº tareas ✅ / nº tareas no omitidas × 100.
- Ambos porcentajes se reportan **siempre juntos**: un proyecto al 90% agente y
  0% verificado no está casi terminado, y una sola cifra lo ocultaría.
- **Por tarea:** el % de tarea es el peso de su estado (0%, 90% o 100%).
- **Por entregable:** agregado de las tareas de su unidad en el tracker.
- Entregables de inception (`Mob Elaboration`, `Modelo de la solucion`,
  `Arquitectura de la solucion`) se fijan al 100% (completados al generar el
  índice). Esos tres entran en el plan de Mayor. En Menor e Intermedio no están
  y no se exigen. Entregables sin unidad rastreada quedan en 0% y se marcan
  "Sin rastrear".

### Mapeo entregable → unidad del tracker

Cada proyecto declara este mapeo en `ENTREGABLE_A_UNIDAD` dentro de
`generate_seguimiento.py` (en la plantilla viene vacío). Asocia el nombre exacto
del entregable en el plan con el identificador de su unidad en el tracker:

| Entregable (nombre en el plan) | Unidad (id del tracker) |
|---|---|
| `<Nombre del entregable en el plan>` | `<id-unidad-del-tracker>` |

Si un entregable no está mapeado, el seguimiento no lo cruza con una unidad
(degradación elegante).

## Cruce por ID Jerárquico (plan ↔ tracker)

El cruce plan↔tracker se hace por **`ID Jerárquico`** (columna 11 de la hoja
Plan), no por nombre ni por posición. El ID **nace en la estimación** y el
seguimiento lo hereda:

- **Entregable**: `<PREFIJO>-<NNN>` (`EST-001`, `PAR-002`).
- **Tarea**: `<PREFIJO>-<NNN>-<NNN>` (`PAR-002-003`).

Regla del join: para el entregable del plan con ID `E`, la tarea del tracker en
posición `i` de su unidad recibe el ID derivado `E-<i+1:03d>`; la fila de tarea
del plan se empareja con la tarea del tracker cuyo ID coincida con el suyo en la
col 11.

**Fallback a posición.** Si el plan `-FINAL` **no trae** la columna ID (planes
antiguos, p. ej. `PLAN-ESTIMACION-<code>-v4-FINAL`), la skill vuelve al **mapeo por posición
N↔N** dentro de la unidad. Así se mantiene compatibilidad con planes viejos sin
romper nada.

## Disparo del snapshot (cuándo se ejecuta)

**Regla del flujo:** el snapshot de seguimiento se genera **siempre** que:

1. **El agente termina una unidad** — todas sus tareas pasan a **🟡** en
   `INDICE-PROGRESO.md` (fin de la generación de esa unidad).
2. **La verificación humana confirma la unidad** — sus tareas pasan a **✅**.

En ambos momentos se corre:

```bash
python .kiro/skills/intelix-seguimiento-plan/generate_seguimiento.py
```

**Nota honesta:** un script `.py` no se auto-dispara. El disparo lo ejecuta el
**agente/flujo** (igual que el task-tracker actualiza el índice): tras marcar 🟡
al cerrar una unidad, y tras marcar ✅ al verificarla, se ejecuta el generador de
seguimiento. Cada corrida es un archivo nuevo con timestamp, así que quedan
snapshots tanto del cierre por el agente como de la verificación humana.

## Salida

`.intelix/outputs/seguimiento/SEGUIMIENTO-{CODE}-YYYYMMDD-HHMM.xlsx`

Nunca se sobrescribe: cada corte es un archivo nuevo con su timestamp.

### Construcción del archivo

El reporte **parte del `.xlsx` -FINAL** para conservar su formato exacto: se
copia el libro completo (hojas `Plan`, `Resumen`, `Colaboradores` con todos sus
estilos) y se reescriben la columna C (% completado) y las columnas de fecha de
la hoja `Plan`. La columna 11 (**ID Jerárquico**) se **conserva** intacta. Luego
se anexan las hojas de seguimiento como valor extra. El `-FINAL` original nunca
se toca.

### Hitos de fase (Inception / Construcción)

El sello superior de la hoja Plan muestra los hitos de fase con timestamps
reales:

- **Inception** — ventana derivada de `audit.md` (v1) o de los shards `audit/*.md` (v2): primer timestamp
  del audit hasta el último evento **antes** del primer header que contiene
  `CONSTRUCTION`.
- **Construcción (código)** — fecha de inicio real tomada del task-tracker (mín.
  inicio real entre las unidades). El fin de Construcción no existe mientras
  haya tareas sin verificar: se muestra "en curso".

### Fechas Comienzo/Fin (E/F): reales de fase/hito

Las columnas **Comienzo (E)** y **Fin (F)** de la hoja Plan se reescriben con
fechas reales/hito (no las estimadas del cronograma):

- **Entregables de Inception** (Mob Elaboration, Modelo, Arquitectura): E/F =
  ventana real de Inception del `audit.md`. Aplican cuando el plan es de Mayor.
  En Menor e Intermedio esos entregables no están.
- **Re-anclaje de la construcción**: las fechas estimadas del plan para la fase
  de construcción se **re-anclan al día real en que empezó la construcción**
  (mín. inicio real del tracker). No se estima que una unidad termine antes del
  día en que realmente se empezó a construir. Desde esa fecha base, los
  entregables de construcción y los de cierre se re-programan en cadena por sus
  HH estimadas, a 16 HH/día (2 devs × 8h) sobre días hábiles del calendario VE.
- **Entregables de Construcción rastreados**: E = inicio real del código de esa
  unidad (tracker); F = fin real si la unidad terminó, o la fecha re-anclada si
  sigue en curso.
- **Filas de tarea**: E/F = inicio/fin **real** de esa tarea en el task-tracker
  (cruce por **ID Jerárquico**, ver abajo). Las tareas del plan sin
  correspondencia en el tracker (documentación, gestión) muestran `—`.
- **Entregables sin unidad ni Inception**: conservan las fechas estimadas del
  plan.

Además, se conservan dos columnas al final (**Inicio real** / **Fin real**) con
el mismo detalle real por tarea/unidad del tracker (para lectura rápida sin
confundir con la fila de entregable).

### Cómo se rellena la columna C (% completado)

- **Fila de entregable:** % agregado de su unidad en el tracker (o 100% para los
  entregables de inception, 0% para los no rastreados).
- **Fila de tarea:** se empareja por **ID Jerárquico** (ver *Cruce por ID
  Jerárquico*). Cada tarea muestra 0% / 90% / 100% según su estado. Las tareas
  del plan sin correspondencia en el tracker (documentación, gestión) quedan en
  0%.
- La hoja `Plan` incluye, sobre la tabla, un sello con la fecha/hora del corte y
  el plan base, más la **leyenda** de la escala: 0% = tarea no realizada; 90% =
  realizada por el agente, pendiente de verificación humana; 100% = realizada y
  verificada.

### Hojas del Excel

1. **Plan / Resumen / Colaboradores** — copiadas del `-FINAL`. La hoja
   `Plan` lleva la columna C actualizada + sello y leyenda.
2. **Seguimiento** — KPIs del corte: fecha/hora, plan base, nº de tareas,
   % agente y % verificado globales, y tabla estimado-vs-real por entregable.
3. **Ajustes** — Ajustes post-entrega desde `INDICE-AJUSTES.md` (o nota de que
   no hay ajustes al corte).
4. **Avance US** — Avance por historia de usuario tomado del índice.

## Uso

```bash
# Snapshot del proyecto (code se lee de docs/scripts/project-config.json)
python .kiro/skills/intelix-seguimiento-plan/generate_seguimiento.py

# Forzar otro código de proyecto puntualmente
python .kiro/skills/intelix-seguimiento-plan/generate_seguimiento.py --code OTRO
```

Requiere `openpyxl`.

## Relación con las otras skills

- **project-estimation-plan** produce el plan y lo marca definitivo (`-FINAL`).
- **task-tracker** mantiene el avance real por tarea en `INDICE-PROGRESO.md`.
- **seguimiento-plan** (esta) cruza ambos y fotografía el avance en el tiempo.

No duplica la lógica de ninguna: es un consumidor de sus salidas.
