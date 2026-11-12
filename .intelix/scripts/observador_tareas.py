#!/usr/bin/env python3
"""Observador de Tareas — telemetria de patrones INTELIX (Task Observer, recortado).

Capa de LECTURA/AGREGACION que reutiliza artefactos que el proyecto YA produce y
versiona, para retroalimentar la mejora continua. No instala telemetria nueva, no
crea persistencia nueva y no captura datos fuera de estas fuentes:

  1. Tracking AI-DLC (INDICE-PROGRESO.md del layout activo v1/v2) via el resolvedor
     canonico `.intelix/scripts/aidlc_paths.py`.
  2. Ledger de Inception / rework de alcance (.aidlc/audit/inception-iterations.jsonl).

Metricas que agrega (todas derivadas de lo anterior):
  - avance por estado (pendiente / en progreso / completada / verificada);
  - unidades con mas tareas pendientes (cuellos);
  - vueltas de Inception y HH de rework (desde el ledger);
  - tareas con ajustes registrados (reaperturas).

Salida (artefacto por proyecto, junto a los demas de INTELIX):
  .intelix/outputs/observador_tareas/OBSERVADOR-<YYYYMMDDHHMM>.md
  (+ alias estable OBSERVADOR-TAREAS.md)

Sanitiza: no vuelca correos ni nombres propios del ledger; usa solo agregados y
campos no sensibles. Sin dependencias: Python stdlib. ROOT = parents[2].
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aidlc_paths import resolve_layout, AidlcLayoutAmbiguityError  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / ".intelix" / "outputs" / "observador_tareas"
LEDGER = ROOT / ".aidlc" / "audit" / "inception-iterations.jsonl"

# Simbolos de estado del task-tracker (mismos que usa INDICE-PROGRESO.md).
EST_PENDIENTE = "⬜"
EST_PROGRESO = "🟡"
EST_COMPLETA = "✅"  # en el tracker, ✅ de VER-* = verificado; 🟡/otros = agente
EST_VERIFICA = "✅"

# PII a enmascarar si apareciera en summaries del ledger.
PAT_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def sanitizar(texto: str) -> str:
    return PAT_EMAIL.sub("***@***", texto or "")


def leer_tracking(layout) -> dict:
    """Cuenta estados a partir del INDICE-PROGRESO.md del layout activo."""
    idx = layout.progress_index
    resumen = {"pendiente": 0, "en_progreso": 0, "completada": 0, "con_ajuste": 0,
               "total_tareas": 0, "por_unidad": {}, "fuente": None}
    if not idx.is_file():
        return resumen
    resumen["fuente"] = idx.relative_to(layout.project_root).as_posix()
    unidad_actual = "(sin unidad)"
    for raw in idx.read_text(encoding="utf-8", errors="replace").splitlines():
        linea = raw.strip()
        enc = re.match(r"^##\s+Unidad:\s*(.+)$", linea)
        if enc:
            unidad_actual = enc.group(1).strip()
            resumen["por_unidad"].setdefault(unidad_actual, {"pendiente": 0, "en_progreso": 0, "completada": 0})
            continue
        # Filas de tarea del tracker: | ID | Tarea | Estado | ...
        if not linea.startswith("|"):
            continue
        celdas = [c.strip() for c in linea.strip("|").split("|")]
        if len(celdas) < 3:
            continue
        estado = celdas[2]
        if estado not in (EST_PENDIENTE, EST_PROGRESO, EST_COMPLETA):
            continue  # salta encabezados/separadores
        resumen["total_tareas"] += 1
        u = resumen["por_unidad"].setdefault(unidad_actual, {"pendiente": 0, "en_progreso": 0, "completada": 0})
        if estado == EST_PENDIENTE:
            resumen["pendiente"] += 1
            u["pendiente"] += 1
        elif estado == EST_PROGRESO:
            resumen["en_progreso"] += 1
            u["en_progreso"] += 1
        elif estado == EST_COMPLETA:
            resumen["completada"] += 1
            u["completada"] += 1
        # Columna Ajustes (si existe) marca reaperturas
        if len(celdas) >= 7 and celdas[6] and celdas[6] not in ("—", "-", ""):
            resumen["con_ajuste"] += 1
    return resumen


def leer_ledger() -> dict:
    """Agrega el ledger de Inception / rework sin exponer PII."""
    datos = {"disponible": False, "inception": 0, "construction_impact": 0,
             "hh_total": 0.0, "por_tipo": {}}
    if not LEDGER.is_file():
        return datos
    datos["disponible"] = True
    texto = LEDGER.read_text(encoding="utf-8", errors="replace").lstrip("\ufeff")
    for raw in texto.splitlines():
        raw = raw.strip().lstrip("\ufeff")
        if not raw:
            continue
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            continue
        fase = ev.get("phase", "")
        if fase == "inception":
            datos["inception"] += 1
        elif fase == "construction_impact":
            datos["construction_impact"] += 1
        kind = ev.get("kind", "otro")
        datos["por_tipo"][kind] = datos["por_tipo"].get(kind, 0) + 1
        try:
            datos["hh_total"] += float(ev.get("hh_delta", 0) or 0)
        except (TypeError, ValueError):
            pass
    return datos


def pct(parte: int, total: int) -> str:
    return f"{(100.0 * parte / total):.1f}%" if total else "0.0%"


def generar_reporte(layout, tracking: dict, ledger: dict) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    total = tracking["total_tareas"]
    lines = [
        "# Observador de Tareas — patrones INTELIX",
        "",
        f"- timestamp: {now}",
        f"- layout AI-DLC: {layout.version} (seleccion: {layout.selection_source})",
        f"- fuente tracking: {tracking['fuente'] or '(no encontrada)'}",
        "",
        "> Telemetria de solo lectura: agrega el tracking AI-DLC y el ledger de "
        "Inception existentes. No captura datos nuevos ni expone PII.",
        "",
        "## Avance por estado",
        "",
        "| Estado | Tareas | % |",
        "|--------|-------:|--:|",
        f"| Pendientes | {tracking['pendiente']} | {pct(tracking['pendiente'], total)} |",
        f"| En progreso | {tracking['en_progreso']} | {pct(tracking['en_progreso'], total)} |",
        f"| Completadas/verificadas | {tracking['completada']} | {pct(tracking['completada'], total)} |",
        f"| **Total** | **{total}** | 100% |",
        "",
        f"Tareas con ajuste registrado (reaperturas): {tracking['con_ajuste']}",
        "",
    ]

    # Cuellos: unidades con mas pendientes
    unidades = [
        (u, d["pendiente"], d["en_progreso"], d["completada"])
        for u, d in tracking["por_unidad"].items()
        if (d["pendiente"] + d["en_progreso"] + d["completada"]) > 0
    ]
    unidades.sort(key=lambda x: x[1], reverse=True)
    if unidades:
        lines += ["## Unidades con mas pendientes (posibles cuellos)", "",
                   "| Unidad | Pendientes | En progreso | Completadas |",
                   "|--------|-----------:|------------:|------------:|"]
        for u, p, e, c in unidades[:8]:
            lines.append(f"| {u} | {p} | {e} | {c} |")
        lines.append("")

    lines += ["## Iteraciones de Inception / rework de alcance", ""]
    if not ledger["disponible"]:
        lines += ["Sin ledger `inception-iterations.jsonl`: aun no hay vueltas registradas.", ""]
    else:
        lines += [
            f"- Vueltas en Inception: **{ledger['inception']}**",
            f"- Eventos con impacto en Construction: **{ledger['construction_impact']}**",
            f"- HH de rework acumuladas: **{ledger['hh_total']:.1f}**",
            "",
            "Por tipo de evento:",
        ]
        for kind, n in sorted(ledger["por_tipo"].items(), key=lambda x: x[1], reverse=True):
            lines.append(f"- {sanitizar(kind)}: {n}")
        lines.append("")

    lines += [
        "## Lectura para mejora continua",
        "- Unidades con muchas reaperturas o pendientes sugieren refinar el ADR "
        "(`intelix-arquitectura-gate`) o la DoD (`intelix-qa-gate`).",
        "- HH de rework altas apuntan a cerrar alcance antes de Construction.",
        "- El % de avance OFICIAL sigue saliendo de `develop` "
        "(`intelix-consolidado-avance`); este observador es diagnostico, no la fuente oficial.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="INTELIX Observador de Tareas — patrones desde tracking + ledger (solo lectura)"
    )
    parser.add_argument("--space", help="Space AI-DLC explicito (v2)")
    parser.add_argument("--intent", help="Intent AI-DLC explicito (v2)")
    parser.add_argument("--json", action="store_true", help="Imprime agregados en JSON")
    args = parser.parse_args()

    try:
        layout = resolve_layout(ROOT, space=args.space, intent=args.intent)
    except AidlcLayoutAmbiguityError as exc:
        print(f"ERROR: {exc} Declara --space/--intent.", file=sys.stderr)
        return 2
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    tracking = leer_tracking(layout)
    ledger = leer_ledger()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    reporte = generar_reporte(layout, tracking, ledger)
    destino = OUTPUT_DIR / f"OBSERVADOR-{stamp}.md"
    destino.write_text(reporte, encoding="utf-8")
    alias = OUTPUT_DIR / "OBSERVADOR-TAREAS.md"
    alias.write_text(reporte, encoding="utf-8")

    if args.json:
        print(json.dumps({
            "layout": layout.version,
            "tracking": {k: v for k, v in tracking.items() if k != "por_unidad"},
            "ledger": ledger,
            "reporte": str(destino.relative_to(ROOT)),
        }, ensure_ascii=False, indent=2))
    else:
        print(f"Observador de tareas: {tracking['total_tareas']} tarea(s), "
              f"{tracking['pendiente']} pendientes, ledger={'si' if ledger['disponible'] else 'no'}.")
        print(f"Reporte: {destino.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
