"""
Núcleo compartido del Task Tracker.
Centraliza parsing, validación, modelos y cálculos para Markdown, HTML y PDF.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# Estados canónicos: símbolo → (etiqueta, color_hex, peso)
STATE_MAP: dict[str, tuple[str, str, Optional[float]]] = {
    "\u2b1c": ("Pendiente", "#E0E0E0", 0.0),
    "\U0001f504": ("En progreso", "#42A5F5", 0.0),
    "\U0001f7e1": ("Completada (agente)", "#FFC107", 0.9),
    "\U0001f527": ("En ajuste", "#FF7043", 0.9),
    "\u2705": ("Verificada", "#66BB6A", 1.0),
    "\u23ed\ufe0f": ("Omitida", "#BDBDBD", None),
}

# IDs de US validos del proyecto. VACIO en la plantilla: cada proyecto declara
# aqui su conjunto de historias oficiales (p. ej. {"US-01", "US-02", ...}),
# tomado del mapa de historias / traceability.json. Mientras este vacio, no se
# valida contra una lista cerrada y el reporte por US no precarga historias.
VALID_US_IDS: set[str] = set()

# Regex para reconocer IDs de tarea válidos
TASK_ID_RE = re.compile(r"^[A-Z]{2,4}-T\d{2}$|^VER-[A-Z]{2,4}$")

# Regex para parsear IDs de US dentro de una celda
US_ID_RE = re.compile(r"US-\d{2}[a-z]?")

# Marcadores de sección de resumen por historia
US_SUMMARY_BEGIN = "<!-- US-SUMMARY-BEGIN -->"
US_SUMMARY_END = "<!-- US-SUMMARY-END -->"


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------

@dataclass
class Task:
    """Una tarea del índice de progreso."""
    id: str
    description: str
    state: str
    start: Optional[str] = None
    end: Optional[str] = None
    duration: Optional[str] = None
    adjustments: Optional[str] = None
    stories: list[str] = field(default_factory=list)

    @property
    def weight(self) -> Optional[float]:
        """Peso del estado actual. None si es omitida."""
        info = STATE_MAP.get(self.state)
        return info[2] if info else 0.0

    @property
    def is_skipped(self) -> bool:
        return self.weight is None

    @property
    def is_finished(self) -> bool:
        """True si el agente terminó su trabajo (🟡, 🔧 o ✅)."""
        return self.weight is not None and self.weight >= 0.9


@dataclass
class Unit:
    """Una unidad de trabajo con sus tareas."""
    name: str
    tasks: list[Task] = field(default_factory=list)
    criteria: str = ""
    plan_path: str = ""


@dataclass
class Adjustment:
    """Un ajuste post-entrega."""
    id: str
    origin: str
    description: str
    state: str
    start: Optional[str] = None
    end: Optional[str] = None
    duration: Optional[str] = None


@dataclass
class UserStoryProgress:
    """Progreso calculado de una historia de usuario."""
    us_id: str
    task_ids: list[str]
    total_tasks: int = 0
    agent_pct: float = 0.0
    verified_pct: float = 0.0
    start: Optional[str] = None
    end: Optional[str] = None  # None o "En curso" o ISO timestamp


@dataclass
class GlobalStats:
    """Estadísticas globales del proyecto."""
    total: int = 0
    pending: int = 0
    in_progress: int = 0
    agent_done: int = 0
    adjusting: int = 0
    verified: int = 0
    agent_pct: float = 0.0
    verified_pct: float = 0.0


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def _clean_cell(cell: str) -> Optional[str]:
    """Limpia un valor de celda; devuelve None si es placeholder."""
    cell = cell.strip()
    if cell in ("\u2014", "—", "", "-"):
        return None
    return cell


def _parse_stories(cell: Optional[str]) -> list[str]:
    """Extrae IDs de US de una celda de historias."""
    if not cell:
        return []
    found = US_ID_RE.findall(cell)
    # Deduplicar conservando orden
    seen: set[str] = set()
    result: list[str] = []
    for us_id in found:
        if us_id not in seen:
            seen.add(us_id)
            result.append(us_id)
    return result


def parse_progress(content: str) -> list[Unit]:
    """
    Parsea INDICE-PROGRESO.md.
    Acepta tablas de 7 u 8 columnas.
    Ignora las filas dentro de los marcadores US-SUMMARY.
    """
    units: list[Unit] = []
    current_unit: Optional[Unit] = None
    in_summary = False
    lines = content.split("\n")

    for line in lines:
        # Ignorar sección de resumen por US
        if US_SUMMARY_BEGIN in line:
            in_summary = True
            continue
        if US_SUMMARY_END in line:
            in_summary = False
            continue
        if in_summary:
            continue

        # Detectar encabezado de unidad
        unit_match = re.match(r"^## Unidad: (.+)$", line)
        if unit_match:
            current_unit = Unit(name=unit_match.group(1))
            units.append(current_unit)
            continue

        # Detectar path del plan
        if current_unit and "Plan:" in line and "`" in line:
            plan_match = re.search(r"`([^`]+)`", line)
            if plan_match:
                current_unit.plan_path = plan_match.group(1)
            continue

        # Detectar fila de tarea
        if current_unit and line.startswith("|") and not line.startswith("|---") and not line.startswith("| ID"):
            cols = [c.strip() for c in line.split("|")[1:-1]]
            if len(cols) >= 7:
                task_id = cols[0].strip()
                # Validar que es un ID de tarea real
                if not task_id or not TASK_ID_RE.match(task_id):
                    continue
                state_symbol = cols[2].strip()
                stories_raw = _clean_cell(cols[7]) if len(cols) >= 8 else None
                current_unit.tasks.append(Task(
                    id=task_id,
                    description=cols[1].strip(),
                    state=state_symbol,
                    start=_clean_cell(cols[3]),
                    end=_clean_cell(cols[4]),
                    duration=_clean_cell(cols[5]),
                    adjustments=_clean_cell(cols[6]),
                    stories=_parse_stories(stories_raw),
                ))

        # Detectar criterios de verificación
        if current_unit and line.startswith("**Criterios de VER-"):
            current_unit.criteria = line.split(":**", 1)[-1].strip() if ":**" in line else ""

    return units


def parse_adjustments(content: str) -> list[Adjustment]:
    """Parsea INDICE-AJUSTES.md."""
    adjustments: list[Adjustment] = []
    lines = content.split("\n")
    for line in lines:
        if line.startswith("|") and not line.startswith("|---") and not line.startswith("| ID"):
            cols = [c.strip() for c in line.split("|")[1:-1]]
            if len(cols) >= 7:
                adj_id = cols[0].strip()
                if not adj_id or adj_id == "\u2014":
                    continue
                adjustments.append(Adjustment(
                    id=adj_id,
                    origin=cols[1].strip(),
                    description=cols[2].strip(),
                    state=cols[3].strip(),
                    start=_clean_cell(cols[4]),
                    end=_clean_cell(cols[5]),
                    duration=_clean_cell(cols[6]),
                ))
    return adjustments


# ---------------------------------------------------------------------------
# Cálculos globales
# ---------------------------------------------------------------------------

def calculate_global_stats(units: list[Unit]) -> GlobalStats:
    """Calcula estadísticas globales del proyecto."""
    stats = GlobalStats()
    agent_score = 0.0

    for unit in units:
        for task in unit.tasks:
            if task.is_skipped:
                continue
            stats.total += 1
            weight = task.weight or 0.0
            if weight == 1.0:
                stats.verified += 1
                agent_score += 1.0
            elif weight == 0.9:
                agent_score += 0.9
                if task.state == "\U0001f527":
                    stats.adjusting += 1
                else:
                    stats.agent_done += 1
            elif task.state == "\U0001f504":
                stats.in_progress += 1
            else:
                stats.pending += 1

    if stats.total > 0:
        stats.agent_pct = agent_score / stats.total * 100
        stats.verified_pct = stats.verified / stats.total * 100

    return stats


def calculate_unit_stats(unit: Unit) -> tuple[int, int, float]:
    """Calcula (total, completadas, porcentaje) para una unidad."""
    total = 0
    done = 0
    for task in unit.tasks:
        if task.is_skipped:
            continue
        total += 1
        if task.weight is not None and task.weight > 0:
            done += 1
    pct = (done / total * 100) if total > 0 else 0.0
    return total, done, pct


# ---------------------------------------------------------------------------
# Cálculos por historia de usuario
# ---------------------------------------------------------------------------

def _parse_iso_timestamp(ts: Optional[str]) -> Optional[datetime]:
    """Intenta parsear un timestamp ISO 8601. Devuelve None si no es válido."""
    if not ts or ts == "sin-timestamp":
        return None
    try:
        # Maneja formatos con y sin Z
        ts_clean = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(ts_clean)
    except (ValueError, TypeError):
        return None


def calculate_us_progress(units: list[Unit]) -> list[UserStoryProgress]:
    """
    Calcula avance para cada historia oficial declarada en VALID_US_IDS
    (vacío en la plantilla; cada proyecto lo puebla).
    Solo utiliza las tareas que tengan explícitamente la US en su columna Historias.
    """
    # Construir índice inverso US → tareas (deduplicado por ID)
    us_tasks: dict[str, list[Task]] = {us_id: [] for us_id in VALID_US_IDS}
    seen_per_us: dict[str, set[str]] = {us_id: set() for us_id in VALID_US_IDS}

    for unit in units:
        for task in unit.tasks:
            for us_id in task.stories:
                if us_id in us_tasks and task.id not in seen_per_us[us_id]:
                    us_tasks[us_id].append(task)
                    seen_per_us[us_id].add(task.id)

    results: list[UserStoryProgress] = []

    for us_id in sorted(VALID_US_IDS, key=_us_sort_key):
        tasks = us_tasks[us_id]
        # Filtrar omitidas
        active_tasks = [t for t in tasks if not t.is_skipped]
        total = len(active_tasks)

        if total == 0:
            results.append(UserStoryProgress(
                us_id=us_id,
                task_ids=[],
                total_tasks=0,
                agent_pct=0.0,
                verified_pct=0.0,
                start=None,
                end=None,
            ))
            continue

        # Calcular porcentajes
        agent_score = sum((t.weight or 0.0) for t in active_tasks)
        verified_count = sum(1 for t in active_tasks if t.weight == 1.0)
        agent_pct = agent_score / total * 100
        verified_pct = verified_count / total * 100

        # Fechas agregadas
        start_dates: list[datetime] = []
        all_finished = True
        end_dates: list[datetime] = []

        for t in active_tasks:
            ts_start = _parse_iso_timestamp(t.start)
            if ts_start:
                start_dates.append(ts_start)
            ts_end = _parse_iso_timestamp(t.end)
            if ts_end:
                end_dates.append(ts_end)
            if not t.is_finished:
                all_finished = False

        us_start: Optional[str] = None
        if start_dates:
            us_start = min(start_dates).strftime("%Y-%m-%dT%H:%M:%SZ")

        us_end: Optional[str] = None
        if all_finished and end_dates and len(end_dates) == total:
            us_end = max(end_dates).strftime("%Y-%m-%dT%H:%M:%SZ")
        elif not all_finished and total > 0:
            # Hay tareas pendientes
            us_end = "En curso"

        results.append(UserStoryProgress(
            us_id=us_id,
            task_ids=[t.id for t in active_tasks],
            total_tasks=total,
            agent_pct=agent_pct,
            verified_pct=verified_pct,
            start=us_start,
            end=us_end,
        ))

    return results


def _us_sort_key(us_id: str) -> tuple[int, str]:
    """Ordena US-01..US-31, con sufijos como US-08a después de US-08."""
    match = re.match(r"US-(\d+)([a-z]?)", us_id)
    if match:
        return (int(match.group(1)), match.group(2))
    return (999, us_id)


# ---------------------------------------------------------------------------
# Generación de sección Markdown de resumen por US
# ---------------------------------------------------------------------------

def generate_us_summary_markdown(us_progress: list[UserStoryProgress]) -> str:
    """Genera la sección Markdown con resumen por historia."""
    lines: list[str] = []
    lines.append("")
    lines.append(US_SUMMARY_BEGIN)
    lines.append("")
    lines.append("## Avance por Historia de Usuario")
    lines.append("")
    lines.append("| Historia | Tareas | Agente | Verificado | Inicio | Fin |")
    lines.append("|---|---:|---:|---:|---|---|")

    for usp in us_progress:
        if usp.total_tasks == 0:
            lines.append(f"| {usp.us_id} | 0 | N/A | N/A | — | — |")
        else:
            start_str = usp.start or "—"
            end_str = usp.end or "—"
            lines.append(
                f"| {usp.us_id} | {usp.total_tasks} | "
                f"{usp.agent_pct:.1f}% | {usp.verified_pct:.1f}% | "
                f"{start_str} | {end_str} |"
            )

    lines.append("")
    lines.append(US_SUMMARY_END)
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def validate_us_ids(stories: list[str]) -> list[str]:
    """Devuelve IDs de US no reconocidos."""
    return [s for s in stories if s not in VALID_US_IDS]


def get_state_label(state: str) -> str:
    """Devuelve la etiqueta textual de un estado."""
    info = STATE_MAP.get(state)
    return info[0] if info else "Desconocido"


def get_state_color(state: str) -> str:
    """Devuelve el color hex de un estado."""
    info = STATE_MAP.get(state)
    return info[1] if info else "#999999"
