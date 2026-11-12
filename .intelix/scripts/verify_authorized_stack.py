#!/usr/bin/env python3
"""Verifica pin AI-DLC y senales basicas de plantilla autorizada."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / ".intelix" / "config.json"
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+")


def config_version() -> str | None:
    if not CONFIG.is_file():
        return None
    try:
        data = json.loads(CONFIG.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    for key in ("aidlcVersion", "aidlc_version", "version"):
        if key in data and data[key]:
            return str(data[key])
    aidlc = data.get("aidlc")
    if isinstance(aidlc, dict):
        for key in ("version", "aidlcVersion"):
            if aidlc.get(key):
                return str(aidlc[key])
    return None


def main() -> int:
    errors: list[str] = []

    pin = config_version()
    if not pin:
        errors.append(
            "Falta la version AI-DLC en .intelix/config.json (pin de equipo; corre intelix-cli init / sync)"
        )
    elif not VERSION_RE.match(pin):
        errors.append(f"Version AI-DLC invalida en .intelix/config.json: {pin!r}")
    else:
        print(f"OK pin .intelix/config.json = {pin}")

    required = [
        ROOT / "Product-Definition" / "ENTRY_MODE.md",
        ROOT / "docs" / "estandares" / "seguridad-baseline.md",
        ROOT / "docs" / "FUNCIONALIDADES_PRINCIPALES.md",
        ROOT / ".intelix" / "scripts" / "validate_discovery_gate.py",
    ]
    for path in required:
        if path.is_file():
            print(f"OK {path.relative_to(ROOT)}")
        else:
            errors.append(
                f"Falta {path.relative_to(ROOT)} — el proyecto no parece generado "
                "desde la plantilla aprobada (pide sync al Lider)"
            )

    for e in errors:
        print(f"ERROR: {e}")

    if errors:
        print("\nResultado: NO CONFORME — use la plantilla oficial y el pin de .intelix/config.json")
        return 1
    print("\nResultado: CONFORME (plantilla + pin presentes)")
    print("Siguiente: aidlc doctor")
    return 0


if __name__ == "__main__":
    sys.exit(main())
