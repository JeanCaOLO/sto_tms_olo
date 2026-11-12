"""
Detecta desincronización entre los planes de Code Generation y el índice de progreso.

Compara los checkboxes [ ]/[x] de los planes de code generation contra los
estados registrados en INDICE-PROGRESO.md. Funciona con AI-DLC v1 y v2:
la versión y las rutas se resuelven con aidlc_paths.detect_layout().

  v1: aidlc-docs/construction/plans/*code-generation-plan.md
      aidlc-docs/tracking/INDICE-PROGRESO.md
  v2: <record>/construction/<unit>/code-generation/code-generation-plan.md
      <record>/tracking/INDICE-PROGRESO.md

NO escribe nada. Solo diagnostica, para no fabricar timestamps inexistentes.

Uso:
    python check_drift.py [ruta-proyecto]

Códigos de salida:
    0 = sin discrepancias
    1 = discrepancias detectadas (revisar salida)
    2 = error de ejecución (artefactos ausentes)
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from tracker_core import parse_progress, Task, Unit
from aidlc_paths import detect_layout, unit_name_from_plan, AidlcLayout

# Estados que significan "el agente ya terminó"
FINISHED_STATES = {"\U0001f7e1", "\U0001f527", "\u2705"}  # 🟡 🔧 ✅
PENDING_STATES = {"\u2b1c", "\U0001f504"}                  # ⬜ 🔄
SKIPPED_STATE = "\u23ed\ufe0f"                             # ⏭️

CHECKBOX_RE = re.compile(r"^\s*-\s*\[([ xX])\]\s*\*\*Step\s+(\d+)\*\*", re.MULTILINE)


def parse_plan_checkboxes(plan_path: Path) -> list[tuple[int, bool]]:
    """
    Extrae los checkboxes de un plan.
    Devuelve [(numero_step, esta_marcado), ...]
    """
    content = plan_path.read_text(encoding="utf-8")
    result: list[tuple[int, bool]] = []
    for match in CHECKBOX_RE.finditer(content):
        checked = match.group(1).lower() == "x"
        step_num = int(match.group(2))
        result.append((step_num, checked))
    return result


def build_task_index(units: list[Unit]) -> dict[str, dict[int, Task]]:
    """
    Construye {unidad: {numero_step: Task}}.
    El número de step se deriva del sufijo numérico del ID (XX-T01 -> 1).
    Las filas VER-* no corresponden a ningún step del plan y se excluyen.
    """
    index: dict[str, dict[int, Task]] = {}
    for unit in units:
        step_map: dict[int, Task] = {}
        for task in unit.tasks:
            m = re.match(r"^[A-Z]{2,4}-T(\d+)$", task.id)
            if m:
                step_map[int(m.group(1))] = task
        index[unit.name] = step_map
    return index


def check_drift(project_root: Path) -> int:
    try:
        layout = detect_layout(project_root)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}")
        return 2

    index_path = layout.progress_index
    plan_files = layout.plan_files

    if index_path is None or not index_path.exists():
        print(f"ERROR: no existe el índice de progreso ({index_path})")
        return 2
    if not plan_files:
        print(
            "ERROR: no se encontraron planes de code generation "
            f"(AI-DLC {layout.version})."
        )
        return 2

    units = parse_progress(index_path.read_text(encoding="utf-8"))
    task_index = build_task_index(units)

    findings: list[str] = []
    plans_without_unit: list[str] = []
    units_without_plan = set(task_index.keys())

    for plan_path in plan_files:
        unit_name = unit_name_from_plan(plan_path, layout.version)
        checkboxes = parse_plan_checkboxes(plan_path)

        if unit_name not in task_index:
            plans_without_unit.append(f"{unit_name} ({len(checkboxes)} steps, plan sin sección en el índice)")
            continue

        units_without_plan.discard(unit_name)
        step_map = task_index[unit_name]

        for step_num, checked in checkboxes:
            task = step_map.get(step_num)

            if task is None:
                findings.append(
                    f"[{unit_name}] Step {step_num} existe en el plan pero no tiene fila en el índice"
                )
                continue

            if task.state == SKIPPED_STATE:
                continue  # Omitida deliberadamente

            # Plan marcado [x] pero índice pendiente -> trabajo sin rastrear
            if checked and task.state in PENDING_STATES:
                findings.append(
                    f"[{unit_name}] {task.id}: plan marca [x] pero el índice está en "
                    f"{task.state} — trabajo realizado sin rastrear"
                )

            # Índice terminado pero plan sin marcar -> plan desactualizado
            if not checked and task.state in FINISHED_STATES:
                findings.append(
                    f"[{unit_name}] {task.id}: índice en {task.state} pero el plan "
                    f"sigue en [ ] — plan desactualizado"
                )

            # Terminada sin timestamps
            if task.state in FINISHED_STATES:
                if not task.start:
                    findings.append(
                        f"[{unit_name}] {task.id}: estado {task.state} sin fecha de Inicio"
                    )
                if not task.end:
                    findings.append(
                        f"[{unit_name}] {task.id}: estado {task.state} sin fecha de Fin"
                    )

            # En progreso sin inicio
            if task.state == "\U0001f504" and not task.start:
                findings.append(
                    f"[{unit_name}] {task.id}: está 🔄 pero no tiene fecha de Inicio"
                )

        # Steps del índice que no existen en el plan
        plan_steps = {n for n, _ in checkboxes}
        for step_num, task in sorted(step_map.items()):
            if step_num not in plan_steps and task.state != SKIPPED_STATE:
                findings.append(
                    f"[{unit_name}] {task.id}: existe en el índice pero no en el plan "
                    f"— marcar ⏭️ con nota del motivo"
                )

    # --- Reporte ---
    print("=" * 70)
    print("Verificación de sincronización índice <-> planes")
    print("=" * 70)
    print(f"AI-DLC detectado:    {layout.version}")
    if layout.record_dir is not None:
        print(f"Intent record:       {layout.record_dir.name} (space: {layout.space})")
    print(f"Planes analizados:   {len(plan_files)}")
    print(f"Unidades en índice:  {len(task_index)}")
    total_tasks = sum(len(m) for m in task_index.values())
    print(f"Tareas comparadas:   {total_tasks}")
    print()

    if plans_without_unit:
        print("PLANES SIN SECCIÓN EN EL ÍNDICE:")
        for item in plans_without_unit:
            print(f"  - {item}")
        print()

    if units_without_plan:
        print("UNIDADES DEL ÍNDICE SIN PLAN CORRESPONDIENTE:")
        for name in sorted(units_without_plan):
            print(f"  - {name}")
        print()

    if findings:
        print(f"DISCREPANCIAS ({len(findings)}):")
        for f in findings:
            print(f"  - {f}")
        print()
        print("Acción: revisar cada caso. El plan de AI-DLC gana sobre el índice.")
        print("No fabricar timestamps: usar 'sin-timestamp' donde no se conozcan.")
        return 1

    if plans_without_unit or units_without_plan:
        print("Sin discrepancias de estado, pero hay desalineación estructural (ver arriba).")
        return 1

    print("OK: índice y planes están sincronizados.")
    return 0


def main():
    if len(sys.argv) > 1:
        project_root = Path(sys.argv[1])
    else:
        # Subir desde .kiro/skills/intelix-task-tracker/ hasta la raíz
        project_root = Path(__file__).resolve().parents[3]

    sys.exit(check_drift(project_root))


if __name__ == "__main__":
    main()
