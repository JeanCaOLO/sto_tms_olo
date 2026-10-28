"""Acciones del chofer sobre una parada: transición (entregado/fallido/pendiente), novedades y devoluciones."""

import uuid
from datetime import datetime, timezone

from . import db, logic, sql
from .auth import Driver
from .errors import HttpError
from .http import body_dict, ok, path_param


def now() -> datetime:
    return datetime.now(timezone.utc)


def guide_access(driver: Driver, guide_id: str) -> dict:
    """Parada DEL conductor (misma organización y viaje suyo). Cualquier otra se trata como inexistente."""
    if not logic.is_uuid(guide_id):
        raise HttpError(404, "Parada no encontrada")
    rows = db.query(sql.GUIDE_ROW_SQL, [guide_id])
    if (not rows or str(rows[0]["organization_id"]) != driver.organization_id
            or str(rows[0]["driver_id"] or "") != driver.driver_id):
        raise HttpError(404, "Parada no encontrada")
    return rows[0]


def optional_client_id(body: dict) -> str | None:
    """`client_id` (UUID del teléfono) opcional: con él, reenviar la acción desde la cola offline no la duplica."""
    value = body.get("client_id")
    if value is not None and not logic.is_uuid(value):
        raise HttpError(400, "client_id inválido")
    return value.lower() if value else None


def add_event(run, driver: Driver, route_id, guide_id, event_type, event_status, notes, lat=None, lng=None,
              when=None, distance_m=None, client_id=None) -> bool:
    """Registra el evento; False si ya existía uno con ese `client_id` (reenvío)."""
    params = [driver.organization_id, route_id, guide_id, event_type, event_status, when or now(), lat, lng, notes,
              driver.app_user_id, distance_m]
    if client_id is None:
        run(sql.INSERT_EVENT_SQL, params)
        return True
    return bool(run(sql.INSERT_EVENT_ONCE_SQL, params + [client_id]))


def transition_stop(event: dict, driver: Driver) -> dict:
    guide_id = path_param(event, "id")
    body = body_dict(event)
    target = body.get("to")
    if target not in logic.GUIDE_STATUS_TEXT:
        raise HttpError(400, "to debe ser pending, delivered o failed")
    reason = (body.get("reason") or "").strip() or None
    reason_code = body.get("reason_code")
    if reason_code is not None and reason_code not in logic.FAR_REASON_CODES:
        raise HttpError(400, "reason_code no válido")
    if reason_code == "otro" and not reason:
        raise HttpError(400, "El motivo \"Otro\" requiere un texto")
    if reason_code and target == logic.GUIDE_DELIVERED:
        preset = logic.FAR_REASON_CODES[reason_code]
        reason = preset if not reason or reason == preset else f"{preset}: {reason}"
    if target == logic.GUIDE_FAILED and not reason:
        raise HttpError(400, "Una entrega fallida requiere un motivo")
    try:
        when = logic.parse_time(body["occurred_at"], "occurred_at") if body.get("occurred_at") else now()
    except ValueError as err:
        raise HttpError(400, str(err)) from None
    lat, lng = logic.coords(body)
    client_id = optional_client_id(body)
    guide = guide_access(driver, guide_id)
    if logic.route_state(guide["route_status"]) != "active":
        raise HttpError(409, "El viaje no está en tránsito.")
    route_id = str(guide["route_id"])
    receiver = (body.get("receiver_name") or "").strip() or None
    note = f"{guide['notes'] or ''}\nFallo: {reason}".strip() if reason and target == logic.GUIDE_FAILED else None

    # Geocerca: distancia del dispositivo al punto. Si la parada tiene coordenadas, "Entregado" exige estar a
    # ≤ 150 m, o un motivo (fuera de rango, o sin ubicación por GPS caído); con motivo queda además el evento `geofence_out` (el mismo que escribe la web).
    distance_m = None if target == logic.GUIDE_PENDING else logic.distance_to_stop_m(
        lat, lng, guide["stop_lat"], guide["stop_lng"])
    delivering = target == logic.GUIDE_DELIVERED
    outside = delivering and distance_m is not None and distance_m > logic.GEOFENCE_M
    unlocated = delivering and distance_m is None and guide["stop_lat"] is not None and guide["stop_lng"] is not None
    if outside and not reason:
        raise HttpError(400, f"Estás a {distance_m} m del punto de entrega (máximo {logic.GEOFENCE_M} m): "
                             "indica el motivo.", code="outside_geofence")
    if unlocated and not reason:
        raise HttpError(400, "No hay ubicación del dispositivo: envía lat/lng o indica el motivo.",
                        code="no_location")
    # Foto de la factura y firma son obligatorias para entregar: la app las sube antes de la transición (outbox en orden).
    if delivering and not set(logic.EVIDENCE_KINDS) <= set(guide.get("evidence_kinds") or []):
        raise HttpError(400, "Para marcar la entrega se requiere la foto de la factura y la firma.",
                        code="evidence_required")
    event_type = {"delivered": "delivery_completed", "failed": "delivery_failed", "pending": "stop_reverted"}[target]
    event_status = {"delivered": "success", "failed": "error", "pending": "info"}[target]

    def work(run):
        run(sql.UPDATE_GUIDE_SQL, [target, logic.GUIDE_STATUS_TEXT[target], None if target == "pending" else when,
                                   receiver, note, guide_id])
        counts = run(sql.COUNT_DONE_SQL, [route_id])[0]
        run(sql.SET_COMPLETED_STOPS_SQL, [int(counts["done"]), route_id])
        first_time = add_event(run, driver, route_id, guide_id, event_type, event_status, reason, lat, lng, when,
                               distance_m, client_id)
        if (outside or unlocated) and first_time:
            detail = f"fuera de la geocerca ({distance_m} m)" if outside else "sin ubicación del dispositivo"
            add_event(run, driver, route_id, guide_id, "geofence_out", "warning", f"Entrega {detail}: {reason}",
                      lat, lng, when)
        return {"stop_id": guide_id, "state": target, "done": int(counts["done"]),
                "pending": int(counts["pending"]), "distance_m": distance_m}

    return ok(db.run_in_transaction(work))


def add_incident(event: dict, driver: Driver) -> dict:
    guide_id = path_param(event, "id")
    body = body_dict(event)
    description = (body.get("description") or "").strip() if isinstance(body.get("description"), str) else ""
    if not description:
        raise HttpError(400, "La novedad requiere una descripción")
    kind = body.get("kind") or "incident"
    if kind not in ("incident", "pickup"):
        raise HttpError(400, "kind debe ser incident o pickup")
    lat, lng = logic.coords(body)
    client_id = optional_client_id(body)
    guide = guide_access(driver, guide_id)
    if logic.route_state(guide["route_status"]) != "active":
        raise HttpError(409, "El viaje no está en tránsito.")

    def work(run):
        return add_event(run, driver, guide["route_id"], guide_id, kind, "warning" if kind == "incident" else "info",
                         description, lat, lng, client_id=client_id)

    created = db.run_in_transaction(work)
    return ok({"stop_id": guide_id, "duplicate": not created}, 201 if created else 200)


def add_return(event: dict, driver: Driver) -> dict:
    """Devolución del chofer en la parada (alimenta `returns`, que la web del TMS ya lee). Idempotente por client_id."""
    guide_id = path_param(event, "id")
    body = body_dict(event)
    product = (body.get("product_name") or "").strip() if isinstance(body.get("product_name"), str) else ""
    reason = (body.get("reason") or "").strip() if isinstance(body.get("reason"), str) else ""
    if not product:
        raise HttpError(400, "La devolución requiere el producto")
    if not reason:
        raise HttpError(400, "La devolución requiere un motivo")
    quantity = body.get("quantity")
    if isinstance(quantity, bool) or not isinstance(quantity, int) or not 0 < quantity <= 100000:
        raise HttpError(400, "quantity debe ser un entero mayor que 0")
    client_id = body.get("client_id")
    if client_id is not None and not logic.is_uuid(client_id):
        raise HttpError(400, "client_id inválido")
    guide = guide_access(driver, guide_id)
    if logic.route_state(guide["route_status"]) != "active":
        raise HttpError(409, "El viaje no está en tránsito.")
    photo = body.get("photo_key")
    if photo is not None:
        photo = logic.require_evidence_key(guide, photo)
    code = (body.get("product_code") or "").strip() or None if isinstance(body.get("product_code"), str) else None
    notes = (body.get("notes") or "").strip() or None if isinstance(body.get("notes"), str) else None
    number = f"DV-{client_id or uuid.uuid4()}"   # reenviar la misma devolución no la duplica

    def work(run):
        created = run(sql.INSERT_RETURN_SQL, [driver.organization_id, guide_id, guide["order_id"], number, reason,
                                              code, product, quantity, photo, notes])
        if created:
            add_event(run, driver, guide["route_id"], guide_id, "return", "warning",
                      f"Devolución: {quantity} x {product} ({reason})")
        return {"return_id": str(created[0]["id"]) if created else None, "duplicate": not created}

    result = db.run_in_transaction(work)
    return ok(result, 200 if result["duplicate"] else 201)
