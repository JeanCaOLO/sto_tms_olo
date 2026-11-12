"""
Generador de reporte PDF del Task Tracker.
Lee INDICE-PROGRESO.md y INDICE-AJUSTES.md y produce un PDF visual.

Uso:
    python generate_tracking_pdf.py <indice_progreso.md> [indice_ajustes.md] <output.pdf>

Requiere: pip install reportlab
          tracker_core.py en el mismo directorio.
"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
)
from reportlab.lib.enums import TA_CENTER

from tracker_core import (
    parse_progress, parse_adjustments, calculate_global_stats,
    calculate_unit_stats, calculate_us_progress,
    get_state_label, get_state_color,
    Unit, Adjustment, GlobalStats, UserStoryProgress
)


# --- Helpers ---

def _esc_xml(text: str) -> str:
    """Escape XML special characters for ReportLab Paragraph."""
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# --- PDF Generation ---

def generate_pdf(units: list[Unit], adjustments: list[Adjustment], stats: GlobalStats, us_progress: list[UserStoryProgress], output_path: Path) -> None:
    """Generate the PDF report."""
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=landscape(LETTER),
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="Title2",
        parent=styles["Title"],
        fontSize=16,
        textColor=colors.HexColor("#1a237e"),
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="Subtitle",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#666666"),
        spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=colors.HexColor("#1a237e"),
        spaceBefore=14,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="CellText",
        parent=styles["Normal"],
        fontSize=7,
        leading=9,
    ))
    styles.add(ParagraphStyle(
        name="SmallNote",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#666666"),
        spaceAfter=8,
    ))

    elements = []
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # Header
    elements.append(Paragraph("Task Tracker", styles["Title2"]))
    elements.append(Paragraph(f"AI-DLC v1 · Reporte generado: {now}", styles["Subtitle"]))

    # KPIs summary table
    kpi_data = [
        ["Total", "Pendientes", "En progreso", "Completadas", "Verificadas", "En ajuste", "% Agente", "% Verificado"],
        [
            str(stats.total),
            str(stats.pending),
            str(stats.in_progress),
            str(stats.agent_done),
            str(stats.verified),
            str(stats.adjusting),
            f"{stats.agent_pct:.1f}%",
            f"{stats.verified_pct:.1f}%",
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[75, 65, 65, 75, 65, 60, 65, 70])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a237e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#999999")),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F5F5F5")),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(kpi_table)
    elements.append(Spacer(1, 12))

    # Legend
    legend_text = (
        "<b>Leyenda:</b> "
        '<font color="#E0E0E0">●</font> Pendiente &nbsp; '
        '<font color="#42A5F5">●</font> En progreso &nbsp; '
        '<font color="#FFC107">●</font> Completada (agente) &nbsp; '
        '<font color="#FF7043">●</font> En ajuste &nbsp; '
        '<font color="#66BB6A">●</font> Verificada &nbsp; '
        '<font color="#BDBDBD">●</font> Omitida'
    )
    elements.append(Paragraph(legend_text, styles["SmallNote"]))

    # --- US Progress Section ---
    elements.append(Paragraph("Avance por Historia de Usuario", styles["SectionTitle"]))

    us_header = ["Historia", "Tareas", "Agente", "Verificado", "Inicio", "Fin"]
    us_data = [us_header]
    for usp in us_progress:
        if usp.total_tasks == 0:
            us_data.append([usp.us_id, "0", "N/A", "N/A", "—", "—"])
        else:
            start_str = usp.start or "—"
            end_str = usp.end or "—"
            us_data.append([
                usp.us_id,
                str(usp.total_tasks),
                f"{usp.agent_pct:.1f}%",
                f"{usp.verified_pct:.1f}%",
                Paragraph(_esc_xml(start_str), styles["CellText"]),
                Paragraph(_esc_xml(end_str), styles["CellText"]),
            ])

    us_table = Table(us_data, colWidths=[55, 45, 55, 60, 145, 145], repeatRows=1)
    us_style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a237e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("ALIGN", (0, 0), (3, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
    ]
    us_table.setStyle(TableStyle(us_style_cmds))
    elements.append(us_table)
    elements.append(Spacer(1, 10))

    # --- Units ---
    elements.append(Paragraph("Detalle por Unidad", styles["SectionTitle"]))

    for unit in units:
        total, done, pct = calculate_unit_stats(unit)
        elements.append(Paragraph(
            f"{_esc_xml(unit.name)} — {done}/{total} ({pct:.0f}%)",
            styles["SectionTitle"]
        ))

        # Task table with 8 columns
        header = ["ID", "Tarea", "Estado", "Inicio", "Fin", "Dur.", "Aj.", "Historias"]
        col_widths = [48, 195, 62, 95, 95, 52, 35, 120]
        data = [header]

        for task in unit.tasks:
            state_label = get_state_label(task.state)
            desc = Paragraph(_esc_xml(task.description), styles["CellText"])
            stories_str = ", ".join(task.stories) if task.stories else "—"
            stories_p = Paragraph(_esc_xml(stories_str), styles["CellText"])
            start_str = task.start or "—"
            end_str = task.end or "—"
            data.append([
                task.id,
                desc,
                state_label,
                Paragraph(_esc_xml(start_str), styles["CellText"]),
                Paragraph(_esc_xml(end_str), styles["CellText"]),
                task.duration or "—",
                task.adjustments or "—",
                stories_p,
            ])

        table = Table(data, colWidths=col_widths, repeatRows=1)

        style_commands = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EFEFEF")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (2, -1), "CENTER"),
            ("ALIGN", (5, 0), (6, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]

        # Color the state column per row
        for i, task in enumerate(unit.tasks, start=1):
            color_hex = get_state_color(task.state)
            style_commands.append(("BACKGROUND", (2, i), (2, i), colors.HexColor(color_hex)))

        table.setStyle(TableStyle(style_commands))
        elements.append(table)
        elements.append(Spacer(1, 6))

        # Verification criteria
        if unit.criteria:
            elements.append(Paragraph(
                f"<i>Criterios de verificacion: {_esc_xml(unit.criteria)}</i>",
                styles["SmallNote"]
            ))

    # --- Adjustments section ---
    if adjustments:
        elements.append(PageBreak())
        elements.append(Paragraph("Ajustes post-entrega", styles["SectionTitle"]))
        adj_header = ["ID", "Origen", "Descripcion", "Estado", "Duracion"]
        adj_data = [adj_header]
        for adj in adjustments:
            adj_data.append([
                adj.id,
                adj.origin,
                Paragraph(_esc_xml(adj.description), styles["CellText"]),
                adj.state,
                adj.duration or "—",
            ])
        adj_table = Table(adj_data, colWidths=[50, 60, 280, 70, 70], repeatRows=1)
        adj_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EFEFEF")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(adj_table)

    # Footer
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(
        "Generado por intelix-task-tracker · AI-DLC v1",
        ParagraphStyle(name="Footer", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#999999"), alignment=TA_CENTER)
    ))

    doc.build(elements)
    print(f"PDF generado: {output_path}")


def main():
    if len(sys.argv) < 3:
        print("Uso: python generate_tracking_pdf.py <progreso.md> [ajustes.md] <output.pdf>")
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
    generate_pdf(units, adjustments, stats, us_progress, output_path)


if __name__ == "__main__":
    main()
