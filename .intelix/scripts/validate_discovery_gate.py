#!/usr/bin/env python3
"""Quality Gate 0 — valida Product-Definition para AI-DLC V2."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Script vive en .intelix/scripts/ → raiz del proyecto = parents[2]
ROOT = Path(__file__).resolve().parents[2]
PD = ROOT / "Product-Definition"
AUDIT = ROOT / ".aidlc" / "audit"
REPORT = AUDIT / "gate0-latest.md"

# Nombres canónicos + aliases del documento fuente
VISION_CANDIDATES = ("vision-document.md", "vision.md")
TECH_CANDIDATES = ("technical-environment.md", "tech-env.md")
OPEN_Q = "open-questions.md"
HANDOFF = "HANDOFF_PROMPT.md"

PLACEHOLDER_HINTS = (
    "<!--",
    "Completar con Discovery",
    "Modo plantilla",
    "{{AIDLC_",
)


def find_file(names: tuple[str, ...]) -> Path | None:
    for name in names:
        path = PD / name
        if path.is_file():
            return path
    return None


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def looks_like_stub(text: str) -> bool:
    stripped = text.strip()
    if len(stripped) < 120:
        return True
    hits = sum(1 for h in PLACEHOLDER_HINTS if h in text)
    # stubs de plantilla suelen tener varios placeholders
    return hits >= 2 and len(re.findall(r"^\s*-\s*$", text, re.M)) >= 3


def has_kpi_signal(text: str) -> bool:
    patterns = (
        r"\bKPI",
        r"métrica",
        r"metric",
        r"<\s*\d",
        r"\d+\s*(ms|s|%|usuarios|tx|/min)",
    )
    return any(re.search(p, text, re.I) for p in patterns)


def has_integration_signal(text: str) -> bool:
    patterns = (r"API", r"integraci", r"base de datos", r"database", r"SaaS", r"servicio")
    return any(re.search(p, text, re.I) for p in patterns)


def has_compliance_signal(text: str) -> bool:
    patterns = (r"PII", r"GDPR", r"PCI", r"cumplimiento", r"sensibl", r"auth", r"seguridad")
    return any(re.search(p, text, re.I) for p in patterns)


def section_nonempty(text: str, heading_substr: str) -> bool:
    # Heurística: tras un heading que contenga el texto, hay contenido útil
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#") and heading_substr.lower() in line.lower():
            chunk = "\n".join(lines[i + 1 : i + 12])
            useful = [
                ln
                for ln in chunk.splitlines()
                if ln.strip()
                and not ln.strip().startswith("#")
                and not ln.strip().startswith("<!--")
                and ln.strip() not in {"-", "*", "|---|", "|-----|"}
            ]
            # filas de tabla vacías
            useful = [u for u in useful if not re.match(r"^\|\s*\|", u)]
            return len(useful) >= 1
    return False


def validate(mode: str) -> tuple[list[str], list[str], dict]:
    errors: list[str] = []
    warnings: list[str] = []
    meta: dict = {"mode": mode, "files": {}}

    if not PD.is_dir():
        errors.append("Falta directorio Product-Definition/")
        return errors, warnings, meta

    vision = find_file(VISION_CANDIDATES)
    tech = find_file(TECH_CANDIDATES)
    open_q = PD / OPEN_Q
    handoff = PD / HANDOFF

    meta["files"]["vision"] = str(vision) if vision else None
    meta["files"]["tech"] = str(tech) if tech else None
    meta["files"]["open_questions"] = open_q.is_file()
    meta["files"]["handoff"] = handoff.is_file()

    if vision is None:
        errors.append(f"Falta visión ({' | '.join(VISION_CANDIDATES)})")
    else:
        v = read_text(vision)
        if looks_like_stub(v) and mode == "with-discovery":
            errors.append(f"{vision.name}: parece stub de plantilla (with-discovery exige contenido real)")
        if not (section_nonempty(v, "Problema") or section_nonempty(v, "casos de uso") or section_nonempty(v, "Objetivos")):
            (errors if mode == "with-discovery" else warnings).append(
                f"{vision.name}: problema/objetivos/casos de uso insuficientes"
            )
        if not has_kpi_signal(v):
            (errors if mode == "with-discovery" else warnings).append(
                f"{vision.name}: no se detectan KPIs / métricas cuantificables"
            )
        if not section_nonempty(v, "Out of Scope") and not section_nonempty(v, "Fuera de alcance"):
            warnings.append(f"{vision.name}: Out of Scope recomendado ausente o vacío")

    if tech is None:
        errors.append(f"Falta entorno técnico ({' | '.join(TECH_CANDIDATES)})")
    else:
        t = read_text(tech)
        if looks_like_stub(t) and mode == "with-discovery":
            errors.append(f"{tech.name}: parece stub de plantilla")
        if not has_integration_signal(t):
            (errors if mode == "with-discovery" else warnings).append(
                f"{tech.name}: no se detectan integraciones/sistemas"
            )
        if not has_compliance_signal(t):
            (errors if mode == "with-discovery" else warnings).append(
                f"{tech.name}: no se detecta cumplimiento/seguridad/datos sensibles"
            )

    if not open_q.is_file():
        errors.append(f"Falta {OPEN_Q}")
    else:
        # archivo presente basta; contenido vacío es warning
        if len(read_text(open_q).strip()) < 40:
            warnings.append(f"{OPEN_Q}: muy corto; confirme si no hay preguntas abiertas")

    if mode == "with-discovery":
        if not handoff.is_file():
            errors.append(f"Falta {HANDOFF} (obligatorio en with-discovery)")
        else:
            h = read_text(handoff)
            if "init-inception" not in h and "/aidlc" not in h:
                warnings.append(f"{HANDOFF}: no parece contener un prompt de orquestador")
            if "{{AIDLC_" in h:
                warnings.append(f"{HANDOFF}: aún contiene placeholders de plantilla")
    else:
        if not handoff.is_file():
            warnings.append(f"{HANDOFF} ausente (opcional en no-discovery)")

    entry = PD / "ENTRY_MODE.md"
    if entry.is_file():
        em = read_text(entry)
        if mode == "with-discovery" and "no-discovery" in em and "with-discovery" not in em.split("```")[-1]:
            # heurística suave
            if re.search(r"^no-discovery\s*$", em, re.M) and not re.search(
                r"^with-discovery\s*$", em, re.M
            ):
                warnings.append("ENTRY_MODE.md declara no-discovery pero CI/mode es with-discovery")

    return errors, warnings, meta


def write_report(mode: str, errors: list[str], warnings: list[str], meta: dict) -> None:
    AUDIT.mkdir(parents=True, exist_ok=True)
    status = "APROBADO" if not errors else "REQUIERE_AJUSTES"
    if mode == "no-discovery" and errors:
        # en soft mode los "errors" de contenido se reportan pero el caller decide exit
        pass
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        f"# Gate 0 Report — {status}",
        "",
        f"- timestamp: {now}",
        f"- mode: {mode}",
        f"- files: {meta.get('files')}",
        "",
        "## Errores (bloqueantes)",
    ]
    lines += [f"- {e}" for e in errors] or ["- (ninguno)"]
    lines += ["", "## Warnings"]
    lines += [f"- {w}" for w in warnings] or ["- (ninguno)"]
    lines += [
        "",
        "## Siguiente paso",
        "- Si APROBADO: actualizar `.aidlc/aidlc-state.md` (gate_status=approved, phase=Inception).",
        "- Si REQUIERE_AJUSTES: Review Sync 30 min con PO y re-ejecutar este script.",
        "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="AI-DLC Quality Gate 0 validator")
    parser.add_argument(
        "--mode",
        choices=("with-discovery", "no-discovery"),
        default="with-discovery",
        help="Entry mode (default: with-discovery)",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help="Exit non-zero on failures (CI)",
    )
    parser.add_argument(
        "--strict-no-discovery",
        action="store_true",
        help="En no-discovery, tratar faltantes de contenido como error (pre-Inception)",
    )
    args = parser.parse_args()

    mode = args.mode
    effective = mode
    if mode == "no-discovery" and args.strict_no_discovery:
        effective = "with-discovery"  # mismos criterios de contenido

    errors, warnings, meta = validate(effective if args.strict_no_discovery else mode)

    # En no-discovery sin --strict: degradar errores de contenido a warnings excepto archivos faltantes
    if mode == "no-discovery" and not args.strict_no_discovery:
        soft_errors = []
        for e in errors:
            if e.startswith("Falta"):
                soft_errors.append(e)
            else:
                warnings.append(f"[soft] {e}")
        errors = soft_errors

    write_report(mode, errors, warnings, meta)

    print(f"Gate 0 mode={mode}")
    for e in errors:
        print(f"ERROR: {e}")
    for w in warnings:
        print(f"WARN: {w}")
    print(f"Report: {REPORT}")

    if errors and (args.ci or mode == "with-discovery"):
        return 1
    if errors and args.strict_no_discovery:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
