"""
Generador de reporte HTML del Task Tracker.
Lee INDICE-PROGRESO.md y INDICE-AJUSTES.md y produce un HTML visual.

Uso:
    python generate_tracking_report.py <indice_progreso.md> [indice_ajustes.md] <output.html>

Requiere: tracker_core.py en el mismo directorio.
"""
import sys
import html as html_mod
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from tracker_core import (
    parse_progress, parse_adjustments, calculate_global_stats,
    calculate_unit_stats, calculate_us_progress,
    get_state_label, get_state_color, STATE_MAP,
    Unit, Task, Adjustment, GlobalStats, UserStoryProgress
)


def _esc(text: str) -> str:
    """Escape HTML special characters."""
    return html_mod.escape(text) if text else ""


def generate_html(units: list[Unit], adjustments: list[Adjustment], stats: GlobalStats, us_progress: list[UserStoryProgress]) -> str:
    """Generate the full HTML report."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # --- Unit cards ---
    unit_cards = ""
    for unit in units:
        total, done, pct = calculate_unit_stats(unit)
        bar_color = "#66BB6A" if pct == 100 else "#42A5F5" if pct > 0 else "#E0E0E0"

        rows = ""
        for task in unit.tasks:
            state_label = get_state_label(task.state)
            state_color = get_state_color(task.state)
            stories_str = ", ".join(task.stories) if task.stories else "\u2014"
            t_id = _esc(task.id)
            t_desc = _esc(task.description)
            t_state = _esc(task.state)
            t_slabel = _esc(state_label)
            t_start = _esc(task.start or "\u2014")
            t_end = _esc(task.end or "\u2014")
            t_dur = _esc(task.duration or "\u2014")
            t_adj = _esc(task.adjustments or "\u2014")
            t_stories = _esc(stories_str)
            rows += f"""
            <tr>
                <td class="task-id">{t_id}</td>
                <td class="task-desc">{t_desc}</td>
                <td><span class="state-badge" style="background:{state_color}">{t_state} {t_slabel}</span></td>
                <td class="time">{t_start}</td>
                <td class="time">{t_end}</td>
                <td class="time">{t_dur}</td>
                <td class="time">{t_adj}</td>
                <td class="stories">{t_stories}</td>
            </tr>"""

        u_name = _esc(unit.name)
        unit_cards += f"""
        <div class="unit-card">
            <div class="unit-header">
                <h3>{u_name}</h3>
                <span class="unit-pct">{pct:.0f}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width:{pct}%; background:{bar_color}"></div>
            </div>
            <p class="unit-summary">{done} de {total} tareas completadas</p>
            <table class="task-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Tarea</th>
                        <th>Estado</th>
                        <th>Inicio</th>
                        <th>Fin</th>
                        <th>Duraci\u00f3n</th>
                        <th>Ajustes</th>
                        <th>Historias</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </div>"""

    # --- US progress section ---
    us_rows = ""
    for usp in us_progress:
        us_id_esc = _esc(usp.us_id)
        if usp.total_tasks == 0:
            us_rows += f"""
            <tr>
                <td class="task-id">{us_id_esc}</td>
                <td class="time">0</td>
                <td class="time">N/A</td>
                <td class="time">N/A</td>
                <td class="time">\u2014</td>
                <td class="time">\u2014</td>
            </tr>"""
        else:
            start_str = _esc(usp.start or "\u2014")
            end_str = _esc(usp.end or "\u2014")
            agent_color = "#66BB6A" if usp.agent_pct >= 100 else "#FFC107" if usp.agent_pct > 0 else "#E0E0E0"
            us_rows += f"""
            <tr>
                <td class="task-id">{us_id_esc}</td>
                <td class="time">{usp.total_tasks}</td>
                <td><div class="mini-progress"><div class="mini-fill" style="width:{usp.agent_pct:.0f}%;background:{agent_color}"></div><span>{usp.agent_pct:.1f}%</span></div></td>
                <td class="time">{usp.verified_pct:.1f}%</td>
                <td class="time">{start_str}</td>
                <td class="time">{end_str}</td>
            </tr>"""

    # --- Adjustments section ---
    adj_rows = ""
    if adjustments:
        for adj in adjustments:
            a_id = _esc(adj.id)
            a_origin = _esc(adj.origin)
            a_desc = _esc(adj.description)
            a_state = _esc(adj.state)
            a_dur = _esc(adj.duration or "\u2014")
            adj_rows += f"""
            <tr>
                <td>{a_id}</td>
                <td>{a_origin}</td>
                <td>{a_desc}</td>
                <td>{a_state}</td>
                <td class="time">{a_dur}</td>
            </tr>"""
    else:
        adj_rows = '<tr><td colspan="5" class="empty">Sin ajustes registrados</td></tr>'

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Tracker</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #F5F5F5; color: #333; padding: 24px; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        .header {{ background: #1a237e; color: #fff; padding: 24px 32px; border-radius: 8px; margin-bottom: 24px; }}
        .header h1 {{ font-size: 1.5rem; margin-bottom: 4px; }}
        .header p {{ opacity: 0.8; font-size: 0.85rem; }}
        .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }}
        .kpi-card {{ background: #fff; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .kpi-card .value {{ font-size: 2rem; font-weight: 700; color: #1a237e; }}
        .kpi-card .label {{ font-size: 0.75rem; color: #666; margin-top: 4px; text-transform: uppercase; }}
        .global-progress {{ background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .global-progress h2 {{ font-size: 1rem; margin-bottom: 12px; }}
        .progress-bar {{ background: #E0E0E0; border-radius: 4px; height: 24px; overflow: hidden; position: relative; }}
        .progress-fill {{ height: 100%; border-radius: 4px; transition: width 0.3s; }}
        .progress-labels {{ display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.8rem; color: #666; }}
        .section-title {{ font-size: 1.1rem; color: #1a237e; margin: 24px 0 12px 0; font-weight: 600; }}
        .unit-card {{ background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .unit-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }}
        .unit-header h3 {{ font-size: 1rem; color: #1a237e; }}
        .unit-pct {{ font-size: 1.2rem; font-weight: 700; color: #1a237e; }}
        .unit-summary {{ font-size: 0.8rem; color: #666; margin-bottom: 12px; }}
        .task-table {{ width: 100%; border-collapse: collapse; font-size: 0.8rem; }}
        .task-table th {{ background: #EFEFEF; padding: 8px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid #DDD; white-space: nowrap; }}
        .task-table td {{ padding: 8px 6px; border-bottom: 1px solid #EEE; }}
        .task-table tr:hover {{ background: #F9F9F9; }}
        .task-id {{ font-family: monospace; font-weight: 600; white-space: nowrap; }}
        .task-desc {{ max-width: 300px; }}
        .time {{ white-space: nowrap; color: #666; font-family: monospace; font-size: 0.75rem; }}
        .stories {{ font-size: 0.75rem; color: #1a237e; max-width: 160px; }}
        .state-badge {{ display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; color: #333; white-space: nowrap; }}
        .legend {{ display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; font-size: 0.8rem; }}
        .legend-item {{ display: flex; align-items: center; gap: 4px; }}
        .legend-dot {{ width: 12px; height: 12px; border-radius: 50%; }}
        .us-table {{ width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 24px; }}
        .us-table th {{ background: #EFEFEF; padding: 8px 10px; text-align: left; font-weight: 600; border-bottom: 1px solid #DDD; }}
        .us-table td {{ padding: 8px 10px; border-bottom: 1px solid #EEE; }}
        .us-table tr:hover {{ background: #F9F9F9; }}
        .mini-progress {{ display: flex; align-items: center; gap: 6px; }}
        .mini-progress .mini-fill {{ height: 8px; border-radius: 4px; min-width: 2px; }}
        .mini-progress span {{ font-size: 0.75rem; font-family: monospace; }}
        .adjustments {{ margin-top: 24px; }}
        .empty {{ text-align: center; color: #999; font-style: italic; }}
        .footer {{ text-align: center; margin-top: 32px; font-size: 0.75rem; color: #999; }}
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>Task Tracker</h1>
        <p>AI-DLC v1 \u00b7 Reporte generado: {now}</p>
    </div>

    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="value">{stats.total}</div>
            <div class="label">Total</div>
        </div>
        <div class="kpi-card">
            <div class="value">{stats.pending}</div>
            <div class="label">Pendientes</div>
        </div>
        <div class="kpi-card">
            <div class="value">{stats.in_progress}</div>
            <div class="label">En progreso</div>
        </div>
        <div class="kpi-card">
            <div class="value" style="color:#FFC107">{stats.agent_done}</div>
            <div class="label">Completadas (agente)</div>
        </div>
        <div class="kpi-card">
            <div class="value" style="color:#66BB6A">{stats.verified}</div>
            <div class="label">Verificadas</div>
        </div>
        <div class="kpi-card">
            <div class="value" style="color:#FF7043">{stats.adjusting}</div>
            <div class="label">En ajuste</div>
        </div>
    </div>

    <div class="global-progress">
        <h2>Progreso global</h2>
        <div class="progress-bar">
            <div class="progress-fill" style="width:{stats.agent_pct:.1f}%; background: linear-gradient(90deg, #66BB6A 0%, #66BB6A {(stats.verified_pct / max(stats.agent_pct, 0.01) * 100):.0f}%, #FFC107 {(stats.verified_pct / max(stats.agent_pct, 0.01) * 100):.0f}%)"></div>
        </div>
        <div class="progress-labels">
            <span>Agente: {stats.agent_pct:.1f}%</span>
            <span>Verificado: {stats.verified_pct:.1f}%</span>
        </div>
    </div>

    <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#E0E0E0"></div> Pendiente</div>
        <div class="legend-item"><div class="legend-dot" style="background:#42A5F5"></div> En progreso</div>
        <div class="legend-item"><div class="legend-dot" style="background:#FFC107"></div> Completada (agente)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#FF7043"></div> En ajuste</div>
        <div class="legend-item"><div class="legend-dot" style="background:#66BB6A"></div> Verificada</div>
        <div class="legend-item"><div class="legend-dot" style="background:#BDBDBD"></div> Omitida</div>
    </div>

    <h2 class="section-title">Avance por Historia de Usuario</h2>
    <div class="unit-card">
        <table class="us-table">
            <thead>
                <tr>
                    <th>Historia</th>
                    <th>Tareas</th>
                    <th>Agente</th>
                    <th>Verificado</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                </tr>
            </thead>
            <tbody>{us_rows}</tbody>
        </table>
    </div>

    <h2 class="section-title">Detalle por Unidad</h2>
    {unit_cards}

    <div class="adjustments">
        <h2 class="section-title">Ajustes post-entrega</h2>
        <table class="task-table">
            <thead>
                <tr><th>ID</th><th>Origen</th><th>Descripci\u00f3n</th><th>Estado</th><th>Duraci\u00f3n</th></tr>
            </thead>
            <tbody>{adj_rows}</tbody>
        </table>
    </div>

    <div class="footer">
        <p>Generado por intelix-task-tracker \u00b7 AI-DLC v1</p>
    </div>
</div>
</body>
</html>"""
    return html


def main():
    if len(sys.argv) < 3:
        print("Uso: python generate_tracking_report.py <progreso.md> [ajustes.md] <output.html>")
        sys.exit(1)

    if len(sys.argv) == 4:
        progress_path = Path(sys.argv[1])
        adjustments_path = Path(sys.argv[2])
        output_path = Path(sys.argv[3])
    else:
        progress_path = Path(sys.argv[1])
        adjustments_path = None
        output_path = Path(sys.argv[2])

    if not progress_path.exists():
        print(f"Error: no existe {progress_path}")
        sys.exit(1)

    progress_content = progress_path.read_text(encoding="utf-8")
    units = parse_progress(progress_content)

    adjustments: list[Adjustment] = []
    if adjustments_path and adjustments_path.exists():
        adj_content = adjustments_path.read_text(encoding="utf-8")
        adjustments = parse_adjustments(adj_content)

    stats = calculate_global_stats(units)
    us_progress = calculate_us_progress(units)
    html_content = generate_html(units, adjustments, stats, us_progress)

    output_path.write_text(html_content, encoding="utf-8")
    print(f"Reporte HTML generado: {output_path}")


if __name__ == "__main__":
    main()
