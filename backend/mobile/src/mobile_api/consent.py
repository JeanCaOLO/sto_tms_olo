"""POST /consentimiento-gps: el chofer acepta compartir su ubicación (una fila por usuario y versión del aviso)."""

from . import db, sql
from .auth import Driver
from .errors import HttpError
from .http import body_dict, ok


def record_consent(event: dict, driver: Driver) -> dict:
    body = body_dict(event)
    raw = body.get("version")
    version = raw.strip() if isinstance(raw, str) else ""
    if not version or len(version) > 40:
        raise HttpError(400, "version es obligatoria (máx. 40 caracteres)")
    device_id = body.get("device_id")[:100] if isinstance(body.get("device_id"), str) else None
    # En transacción para que el trigger de auditoría vea al chofer como actor.
    created = db.run_in_transaction(lambda run: run(sql.INSERT_CONSENT_SQL, [driver.organization_id, driver.app_user_id,
                                                                             version, device_id]))
    row = created or db.query(sql.CONSENT_SQL, [driver.app_user_id, version])
    consented = row[0]["consented_at"] if row else None
    return ok({"version": version, "consented_at": consented.isoformat() if consented else None,
               "duplicate": not created}, 201 if created else 200)
