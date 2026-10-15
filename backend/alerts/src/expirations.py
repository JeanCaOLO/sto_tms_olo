"""Vencimientos próximos o pasados: contratos de transportistas y licencias de conductores.

Una fila por documento que vence en los próximos WINDOW_DAYS días o que ya venció. Las fechas se
comparan contra el día de HOY en Costa Rica (la BD corre en UTC). Las licencias salen de
drivers.license_expiry y de driver_licenses (un conductor puede tener varias); se quitan duplicados.
"""

from datetime import date

WINDOW_DAYS = 30
TIME_ZONE = "America/Costa_Rica"
CONTRACT, LICENSE = "carrier_contract", "driver_license"
EXPIRED, DUE_SOON = "expired", "due_soon"

EXPIRATIONS_SQL = f"""
WITH today AS (SELECT (now() AT TIME ZONE '{TIME_ZONE}')::date AS d),
items AS (
  SELECT '{CONTRACT}' AS type, c.id AS entity_id, c.name, c.code, c.contract_expiry AS expiry_date,
         c.country_id, NULL::text AS carrier_name, NULL::text AS license_number
  FROM carriers c
  WHERE c.contract_expiry IS NOT NULL AND coalesce(c.status, 'active') <> 'inactive'
  UNION ALL
  SELECT '{LICENSE}', d.id, d.full_name, d.code, d.license_expiry, c.country_id, c.name, d.license_number
  FROM drivers d LEFT JOIN carriers c ON c.id = d.carrier_id
  WHERE d.license_expiry IS NOT NULL AND coalesce(d.status, 'active') <> 'inactive'
  UNION ALL
  SELECT '{LICENSE}', d.id, d.full_name, d.code, dl.expiry_date, c.country_id, c.name, dl.license_number
  FROM driver_licenses dl
  JOIN drivers d ON d.id = dl.driver_id
  LEFT JOIN carriers c ON c.id = d.carrier_id
  WHERE dl.expiry_date IS NOT NULL AND coalesce(d.status, 'active') <> 'inactive'
)
SELECT DISTINCT i.type, i.entity_id, i.name, i.code, i.expiry_date, i.country_id, i.carrier_name, i.license_number,
       (i.expiry_date - t.d) AS days_left
FROM items i CROSS JOIN today t
WHERE i.expiry_date <= t.d + %s::int
ORDER BY i.expiry_date, i.type, i.name
"""


def classify(row: dict) -> dict:
    """Fila de la BD -> alerta para la API y el correo."""
    days_left = int(row["days_left"])
    expiry = row["expiry_date"]
    return {
        "type": row["type"],
        "entity_id": str(row["entity_id"]),
        "name": row["name"],
        "code": row.get("code"),
        "carrier_name": row.get("carrier_name"),
        "license_number": row.get("license_number"),
        "country_id": str(row["country_id"]) if row.get("country_id") else None,
        "expiry_date": expiry.isoformat() if isinstance(expiry, date) else str(expiry),
        "days_left": days_left,
        "status": EXPIRED if days_left < 0 else DUE_SOON,
    }


def visible_to(alerts: list[dict], *, contracts: bool, licenses: bool, countries: tuple[str, ...] | None) -> list[dict]:
    """Lo que puede ver un usuario: por módulo (transportistas / conductores) y por país.
    countries=None = todos; una alerta sin país (p. ej. conductor sin transportista) se ve igual."""
    allowed_types = {CONTRACT} if contracts else set()
    if licenses:
        allowed_types.add(LICENSE)
    return [a for a in alerts
            if a["type"] in allowed_types
            and (countries is None or a["country_id"] is None or a["country_id"] in countries)]
