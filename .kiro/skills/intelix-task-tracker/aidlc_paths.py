"""Adaptador de compatibilidad hacia el resolvedor canonico de INTELIX.

La implementacion unica vive en ``.intelix/scripts/aidlc_paths.py``. Este
archivo conserva los imports historicos de ``check_drift.py`` y scripts usados
directamente desde la carpeta de la skill.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _project_root() -> Path:
    current = Path(__file__).resolve().parent
    while current.parent != current:
        if (current / ".intelix" / "scripts" / "aidlc_paths.py").is_file():
            return current
        current = current.parent
    raise ImportError("No se encontro .intelix/scripts/aidlc_paths.py")


_CANONICAL = _project_root() / ".intelix" / "scripts" / "aidlc_paths.py"
_SPEC = importlib.util.spec_from_file_location("_intelix_aidlc_paths_shared", _CANONICAL)
if _SPEC is None or _SPEC.loader is None:
    raise ImportError(f"No se pudo cargar el resolvedor canonico: {_CANONICAL}")
_MODULE = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = _MODULE
_SPEC.loader.exec_module(_MODULE)

AidlcLayout = _MODULE.AidlcLayout
AidlcLayoutAmbiguityError = _MODULE.AidlcLayoutAmbiguityError
resolve_layout = _MODULE.resolve_layout
detect_layout = _MODULE.detect_layout
unit_name_from_plan = _MODULE.unit_name_from_plan
default_project_root_from_skill = _MODULE.default_project_root_from_skill
find_project_root = _MODULE.find_project_root

__all__ = [
    "AidlcLayout",
    "AidlcLayoutAmbiguityError",
    "resolve_layout",
    "detect_layout",
    "unit_name_from_plan",
    "default_project_root_from_skill",
    "find_project_root",
]
