#!/usr/bin/env python3
"""
Generador del Consolidado de Avance (multi-rama / multi-colaborador).

Usa el MISMO formato que el reporte de avance normal (dashboard de entregables ->
tareas con estado, fechas, progreso y gráficos), pero **consolidando todas las
ramas**: por cada tarea muestra el estado MÁS AVANZADO presente en cualquier rama
y una columna "Rama" que indica de dónde proviene ese estado.

Respeta el principio rector: el **avance oficial** se reporta solo desde la rama
canónica (`develop`); el consolidado de la tabla reúne el trabajo de todas las
ramas para dar visibilidad del avance real por tarea.

Salidas en `.intelix/outputs/consolidado_avance/`:
    - CONSOLIDADO-AVANCE-YYYYMMDDHHMM.md   (+ alias CONSOLIDADO-AVANCE.md)
    - consolidado-avance-YYYYMMDDHHMM.html (+ alias consolidado-avance.html)

Uso:
    python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py
    python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --rama-canonica develop --remoto origin
    python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --fuente-local
    python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --json
    python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --no-versionado
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# En Windows la consola suele ser cp1252 y falla al imprimir emojis de estado.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

from consolidado_core import (  # noqa: E402
    RAMA_CANONICA_DEFAULT,
    INDICE_REL_DEFAULT,
    GitError,
    construir_dashboard_consolidado,
)

OUTPUT_REL = Path(".intelix") / "outputs" / "consolidado_avance"

# Presentación del estado para el ESPECTADOR EXTERNO (equipo de Soluciones).
#
# REGLA (acordada): solo se muestran tres etiquetas — Pendiente / En progreso /
# Completada. Una tarea "completada por el agente" (🟡) o "en ajuste" (🔧) AÚN NO
# está verificada por un humano, así que se presenta como **En progreso** (no como
# "Completada"), para no dar a entender que ya está cerrada del lado del
# desarrollador. Solo la verificación humana (✅) se muestra como **Completada**.
#
# Esto es SOLO presentación: el índice y el task-tracker (skill intelix-task-tracker) conservan
# sus estados internos (⬜🔄🟡🔧✅) sin cambios. El PESO/porcentaje también se
# conserva (Opción 1): 🟡/🔧 siguen valiendo 90% en la barra; solo cambia el texto.
#
# símbolo -> (etiqueta visible, clase de badge/color, peso %)
ESTADOS = {
    "\u2705": ("Completada", "verificada", 100),   # ✅ verificada por humano
    "\U0001f7e1": ("En progreso", "progreso", 90),  # 🟡 hecha por agente, sin verificar
    "\U0001f527": ("En progreso", "progreso", 90),  # 🔧 en ajuste
    "\U0001f504": ("En progreso", "progreso", 50),  # 🔄 agente trabajando
    "\u2b1c": ("Pendiente", "pendiente", 0),         # ⬜ pendiente
    "\u23ed\ufe0f": ("Omitida", "pendiente", 0),     # ⏭️ omitida
}

_DEFAULT_ESTADO = ("Pendiente", "pendiente", 0)


def _cat(estado: str) -> str:
    return ESTADOS.get((estado or "").strip(), _DEFAULT_ESTADO)[1]


def _label(estado: str) -> str:
    return ESTADOS.get((estado or "").strip(), _DEFAULT_ESTADO)[0]


def _pct_tarea(estado: str) -> int:
    return ESTADOS.get((estado or "").strip(), _DEFAULT_ESTADO)[2]


def _color_barra(pct: int) -> str:
    return "#22c55e" if pct >= 100 else "#f59e0b" if pct >= 50 else "#3b82f6" if pct > 0 else "#94a3b8"


# ---------------------------------------------------------------------------
# Raíz del proyecto
# ---------------------------------------------------------------------------

def resolver_raiz(inicio: Path) -> Path:
    marcadores = (".git", "aidlc", "aidlc-docs", ".intelix")
    d = inicio.resolve()
    while True:
        if any((d / m).exists() for m in marcadores):
            return d
        if d.parent == d:
            return inicio.resolve()
        d = d.parent


def _esc_md(s) -> str:
    return str("" if s is None else s).replace("|", "\\|")


def _h(s) -> str:
    return (str("" if s is None else s)
            .replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _fecha(s) -> str:
    """Devuelve solo la parte YYYY-MM-DD de un timestamp, o — si no hay."""
    if not s:
        return "—"
    m = str(s)[:10]
    return m if len(m) == 10 and m[4] == "-" else str(s)


def _progreso_global(unidades: list[dict]) -> int:
    if not unidades:
        return 0
    return round(sum(u["progreso"] for u in unidades) / len(unidades))


# ---------------------------------------------------------------------------
# Markdown
# ---------------------------------------------------------------------------

def generar_markdown(modelo: dict, generado_en: str) -> str:
    of = modelo["avance_oficial"]
    cons = modelo["avance_consolidado"]
    o: list[str] = []

    o.append("# Consolidado de Avance del Proyecto (multi-rama) — " + modelo["titulo"])
    o.append("")
    o.append("> **Metodología:** IA-DLC con Kiro · Generado: " + generado_en)
    o.append("> **Rama canónica:** `" + modelo["ref_canonica_usada"] + "` · **Ramas incluidas:** "
             + ", ".join("`" + r + "`" for r in modelo["ramas_incluidas"]))
    o.append("")
    if modelo.get("es_ejemplo"):
        o.append("> ⚠️ **CONSOLIDADO DE EJEMPLO (plantilla).** Se generó desde el índice de")
        o.append("> EJEMPLO de `template_base`, solo para mostrar cómo se verá el consolidado.")
        o.append("> **No representa avance real.** En el proyecto derivado se reemplaza con los")
        o.append("> datos reales al poblar el Índice de Progreso y versionarlo en cada rama.")
        o.append("")
    if modelo.get("fuente_local") or modelo.get("versionado", {}).get("escenario_b"):
        o.append("> ℹ️ **Nota:** el índice no está versionado (Escenario B): el consolidado usa")
        o.append("> solo el checkout actual. Para consolidar varias ramas, versiona el índice de")
        o.append("> tracking en cada rama.")
        o.append("")
    o.append("---")
    o.append("")

    # Avance
    o.append("## Avance del proyecto")
    o.append("")
    o.append("| Métrica | Oficial (`" + modelo["rama_canonica"] + "`) | Consolidado (todas las ramas) |")
    o.append("| :--- | :---: | :---: |")
    o.append(f"| Avance general | **{of['agent_pct']}%** | **{cons['agent_pct']}%** |")
    o.append(f"| Completado (verificado) | **{of['verified_pct']}%** | **{cons['verified_pct']}%** |")
    o.append(f"| Tareas | {of['total']} | {cons['total']} |")
    o.append("")
    o.append("> El **oficial** cuenta solo lo integrado en la rama canónica (`develop`). El")
    o.append("> **consolidado** toma el avance más reciente de cada tarea en cualquier rama")
    o.append("> (incluye trabajo aún no integrado). **Completado** = verificado por el equipo.")
    o.append("")
    o.append("---")
    o.append("")

    completo = modelo.get("modo_completo")

    # Nota de fuentes: plan (baseline) + índice (estado).
    if completo:
        o.append("> 🧩 **Modo completo:** baseline del plan de estimación "
                 f"(`{modelo['plan'].get('archivo')}`) + estado del Índice de Progreso por rama.")
    else:
        o.append("> 🧩 **Modo solo-índice:** no se encontró plan de estimación "
                 f"({modelo.get('plan', {}).get('motivo', 'sin plan')}); se usa solo el "
                 "Índice de Progreso.")
    o.append("")
    o.append("---")
    o.append("")

    # Tabla de entregables -> tareas (formato del reporte normal + columna Rama;
    # en modo completo se añaden Colaborador y Fecha planificada del plan).
    o.append("## Entregables por Unidad de Trabajo")
    o.append("")
    if completo:
        o.append("| Unidad / Tarea | Colaborador | Estado | Rama | Fecha plan. | Inicio real | Fin real | Duración | Progreso |")
        o.append("| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |")
        cols_vacias = " |  |  |  |  |  |  |  |"
    else:
        o.append("| Unidad / Tarea | Estado | Rama | Inicio | Fin | Duración | Progreso |")
        o.append("| :--- | :--- | :--- | :---: | :---: | :---: | :---: |")
        cols_vacias = " |  |  |  |  |  |"
    for u in modelo["unidades"]:
        o.append(f"| **{_esc_md(u['nombre'])}** ({u['progreso']}%)" + cols_vacias)
        for t in u["tareas"]:
            pct = _pct_tarea(t["estado"])
            if completo:
                fplan = _fecha(t.get("inicio_plan")) + " → " + _fecha(t.get("fin_plan"))
                o.append(
                    "| ↳ " + _esc_md(t["id"] + " · " + t["tarea"])
                    + " | " + _esc_md(t.get("colaborador") or "—")
                    + " | " + _label(t["estado"])
                    + " | " + _esc_md(t["rama"])
                    + " | " + fplan
                    + " | " + _fecha(t["inicio"])
                    + " | " + _fecha(t["fin"])
                    + " | " + (t["duracion"] or "—")
                    + " | " + f"{pct}%" + " |"
                )
            else:
                o.append(
                    "| ↳ " + _esc_md(t["id"] + " · " + t["tarea"])
                    + " | " + _label(t["estado"])
                    + " | " + _esc_md(t["rama"])
                    + " | " + _fecha(t["inicio"])
                    + " | " + _fecha(t["fin"])
                    + " | " + (t["duracion"] or "—")
                    + " | " + f"{pct}%" + " |"
                )
    o.append("")
    o.append("---")
    o.append("")

    # Resumen por unidad
    o.append("## Resumen por Unidad")
    o.append("")
    o.append("| Unidad | Tareas | Pendientes | En progreso | Completadas |")
    o.append("| :--- | :---: | :---: | :---: | :---: |")
    for u in modelo["unidades"]:
        s = u["stats"]
        total = s["verificada"] + s["completada"] + s["progreso"] + s["pendiente"]
        # Vista externa (3 estados): En progreso = agente-sin-verificar + en curso;
        # Completadas = solo verificadas por el equipo.
        en_progreso = s["completada"] + s["progreso"]
        o.append(f"| {_esc_md(u['nombre'])} | {total} | {s['pendiente']} | {en_progreso} | "
                 f"{s['verificada']} |")
    o.append("")

    # Progreso por colaborador (solo modo completo, desde el plan)
    if completo and modelo.get("por_colaborador"):
        o.append("---")
        o.append("")
        o.append("## Progreso por Colaborador (asignación del plan)")
        o.append("")
        o.append("| Colaborador | Tareas | Avance general | Completado (verificado) |")
        o.append("| :--- | :---: | :---: | :---: |")
        for c in modelo["por_colaborador"]:
            o.append(f"| {_esc_md(c['colaborador'])} | {c['tareas']} | "
                     f"{c['agent_pct']}% | {c['verified_pct']}% |")
        o.append("")

    o.append("**Estados:** **Completada** (verificada por el equipo) · **En progreso** "
             "(en desarrollo o pendiente de verificación) · **Pendiente** (no iniciada).")
    o.append("La columna **Rama** indica en qué rama vive el avance más reciente de cada tarea"
             + ("; **Colaborador** y **Fecha plan.** provienen del plan de estimación." if completo else ".") )
    o.append("")
    return "\n".join(o) + "\n"


# ---------------------------------------------------------------------------
# HTML (mismo dashboard que el reporte normal + columna Rama)
# ---------------------------------------------------------------------------

def generar_html(modelo: dict, generado_en: str) -> str:
    of = modelo["avance_oficial"]
    cons = modelo["avance_consolidado"]
    prog_global = _progreso_global(modelo["unidades"])

    def barra(pct: int) -> str:
        return (f'<div style="display:flex;align-items:center;gap:.5rem">'
                f'<div class="progress-bar" style="flex:1"><div class="progress-bar-fill" '
                f'style="width:{pct}%;background:{_color_barra(pct)}"></div></div>'
                f'<span style="font-size:.8rem;font-weight:600">{pct}%</span></div>')

    completo = modelo.get("modo_completo")
    # Cabecera de la tabla (columnas extra en modo completo)
    if completo:
        thead = ("<th>Unidad / Tarea</th><th>Colaborador</th><th>Estado</th><th>Rama</th>"
                 "<th>Fecha plan.</th><th>Inicio real</th><th>Fin real</th><th>Duración</th><th>Progreso</th>")
        ncols_pad = 8  # celdas vacías tras el nombre de la unidad
    else:
        thead = ("<th>Unidad / Tarea</th><th>Estado</th><th>Rama</th>"
                 "<th>Inicio</th><th>Fin</th><th>Duración</th><th>Progreso</th>")
        ncols_pad = 5

    # Filas de la tabla entregables -> tareas
    filas = []
    for u in modelo["unidades"]:
        pad = "".join("<td></td>" for _ in range(ncols_pad))
        filas.append(
            f'<tr><td><strong>{_h(u["nombre"])}</strong></td>{pad}'
            f'<td>{barra(u["progreso"])}</td></tr>'
        )
        for t in u["tareas"]:
            cat = _cat(t["estado"])
            rama_badge = (f'<span class="rama rama-canonica">{_h(t["rama"])}</span>'
                          if t.get("es_canonica")
                          else f'<span class="rama">{_h(t["rama"])}</span>')
            if completo:
                fplan = f'{_h(_fecha(t.get("inicio_plan")))} → {_h(_fecha(t.get("fin_plan")))}'
                filas.append(
                    f'<tr><td class="subtarea">↳ {_h(t["id"])} {_h(t["tarea"])}</td>'
                    f'<td>{_h(t.get("colaborador") or "—")}</td>'
                    f'<td><span class="badge badge-{cat}">{_h(_label(t["estado"]))}</span></td>'
                    f'<td>{rama_badge}</td>'
                    f'<td>{fplan}</td>'
                    f'<td>{_h(_fecha(t["inicio"]))}</td>'
                    f'<td>{_h(_fecha(t["fin"]))}</td>'
                    f'<td>{_h(t["duracion"] or "—")}</td>'
                    f'<td>{barra(_pct_tarea(t["estado"]))}</td></tr>'
                )
            else:
                filas.append(
                    f'<tr><td class="subtarea">↳ {_h(t["id"])} {_h(t["tarea"])}</td>'
                    f'<td><span class="badge badge-{cat}">{_h(_label(t["estado"]))}</span></td>'
                    f'<td>{rama_badge}</td>'
                    f'<td>{_h(_fecha(t["inicio"]))}</td>'
                    f'<td>{_h(_fecha(t["fin"]))}</td>'
                    f'<td>{_h(t["duracion"] or "—")}</td>'
                    f'<td>{barra(_pct_tarea(t["estado"]))}</td></tr>'
                )
    filas_html = "".join(filas)

    # Sección de progreso por colaborador (solo modo completo)
    seccion_colab = ""
    if completo and modelo.get("por_colaborador"):
        filas_c = "".join(
            f'<tr><td>{_h(c["colaborador"])}</td><td>{c["tareas"]}</td>'
            f'<td>{barra(round(c["agent_pct"]))}</td>'
            f'<td style="text-align:center">{c["verified_pct"]}%</td></tr>'
            for c in modelo["por_colaborador"]
        )
        seccion_colab = (
            '<div class="table-card"><h3>👥 Progreso por Colaborador (asignación del plan)</h3>'
            '<table><thead><tr><th>Colaborador</th><th>Tareas</th><th>Avance general</th>'
            '<th>Completado (verificado)</th></tr></thead><tbody>' + filas_c + '</tbody></table></div>'
        )

    filas_resumen = []
    for u in modelo["unidades"]:
        s = u["stats"]
        total = s["verificada"] + s["completada"] + s["progreso"] + s["pendiente"]
        # Vista externa (3 estados): En progreso = agente-sin-verificar + en curso;
        # Completadas = solo verificadas por humano.
        en_progreso = s["completada"] + s["progreso"]
        completadas = s["verificada"]
        filas_resumen.append(
            f'<tr><td><strong>{_h(u["nombre"])}</strong></td><td>{total}</td>'
            f'<td>{s["pendiente"]}</td><td>{en_progreso}</td>'
            f'<td>{completadas}</td></tr>'
        )
    filas_resumen_html = "".join(filas_resumen)

    chart = {
        "verificada": sum(u["stats"]["verificada"] for u in modelo["unidades"]),
        "completada": sum(u["stats"]["completada"] for u in modelo["unidades"]),
        "progreso": sum(u["stats"]["progreso"] for u in modelo["unidades"]),
        "pendiente": sum(u["stats"]["pendiente"] for u in modelo["unidades"]),
        "unidades": [{"nombre": u["nombre"], "progreso": u["progreso"]} for u in modelo["unidades"]],
    }

    aviso_ejemplo = ""
    if modelo.get("es_ejemplo"):
        aviso_ejemplo = (
            '<div style="background:#fffbeb;border:1px solid #f59e0b;border-left:6px solid #f59e0b;'
            'border-radius:10px;padding:1rem 1.25rem;margin-bottom:2rem;color:#92400e">'
            '<strong>⚠️ Consolidado de EJEMPLO (plantilla).</strong> Generado desde el índice de '
            'ejemplo de <code>template_base</code>, solo para mostrar cómo se verá el consolidado. '
            '<strong>No representa avance real.</strong> En el proyecto derivado se reemplaza con '
            'los datos reales al poblar el Índice de Progreso y versionarlo en cada rama.</div>'
        )

    ramas_txt = " · ".join(_h(r) for r in modelo["ramas_incluidas"])

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consolidado de Avance — {_h(modelo['titulo'])}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
:root{{--primary:#1e3a5f;--primary-light:#2d5a8e;--accent:#f59e0b;--success:#22c55e;--muted:#94a3b8;--bg:#f8fafc;--card-bg:#fff;--text:#1e293b;--text-muted:#64748b;--border:#e2e8f0}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:2rem}}
.container{{max-width:1200px;margin:0 auto}}
.header{{background:linear-gradient(135deg,var(--primary),var(--primary-light));color:#fff;padding:2rem 2.5rem;border-radius:16px;margin-bottom:2rem;box-shadow:0 10px 40px rgba(30,58,95,.3)}}
.header h1{{font-size:1.75rem;margin-bottom:.5rem}}
.header-meta{{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:1rem;font-size:.9rem;opacity:.9}}
.progress-section{{display:grid;grid-template-columns:200px 1fr;gap:2rem;align-items:center;margin-bottom:2rem;background:var(--card-bg);padding:2rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.06)}}
.progress-ring{{position:relative;width:160px;height:160px;margin:0 auto}}
.percent-label{{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:700;color:var(--primary)}}
.kpis{{display:flex;flex-wrap:wrap;gap:1rem}}
.kpi{{background:var(--bg);border-radius:10px;padding:1rem 1.25rem;min-width:130px}}
.kpi .num{{font-size:1.6rem;font-weight:700;color:var(--primary)}}
.kpi .lbl{{font-size:.78rem;color:var(--muted)}}
.charts-grid{{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:2rem}}
@media(max-width:768px){{.charts-grid{{grid-template-columns:1fr}}.progress-section{{grid-template-columns:1fr}}}}
.chart-card{{background:var(--card-bg);border-radius:12px;padding:1.5rem;box-shadow:0 2px 12px rgba(0,0,0,.06)}}
.chart-card h3{{font-size:1rem;color:var(--text-muted);margin-bottom:1rem}}
.table-card{{background:var(--card-bg);border-radius:12px;padding:1.5rem;box-shadow:0 2px 12px rgba(0,0,0,.06);margin-bottom:2rem;overflow-x:auto}}
.table-card h3{{font-size:1rem;color:var(--text-muted);margin-bottom:1rem}}
table{{width:100%;border-collapse:collapse;font-size:.9rem}}
th{{background:var(--bg);padding:.75rem 1rem;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:2px solid var(--border)}}
td{{padding:.75rem 1rem;border-bottom:1px solid var(--border)}}
tr:hover td{{background:#f1f5f9}}
.badge{{display:inline-block;padding:.2rem .6rem;border-radius:999px;font-size:.75rem;font-weight:600}}
.badge-verificada{{background:#dcfce7;color:#166534}}
.badge-completada{{background:#fef3c7;color:#92400e}}
.badge-progreso{{background:#dbeafe;color:#1e40af}}
.badge-pendiente{{background:#f1f5f9;color:#475569}}
.rama{{display:inline-block;padding:.15rem .5rem;border-radius:6px;font-size:.72rem;font-weight:600;background:#eef2ff;color:#3730a3}}
.rama-canonica{{background:#dcfce7;color:#166534}}
.progress-bar{{width:100%;height:8px;background:var(--border);border-radius:4px;overflow:hidden}}
.progress-bar-fill{{height:100%;border-radius:4px}}
.subtarea{{padding-left:2rem;color:var(--text-muted);font-size:.85rem}}
.footer{{text-align:center;color:var(--text-muted);font-size:.8rem;padding:1rem;border-top:1px solid var(--border);margin-top:2rem}}
</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Consolidado — {_h(modelo['titulo'])}</h1>
            <div class="header-meta">
                <span>🗂️ {len(modelo['unidades'])} unidades · {cons['total']} tareas</span>
                <span>🤖 Consolidado {cons['agent_pct']}%</span>
                <span>✅ Oficial ({_h(modelo['rama_canonica'])}) {of['agent_pct']}%</span>
                <span>🌿 {ramas_txt}</span>
                <span>🕐 {_h(generado_en)}</span>
            </div>
        </div>
        {aviso_ejemplo}
        <div class="progress-section">
            <div class="progress-ring">
                <canvas id="progressRing" width="160" height="160"></canvas>
                <div class="percent-label">{prog_global}%</div>
            </div>
            <div>
                <h2 style="margin-bottom:1rem;color:var(--primary)">Avance del Proyecto</h2>
                <div class="kpis">
                    <div class="kpi"><div class="num">{cons['agent_pct']}%</div><div class="lbl">Avance consolidado</div></div>
                    <div class="kpi"><div class="num">{cons['verified_pct']}%</div><div class="lbl">Completado (verificado)</div></div>
                    <div class="kpi"><div class="num">{of['agent_pct']}%</div><div class="lbl">Avance oficial ({_h(modelo['rama_canonica'])})</div></div>
                    <div class="kpi"><div class="num">{cons['total']}</div><div class="lbl">Tareas</div></div>
                </div>
            </div>
        </div>
        <div class="charts-grid">
            <div class="chart-card"><h3>📊 Distribución por Estado (consolidado)</h3><canvas id="pieEstados"></canvas></div>
            <div class="chart-card"><h3>📈 Progreso por Unidad</h3><canvas id="barProgreso"></canvas></div>
        </div>
        <div class="table-card">
            <h3>🛠️ Entregables por Unidad de Trabajo (consolidado de todas las ramas)</h3>
            <table><thead><tr>{thead}</tr></thead><tbody>
            {filas_html}
            </tbody></table>
        </div>
        <div class="table-card">
            <h3>📋 Resumen por Unidad</h3>
            <table><thead><tr><th>Unidad</th><th>Tareas</th><th>Pendientes</th><th>En progreso</th><th>Completadas</th></tr></thead><tbody>
            {filas_resumen_html}
            </tbody></table>
        </div>
        {seccion_colab}
        <div class="footer">Consolidado multi-rama generado por <strong>intelix-consolidado-avance</strong> — {_h(generado_en)}<br><small>Estados: <strong>Completada</strong> (verificada por el equipo) · <strong>En progreso</strong> (en desarrollo o pendiente de verificación) · <strong>Pendiente</strong> (no iniciada). La columna Rama indica dónde vive el avance más reciente de cada tarea · Archivo autocontenido.</small></div>
    </div>
    <script>
        const D={json.dumps(chart, ensure_ascii=False)};
        (function(){{const c=document.getElementById('progressRing').getContext('2d'),p={prog_global};c.beginPath();c.arc(80,80,65,0,2*Math.PI);c.strokeStyle='#e2e8f0';c.lineWidth=12;c.stroke();c.beginPath();c.arc(80,80,65,-Math.PI/2,-Math.PI/2+(2*Math.PI*p/100));c.strokeStyle=p>=75?'#22c55e':p>=40?'#f59e0b':'#ef4444';c.lineWidth=12;c.lineCap='round';c.stroke()}})();
        new Chart(document.getElementById('pieEstados'),{{type:'doughnut',data:{{labels:['Completada','En progreso','Pendiente'],datasets:[{{data:[D.verificada,D.completada+D.progreso,D.pendiente],backgroundColor:['#22c55e','#f59e0b','#94a3b8'],borderWidth:2,borderColor:'#fff'}}]}},options:{{responsive:true,plugins:{{legend:{{position:'bottom'}}}}}}}});
        new Chart(document.getElementById('barProgreso'),{{type:'bar',data:{{labels:D.unidades.map(u=>u.nombre),datasets:[{{label:'% Progreso',data:D.unidades.map(u=>u.progreso),backgroundColor:D.unidades.map(u=>u.progreso>=100?'#22c55e':u.progreso>=50?'#f59e0b':u.progreso>0?'#3b82f6':'#94a3b8'),borderRadius:6}}]}},options:{{responsive:true,indexAxis:'y',scales:{{x:{{min:0,max:100,ticks:{{callback:v=>v+'%'}}}},y:{{ticks:{{font:{{size:11}}}}}}}},plugins:{{legend:{{display:false}}}}}}}});
    </script>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------

def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M")


def escribir_reportes(root: Path, modelo: dict, versionado: bool = True) -> list[Path]:
    generado_en = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    md = generar_markdown(modelo, generado_en)
    html = generar_html(modelo, generado_en)

    out_dir = root / OUTPUT_REL
    out_dir.mkdir(parents=True, exist_ok=True)

    escritos: list[Path] = []
    if versionado:
        s = _stamp()
        md_v = out_dir / f"CONSOLIDADO-AVANCE-{s}.md"
        html_v = out_dir / f"consolidado-avance-{s}.html"
        md_v.write_text(md, encoding="utf-8")
        html_v.write_text(html, encoding="utf-8")
        escritos += [md_v, html_v]

    md_alias = out_dir / "CONSOLIDADO-AVANCE.md"
    html_alias = out_dir / "consolidado-avance.html"
    md_alias.write_text(md, encoding="utf-8")
    html_alias.write_text(html, encoding="utf-8")
    escritos += [md_alias, html_alias]
    return escritos


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def construir_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Consolida el avance de todas las ramas en el formato del reporte "
                    "de avance normal (entregables -> tareas), con columna Rama."
    )
    p.add_argument("--raiz", default=".", help="Raíz del proyecto (por defecto: directorio actual).")
    p.add_argument("--rama-canonica", default=RAMA_CANONICA_DEFAULT,
                   help=f"Rama canónica de integración (por defecto: {RAMA_CANONICA_DEFAULT}).")
    p.add_argument("--remoto", default="origin", help="Nombre del remoto (por defecto: origin).")
    p.add_argument("--indice-rel", default=INDICE_REL_DEFAULT,
                   help="Ruta del índice dentro de cada rama (por defecto: registro AI-DLC activo).")
    p.add_argument("--fuente-local", action="store_true",
                   help="Lee el índice del working tree local en vez de git show "
                        "(validación o Escenario B, un solo checkout).")
    p.add_argument("--json", action="store_true", dest="como_json",
                   help="Emite el modelo consolidado en JSON (no escribe MD/HTML).")
    p.add_argument("--no-versionado", action="store_true",
                   help="No genera copia con timestamp; solo actualiza los alias estables.")
    return p


def main(argv: list[str] | None = None) -> int:
    args = construir_parser().parse_args(argv)
    root = resolver_raiz(Path(args.raiz))

    try:
        modelo = construir_dashboard_consolidado(
            root,
            rama_canonica=args.rama_canonica,
            remoto=args.remoto,
            indice_rel=args.indice_rel,
            fuente_local=args.fuente_local,
        )
    except GitError as e:
        msg = str(e)
        if msg.startswith("ESCENARIO_B:"):
            print("AVISO (Escenario B): " + msg[len("ESCENARIO_B:"):].strip(), file=sys.stderr)
            print("", file=sys.stderr)
            print("Reintente con --fuente-local para validar con el índice del working tree:",
                  file=sys.stderr)
            print("  python .kiro/skills/intelix-consolidado-avance/generar_consolidado.py --fuente-local",
                  file=sys.stderr)
        else:
            print(f"ERROR: {msg}", file=sys.stderr)
        return 1

    if args.como_json:
        print(json.dumps(modelo, ensure_ascii=False, indent=2))
        return 0

    escritos = escribir_reportes(root, modelo, versionado=not args.no_versionado)
    of = modelo["avance_oficial"]
    cons = modelo["avance_consolidado"]
    print("Consolidado de avance (dashboard multi-rama) generado.")
    print(f"  Rama canónica: {modelo['ref_canonica_usada']}")
    print(f"  Ramas incluidas: {', '.join(modelo['ramas_incluidas'])}")
    print(f"  Avance oficial ({modelo['rama_canonica']}): agente {of['agent_pct']}% · verificado {of['verified_pct']}%")
    print(f"  Avance consolidado (todas): agente {cons['agent_pct']}% · verificado {cons['verified_pct']}% ({cons['total']} tareas)")
    print("  Archivos:")
    for f in escritos:
        try:
            print("    " + str(f.relative_to(root)))
        except ValueError:
            print("    " + str(f))
    return 0


if __name__ == "__main__":
    sys.exit(main())
