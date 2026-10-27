"""Muestra (SOLO LECTURA) lo que la app del chofer dejó en la BD: presencia, posiciones recientes y eventos con client_id.

Uso (desde backend/mobile, con el túnel abierto):
    python scripts/ver_presencia.py                         # presencia de todos los choferes con fila
    python scripts/ver_presencia.py chofer.drv-eflow-14@demo.tms.local   # un chofer: presencia + posiciones + eventos
    python scripts/ver_presencia.py <correo> --minutos 30   # ventana de posiciones/eventos (por defecto 15)
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "local"))

from env import load_env  # noqa: E402

load_env()

from mobile_api import db  # noqa: E402

PRESENCE_SQL = """
SELECT u.email_or_name, d.id AS driver_id, dp.status, dp.last_event, dp.last_seen_at, dp.battery_pct, dp.device_id,
       round(extract(epoch FROM (now() - dp.last_seen_at)))::int AS age_s
FROM driver_presence dp
JOIN drivers d ON d.id = dp.driver_id
LEFT JOIN (SELECT id, coalesce(email, full_name) AS email_or_name FROM app_users) u ON u.id = d.app_user_id
{where}
ORDER BY dp.last_seen_at DESC
"""

DRIVER_SQL = """
SELECT d.id, d.full_name FROM drivers d JOIN app_users u ON u.id = d.app_user_id
WHERE lower(u.email) = %s OR u.auth_user_id IN (SELECT auth_user_id FROM auth_credentials WHERE email = %s)
"""

POSITIONS_SQL = """
SELECT p.route_id, count(*) AS n, min(p.recorded_at) AS first_at, max(p.recorded_at) AS last_at,
       count(DISTINCT p.client_id) AS distinct_ids, max(p.received_at) AS last_received
FROM tracking_positions p
WHERE p.driver_id = %s AND p.received_at >= now() - make_interval(mins => %s)
GROUP BY p.route_id
"""

EVENTS_SQL = """
SELECT e.event_type, e.event_time, e.client_id, e.dispatch_guide_id
FROM tracking_events e
JOIN routes r ON r.id = e.route_id
WHERE r.driver_id = %s AND e.event_time >= now() - make_interval(mins => %s)
ORDER BY e.event_time DESC LIMIT 15
"""


def show(title: str, rows: list[dict]) -> None:
    print(f"\n== {title} ({len(rows)})")
    for row in rows:
        print("  " + " | ".join(f"{k}={v}" for k, v in row.items()))


def main(argv: list[str]) -> int:
    minutes = int(argv[argv.index("--minutos") + 1]) if "--minutos" in argv else 15
    emails = [a.lower() for a in argv if "@" in a]
    if not emails:
        show("Presencia de choferes", db.query(PRESENCE_SQL.format(where=""), []))
        return 0
    for email in emails:
        drivers = db.query(DRIVER_SQL, [email, email])
        if not drivers:
            print(f"No hay un chofer enlazado a {email}")
            continue
        driver_id = str(drivers[0]["id"])
        print(f"\n##### {drivers[0]['full_name']} ({email})")
        show("Presencia", db.query(PRESENCE_SQL.format(where="WHERE d.id = %s"), [driver_id]))
        show(f"Posiciones recibidas en los últimos {minutes} min (distinct_ids = n → sin duplicados)",
             db.query(POSITIONS_SQL, [driver_id, minutes]))
        show(f"Eventos de sus viajes en los últimos {minutes} min", db.query(EVENTS_SQL, [driver_id, minutes]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
