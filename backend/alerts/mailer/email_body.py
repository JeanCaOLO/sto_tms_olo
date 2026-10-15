"""Arma el correo diario de vencimientos (sin AWS: se prueba solo)."""

from datetime import date
from html import escape

TYPE_LABEL = {"carrier_contract": "Contrato de transportista", "driver_license": "Licencia de conductor"}


def _when(alert: dict) -> str:
    days = int(alert["days_left"])
    if days < 0:
        return f"venció hace {-days} día{'s' if days != -1 else ''}"
    if days == 0:
        return "vence hoy"
    return f"vence en {days} día{'s' if days != 1 else ''}"


def _fmt_date(iso: str) -> str:
    y, m, d = iso[:10].split("-")
    return f"{d}/{m}/{y}"


def _detail(alert: dict) -> str:
    parts = []
    if alert.get("code"):
        parts.append(str(alert["code"]))
    if alert.get("license_number"):
        parts.append(f"licencia {alert['license_number']}")
    if alert.get("carrier_name"):
        parts.append(str(alert["carrier_name"]))
    return " · ".join(parts)


def build_email(alerts: list[dict], today: date, app_url: str | None = None) -> dict | None:
    """{subject, text, html} o None si no hay nada que avisar."""
    if not alerts:
        return None
    expired = [a for a in alerts if a["status"] == "expired"]
    due = [a for a in alerts if a["status"] != "expired"]
    subject = f"TMS · Vencimientos al {today.strftime('%d/%m/%Y')}: {len(expired)} vencidos, {len(due)} por vencer"

    sections = [("Vencidos", expired), ("Vencen en los próximos 30 días", due)]
    text_lines = [subject, ""]
    html_parts = [f"<h2 style='font-family:sans-serif'>{escape(subject)}</h2>"]
    for title, items in sections:
        if not items:
            continue
        text_lines.append(f"{title} ({len(items)}):")
        rows = []
        for a in items:
            detail = _detail(a)
            text_lines.append(f"  - {TYPE_LABEL.get(a['type'], a['type'])}: {a['name']}"
                              f"{f' ({detail})' if detail else ''} — {_fmt_date(a['expiry_date'])}, {_when(a)}")
            rows.append(
                "<tr>"
                f"<td style='padding:4px 8px'>{escape(TYPE_LABEL.get(a['type'], a['type']))}</td>"
                f"<td style='padding:4px 8px'><b>{escape(str(a['name']))}</b><br><small>{escape(detail)}</small></td>"
                f"<td style='padding:4px 8px'>{escape(_fmt_date(a['expiry_date']))}</td>"
                f"<td style='padding:4px 8px'>{escape(_when(a))}</td>"
                "</tr>"
            )
        text_lines.append("")
        html_parts.append(
            f"<h3 style='font-family:sans-serif'>{escape(title)} ({len(items)})</h3>"
            "<table style='border-collapse:collapse;font-family:sans-serif;font-size:14px' border='1'>"
            "<tr><th>Tipo</th><th>Quién</th><th>Fecha</th><th>Estado</th></tr>" + "".join(rows) + "</table>"
        )
    if app_url:
        text_lines.append(f"Ver en el TMS: {app_url}")
        html_parts.append(f"<p style='font-family:sans-serif'><a href='{escape(app_url)}'>Ver en el TMS</a></p>")
    footer = "Aviso automático del TMS (se envía cada día hábil mientras haya vencimientos)."
    text_lines.append(footer)
    html_parts.append(f"<p style='font-family:sans-serif;color:#64748b;font-size:12px'>{escape(footer)}</p>")
    return {"subject": subject, "text": "\n".join(text_lines), "html": "".join(html_parts)}
