# Scripts de referencia — Skill de Estimación

Copia autocontenida del generador de estimaciones y su plantilla de fases, para
poder **recrear la estimación fácilmente** en este u otro proyecto AI-DLC.

## Archivos

| Archivo | Qué es |
|---|---|
| `generate_estimacion_v3.py` | Generador de referencia: identidad única por persona, roles múltiples, fecha y alcance de participación, asignación por entregable o tarea, dependencias, calendarios y verificación humana. |
| `test_generate_estimacion_v3.py` | Pruebas de porcentajes, fechas, roles, capacidad compartida, calendarios, dependencias, paralelismo y exclusividad. |
| `estimacion-fases.example.json` | Plantilla de fases, participantes, roles, disponibilidad, alcance y responsables funcionales. |
| `project-config.example.json` | Plantilla de la config central del proyecto (`code`, `name`, `leader`, `country`). Compartida por estimación, seguimiento y task-tracker. |

## Cómo recrear la estimación en un proyecto

1. Copia el generador, sus pruebas y la configuración de fases a la carpeta de scripts del proyecto:
   ```
   cp generate_estimacion_v3.py            <proyecto>/docs/scripts/
   cp test_generate_estimacion_v3.py       <proyecto>/docs/scripts/
   cp estimacion-fases.example.json        <proyecto>/docs/scripts/estimacion-fases.json
   ```

2. El generador resuelve rutas **relativas a su ubicación**:
   - `_ROOT = parent.parent.parent` del script → raíz del workspace.
   - Resuelve `aidlc-state.md` desde el registro AI-DLC activo (v1 o v2) y lee `Start Date`.
   - Espera `estimacion-fases.json` **en la misma carpeta que el script**.
   - Escribe el `.xlsx` en `<raíz>/.intelix/outputs/estimacion/`, incluso si
     se invoca desde otro directorio dentro del workspace.

   Por eso el script debe vivir en `<proyecto>/docs/scripts/` (dos niveles bajo
   la raíz). Si lo colocas en otra profundidad, ajusta `_ROOT`.

3. Ajusta al inicio del script: `PROJECT_NAME`, `PROJECT_CODE`, `LEADER`,
   `COUNTRY` (calendario de feriados) y, si aplica, el WBS (`*_TAREAS`).

4. Completa `estimacion-fases.json`:
   - `inception_fin_real`: `null` mientras inception siga en curso → estimación
     **APROXIMADA**. Con fecha → habilita la fase de construcción.
   - `construccion_inicio_real` y `personas` se completan al cerrar inception.
     Cada persona declara `roles`, dedicación, fecha de inicio, si desarrolla y
     alcance global o por entregables. El liderazgo y la documentación se
     infieren de esos roles; `lider_solicitud` y `responsable_solicitud` siguen
     aceptados como formato compatible. Si faltan datos obligatorios con el fin
     de inception marcado, el script **se detiene y los solicita**.
     `dependencias` indica qué entregable espera a otro. `modo_asignacion`
     acepta `por_entregable` o `por_tarea`. `roles_por_tarea` restringe
     actividades concretas a roles habilitados. `responsables_funcionales`
     documenta a quién consultar reglas de negocio, sin sumarlo a la capacidad.
     La persona con alcance por entregables solo recibe esa ventana;
     `exclusivo` decide si el pozo general puede apoyarla.

   Una persona con varios roles conserva una sola dedicación y un solo cursor.
   Las tareas de coordinación y documentación consumen capacidad; si el líder
   también programa, ambas responsabilidades comparten su disponibilidad.

   La dedicación acepta `0.8`, `80` o `"80%"`. Las fechas aceptan ISO o
   `DD/MM/AAAA`, aunque los JSON deben persistirlas en ISO. Venezuela carga
   feriados nacionales; otro país requiere `holidays` en `project-config.json`.

5. Ejecuta:
   ```
   python docs/scripts/generate_estimacion_v3.py            # borrador (auto vN)
   python docs/scripts/generate_estimacion_v3.py --final    # valida el borrador y crea -FINAL
   ```
   `--final` lee el último borrador, detecta cambios manuales por `ID Jerarquico`,
   recalcula fechas con calendario/dedicación/predecesoras, corrige los totales y
   solo guarda el definitivo si no encuentra errores estructurales.

6. Ejecuta las pruebas de la skill:
   ```
   python -m unittest docs/scripts/test_generate_estimacion_v3.py -v
   ```

## Dependencias

- Python 3.9+
- `openpyxl` (`pip install openpyxl`)

## Notas de calibración

Las HH de generación (`GEN_HH`, `SUP_HH`, `REWORK_FACTOR`) están calibradas con
datos reales del task-tracker de este proyecto y son **provisionales**.

La **latencia de verificación humana** (modelo v11) es una magnitud de
**calendario independiente del esfuerzo**: la tarea de verificación tiene 0 HH
de generación, 0 HH de supervisión, recurso vacío y solo consume tiempo. Se
resuelve por **calibración híbrida** (`VERIF_CONFIG`,
`resolver_latencia_verificacion()`):

- **fallback 12 h** mientras haya **menos de 3 muestras válidas**;
- **mediana** de las duraciones reales de las filas `VER-*` finalizadas del
  tracker desde 3 muestras válidas.

Se aplica a **todos los entregables salvo** Certificación Técnica Integral,
Acompañamiento a la certificación funcional, Implementación, Estabilización y
Acta de Cierre (`VERIF_EXCLUIDOS`). Recalibrar con las duraciones reales de
`INDICE-PROGRESO.md` del registro AI-DLC activo a medida que se verifiquen más unidades.
Ver la sección "Modelo v3" en `../SKILL.md`.
