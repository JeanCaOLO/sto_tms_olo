"""Contrato canonico de rutas AI-DLC v1/v2 para consumidores Python de INTELIX.

Resolucion v2 compatible con AI-DLC 2.8.2:
  space: argumento explicito > ``aidlc/active-space`` > ``default``;
  intent: argumento explicito > cursor por space > unico intent disponible.

Nunca se elige "el mas reciente" cuando hay varios intents sin cursor: hacerlo
podria escribir tracking o leer estado de otra pieza de trabajo.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


class AidlcLayoutAmbiguityError(RuntimeError):
    """Hay varios intents y falta una seleccion inequivoca."""


@dataclass(frozen=True)
class AidlcLayout:
    version: str
    project_root: Path
    docs_root: Path
    record_dir: Optional[Path]
    space: Optional[str]
    intent: Optional[str]
    selection_source: str
    state_file: Path
    audit_files: tuple[Path, ...]
    tracking_dir: Path
    plan_files: tuple[Path, ...] = field(default_factory=tuple)

    @property
    def progress_index(self) -> Path:
        return self.tracking_dir / "INDICE-PROGRESO.md"

    @property
    def adjustments_index(self) -> Path:
        return self.tracking_dir / "INDICE-AJUSTES.md"

    @property
    def progress_index_relative(self) -> str:
        return self.progress_index.relative_to(self.project_root).as_posix()


def find_project_root(start: Path) -> Path:
    current = Path(start).resolve()
    if current.is_file():
        current = current.parent
    original = current
    while True:
        if any((current / marker).exists() for marker in (".git", ".intelix", "aidlc", "aidlc-docs")):
            return current
        if current.parent == current:
            return original
        current = current.parent


def _read_cursor(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _validate_selector(value: str, label: str) -> str:
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
    if not value or any(char not in allowed for char in value):
        raise ValueError(f"Selector AI-DLC invalido para {label}: {value!r}")
    return value


def _active_space(root: Path, explicit: Optional[str]) -> tuple[str, str]:
    if explicit:
        return _validate_selector(explicit, "space"), "explicit"
    cursor = _read_cursor(root / "aidlc" / "active-space")
    if cursor:
        return _validate_selector(cursor, "active-space"), "cursor"
    return "default", "default"


def _intent_records(intents_dir: Path) -> list[Path]:
    if not intents_dir.is_dir():
        return []
    return sorted(
        (entry for entry in intents_dir.iterdir()
         if entry.is_dir() and (entry / "aidlc-state.md").is_file()),
        key=lambda entry: entry.name,
    )


def _active_v2_record(
    root: Path,
    *,
    space: Optional[str] = None,
    intent: Optional[str] = None,
) -> Optional[tuple[Path, str, str]]:
    space_name, _ = _active_space(root, space)
    intents_dir = root / "aidlc" / "spaces" / space_name / "intents"
    records = _intent_records(intents_dir)

    if intent:
        intent_name = _validate_selector(intent, "intent")
        record = intents_dir / intent_name
        if not (record / "aidlc-state.md").is_file():
            raise FileNotFoundError(f"El intent explicito {space_name}/{intent_name} no existe o no tiene estado.")
        return record, space_name, "explicit"

    cursor = _read_cursor(intents_dir / "active-intent")
    if cursor:
        cursor = _validate_selector(cursor, "active-intent")
        record = intents_dir / cursor
        if (record / "aidlc-state.md").is_file():
            return record, space_name, "cursor"

    if len(records) == 1:
        return records[0], space_name, "lone-intent"
    if len(records) > 1:
        raise AidlcLayoutAmbiguityError(
            f"Hay {len(records)} intents en el space {space_name} y no existe active-intent valido."
        )
    return None


def _plan_files(record: Path, version: str) -> tuple[Path, ...]:
    if version == "v1":
        plans = record / "construction" / "plans"
        return tuple(sorted(plans.glob("*code-generation-plan.md"))) if plans.is_dir() else ()
    construction = record / "construction"
    return tuple(sorted(construction.glob("*/code-generation/code-generation-plan.md"))) if construction.is_dir() else ()


def resolve_layout(
    project_root: Path,
    *,
    allow_legacy_fallback: bool = True,
    space: Optional[str] = None,
    intent: Optional[str] = None,
) -> AidlcLayout:
    root = Path(project_root).resolve()
    active = _active_v2_record(root, space=space, intent=intent)
    if active is not None:
        record, space_name, source = active
        audit_dir = record / "audit"
        audit = tuple(sorted(audit_dir.glob("*.md"))) if audit_dir.is_dir() else ()
        return AidlcLayout(
            version="v2",
            project_root=root,
            docs_root=record,
            record_dir=record,
            space=space_name,
            intent=record.name,
            selection_source=source,
            state_file=record / "aidlc-state.md",
            audit_files=audit,
            tracking_dir=record / "tracking",
            plan_files=_plan_files(record, "v2"),
        )

    legacy = root / "aidlc-docs"
    if legacy.is_dir() or allow_legacy_fallback:
        return AidlcLayout(
            version="v1",
            project_root=root,
            docs_root=legacy,
            record_dir=None,
            space=None,
            intent=None,
            selection_source="legacy" if legacy.is_dir() else "legacy-fallback",
            state_file=legacy / "aidlc-state.md",
            audit_files=(legacy / "audit.md",),
            tracking_dir=legacy / "tracking",
            plan_files=_plan_files(legacy, "v1"),
        )

    raise FileNotFoundError(
        f"No se detecto AI-DLC en {root}: se esperaba aidlc-docs/ o un intent v2 activo."
    )


def detect_layout(project_root: Path) -> AidlcLayout:
    """Alias estricto conservado para intelix-task-tracker."""
    return resolve_layout(project_root, allow_legacy_fallback=False)


def unit_name_from_plan(plan_path: Path, version: str) -> str:
    if version == "v2":
        return Path(plan_path).parent.parent.name
    return Path(plan_path).stem.replace("-code-generation-plan", "")


def default_project_root_from_skill(skill_file: Path) -> Path:
    return find_project_root(Path(skill_file))
