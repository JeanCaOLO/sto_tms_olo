"""Acciones del chofer sobre una parada: transición (entregado/fallido/pendiente), novedades y devoluciones."""

import uuid
from datetime import datetime, timezone

from . import db, logic, sql, collections
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
    if rows[0].get('stop_type') == 'collection':
        linked = db.query(collections.ASSIGNMENTS_SQL, [[guide_id],driver.organization_id])
        if linked:
            point = linked[0]['snapshot']
            rows[0]['stop_lat'],rows[0]['stop_lng'] = point['latitude'],point['longitude']
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
    if target == logic.GUIDE_PENDING:
        # El chofer no deshace entregas: solo la web de administración puede revertir una parada.
        raise HttpError(403, "El chofer no puede deshacer una entrega.", code="revert_not_allowed")
    if body.get("type") is not None and body["type"] not in logic.STOP_TYPES:
        raise HttpError(400, "type debe ser delivery o collection")
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
        # Reenvío de la última parada ya registrada: el viaje se cerró solo y la repetición no es un error.
        if (logic.route_state(guide["route_status"]) == "completed"
                and logic.guide_state(guide.get("delivery_status"), guide.get("status")) == target):
            if guide.get('stop_type') == 'collection':
                db.run_in_transaction(lambda run: collections.execute(run,driver,guide,body,target,when,replay_only=True))
            counts = db.query(sql.COUNT_DONE_SQL, [str(guide["route_id"])])[0]
            return ok({"stop_id": guide_id, "state": target, "done": int(counts["done"]),
                       "pending": int(counts["pending"]), "distance_m": None, "route_closed": True})
        raise HttpError(409, "El viaje no está en tránsito.")
    route_id = str(guide["route_id"])
    receiver = (body.get("receiver_name") or "").strip() or None
    note = f"{guide['notes'] or ''}\nFallo: {reason}".strip() if reason and target == logic.GUIDE_FAILED else None

    # Geocerca: distancia del dispositivo al punto. Si la parada tiene coordenadas, "Entregado" exige estar a
    # ≤ 150 m, o un motivo (fuera de rango, o sin ubicación por GPS caído); con motivo queda además el evento `geofence_out` (el mismo que escribe la web).
    distance_m = logic.distance_to_stop_m(lat, lng, guide["stop_lat"], guide["stop_lng"])
    delivering = target == logic.GUIDE_DELIVERED
    if delivering and (lat is None or lng is None):
        raise HttpError(400, "No se puede entregar sin la ubicación del dispositivo (lat/lng).",
                        code="location_required")
    outside = delivering and distance_m is not None and distance_m > logic.GEOFENCE_M
    if outside and not reason:
        raise HttpError(400, f"Estás a {distance_m} m del punto de entrega (máximo {logic.GEOFENCE_M} m): "
                             "indica el motivo.", code="outside_geofence")
    # Entrega: foto de la factura + firma. Recolecta: foto del producto + firma (de quien lo entrega). La app las sube
    # antes de la transición (outbox en orden). El tipo lo decide el servidor, no el cliente.
    kind_of_stop = logic.stop_type(guide.get("stop_type"))
    if delivering and not set(logic.REQUIRED_EVIDENCE[kind_of_stop]) <= set(guide.get("evidence_kinds") or []):
        raise HttpError(400, logic.EVIDENCE_REQUIRED_TEXT[kind_of_stop], code="evidence_required")
    event_type = {"delivered": "delivery_completed", "failed": "delivery_failed"}[target]
    event_status = {"delivered": "success", "failed": "error"}[target]

    def work(run):
        if kind_of_stop == 'collection':
            collections.execute(run,driver,guide,body,target,when)
        run(sql.UPDATE_GUIDE_SQL, [target, logic.GUIDE_STATUS_TEXT[target], when, receiver, note, guide_id])
        run(sql.COMPLETE_VISIT_SQL, [when, guide_id])   # separa «tiempo en el sitio» de «tiempo hasta cerrar»
        counts = run(sql.COUNT_DONE_SQL, [route_id])[0]
        run(sql.SET_COMPLETED_STOPS_SQL, [int(counts["done"]), route_id])
        first_time = add_event(run, driver, route_id, guide_id, event_type, event_status, reason, lat, lng, when,
                               distance_m, client_id)
        if outside and first_time:
            add_event(run, driver, route_id, guide_id, "geofence_out", "warning",
                      f"Entrega fuera de la geocerca ({distance_m} m): {reason}", lat, lng, when)
        closed = False
        # Última parada del viaje (entregada o no entregada): el viaje se cierra solo y pasa a Liquidaciones.
        if first_time and int(counts["pending"]) == 0 and not run(collections.UNDELIVERED_SQL,[route_id]):
            closed = bool(run(sql.CLOSE_ROUTE_SQL, [when, int(counts["done"]), route_id, logic.ACTIVE_STATUS_SQL_VALUES]))
            if closed:
                run(sql.CLOSE_PLAN_TRIP_SQL, [route_id])
                add_event(run, driver, route_id, None, "route_completed", "success",
                          "Viaje cerrado automáticamente al registrar la última parada.", lat, lng, when)
        return {"stop_id": guide_id, "state": target, "done": int(counts["done"]),
                "pending": int(counts["pending"]), "distance_m": distance_m, "route_closed": closed}

    return ok(db.run_in_transaction(work))


def deliver_collection(event: dict, driver: Driver) -> dict:
    guide = guide_access(driver,path_param(event,'id'))
    body = body_dict(event)
    try:
        when=logic.parse_time(body['occurred_at'],'occurred_at') if body.get('occurred_at') else now()
    except ValueError as error:
        raise HttpError(400,str(error)) from None
    def work(run):
        ids = collections.deliver(run,driver,guide,body,when)
        counts = run(sql.COUNT_DONE_SQL,[guide['route_id']])[0]
        closed = False
        if int(counts['pending'])==0 and not run(collections.UNDELIVERED_SQL,[guide['route_id']]):
            closed=bool(run(sql.CLOSE_ROUTE_SQL,[now(),int(counts['done']),guide['route_id'],logic.ACTIVE_STATUS_SQL_VALUES]))
            if closed:
                run(sql.CLOSE_PLAN_TRIP_SQL,[guide['route_id']])
                add_event(run,driver,guide['route_id'],None,'route_completed','success','Recolectas entregadas al almacén.')
        return {'return_ids':ids,'state':'pending','route_closed':closed}
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


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def return_items(body: dict) -> tuple[list[dict], bool]:
    """Líneas de la devolución validadas. `items: [{product_code?, product_name, quantity}]` (varios artículos de la
    parada) o, por compatibilidad, el payload plano de un solo producto. Devuelve (líneas, vino_como_items)."""
    raw = body.get("items")
    as_items = raw is not None
    if not as_items:
        raw = [{"product_name": body.get("product_name"), "product_code": body.get("product_code"),
                "quantity": body.get("quantity"),'order_item_id':body.get('order_item_id')}]
    if not isinstance(raw, list) or not 0 < len(raw) <= logic.MAX_RETURN_ITEMS:
        raise HttpError(400, f"items debe traer de 1 a {logic.MAX_RETURN_ITEMS} artículos")
    lines = []
    for item in raw:
        item = item if isinstance(item, dict) else {}
        code = _text(item.get("product_code")) or None
        name = _text(item.get("product_name"))
        if not name and not code:
            raise HttpError(400, "La devolución requiere el producto")
        quantity = item.get("quantity")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or not 0 < quantity <= 100000:
            raise HttpError(400, "quantity debe ser un entero mayor que 0")
        item_id = item.get('order_item_id')
        if item_id is not None and not logic.is_uuid(item_id):
            raise HttpError(400, 'order_item_id inválido')
        lines.append({"code": code, "name": name or code, "quantity": quantity,
                      'order_item_id': item_id.lower() if item_id else None})
    return lines, as_items


def list_items(event: dict, driver: Driver) -> dict:
    """Artículos del pedido de la parada, para elegirlos al registrar una devolución."""
    guide = guide_access(driver, path_param(event, "id"))
    if logic.route_state(guide["route_status"]) != "active":
        raise HttpError(409, "El viaje no está en tránsito.")
    rows = db.query(sql.RETURN_BALANCE_SQL, [driver.organization_id,guide['order_id']]) if guide.get('order_id') else []
    return ok({"stop_id": str(guide["id"]), "items": [
        {'order_item_id':str(r['id']),'presentation':r['presentation'],'remaining':max(0,int(r['remaining'])),
         "line_number": r["line_number"], "product_code": r["product_code"] or None,
         "product_name": r["product_name"] or r["product_code"], "quantity": int(r["quantity"] or 0)}
        for r in rows]})


def add_return(event: dict, driver: Driver) -> dict:
    """Devolución contracamión del chofer en la parada (alimenta `tbl_returns`, que la web de Devoluciones lee): una
    fila por artículo, con una sola foto (`photo_key` o `photo_client_id`) y motivo para todas. Idempotente por client_id (y número de línea)."""
    guide_id = path_param(event, "id")
    body = body_dict(event)
    reason = _text(body.get("reason"))
    if not reason:
        raise HttpError(400, "La devolución requiere un motivo")
    lines, as_items = return_items(body)
    client_id = body.get("client_id")
    if client_id is not None and not logic.is_uuid(client_id):
        raise HttpError(400, "client_id inválido")
    guide = guide_access(driver, guide_id)
    photo = body.get("photo_key")
    if photo is not None:
        photo = logic.require_evidence_key(guide, photo)
    photo_client_id = body.get("photo_client_id")
    if photo_client_id is not None:
        # La app sube la foto por el outbox ANTES de la devolución y la liga por su `client_id`: la llave la conoce el servidor.
        if photo is not None or not logic.is_uuid(photo_client_id):
            raise HttpError(400, "photo_client_id inválido")
        found = db.query(sql.RETURN_PHOTO_SQL, [guide_id, photo_client_id.lower()])
        if not found:
            raise HttpError(400, "La foto de la devolución aún no se confirmó")
        photo = found[0]["storage_key"]
    notes = _text(body.get("notes")) or None
    base = f"DV-{client_id or uuid.uuid4()}"   # reenviar la misma devolución no la duplica
    numbers = [f"{base}-{n}" if as_items else base for n in range(1, len(lines) + 1)]

    def replay(run):
        previous=run(sql.RETURN_REPLAY_SQL,[driver.organization_id,numbers])
        if not previous:
            return None
        incoming=dict(zip(numbers,lines))
        same=len(previous)==len(lines)
        for row in previous:
            line=incoming.get(row['return_number'])
            same=same and line is not None and (row['quantity'],row['reason'],row['photo_url'],row['notes'],row['product_name'],str(row['dispatch_guide_id'])) == (
                line['quantity'],reason,photo,notes,line['name'],guide_id)
            if not same:
                break
            if row['order_item_id'] is None:
                same=row['product_code']==line['code'] and line['order_item_id'] is None
            else:
                same=line['code'] in (None,row['product_code']) and line['order_item_id'] in (None,str(row['order_item_id']))
        if not same:
            raise HttpError(409,'client_id ya se usó con otro contenido o parada.')
        ids=[str(row['id']) for row in previous]
        return {'return_id':ids[0],'return_ids':ids,'duplicate':True}

    def work(run):
        previous=replay(run)
        if previous:
            return previous
        if logic.route_state(guide['route_status'])!='active':
            raise HttpError(409,'El viaje no está en tránsito.')
        if not guide.get('order_id') or not run(sql.RETURN_ORDER_LOCK_SQL, [guide['order_id'], driver.organization_id]):
            raise HttpError(422, 'La devolución requiere un pedido autorizado.')
        run(collections.ROUTE_LOCK_SQL,[guide['route_id'],driver.organization_id])
        previous=replay(run)
        if previous:
            return previous
        if logic.route_state(guide['route_status'])!='active':
            raise HttpError(409,'El viaje no está en tránsito.')
        balances = run(sql.RETURN_BALANCE_SQL, [driver.organization_id, guide['order_id']])
        totals = {}
        for line in lines:
            matches = [row for row in balances if
                       (str(row['id']) == line['order_item_id'] if line['order_item_id'] else
                        (row['product_code'] == line['code'] if line['code'] else row['product_name'] == line['name']))]
            if len(matches) != 1:
                raise HttpError(422, 'El producto debe identificar una sola línea del pedido; no se admiten artículos manuales.')
            row = matches[0]
            if line['code'] and line['code'] != row['product_code']:
                raise HttpError(422, 'El producto no corresponde a la línea del pedido.')
            line['order_item_id'] = str(row['id'])
            line['code'] = row['product_code']
            totals[line['order_item_id']] = totals.get(line['order_item_id'], 0) + line['quantity']
        by_id = {str(row['id']): row for row in balances}
        if any(total > by_id[key]['remaining'] for key, total in totals.items()):
            raise HttpError(409, 'La cantidad acumulada supera el saldo del pedido.')
        ids, duplicate = [], True
        for number, line in zip(numbers, lines):
            created = run(sql.INSERT_RETURN_SQL, [driver.organization_id, guide_id, guide["order_id"], number, reason,
                                                  line["code"], line["name"], line["quantity"], photo, notes, line['order_item_id']])
            if not created:
                raise HttpError(409,'La devolución cambió durante el registro; reintente con la misma clave.')
            if created:
                duplicate = False
                ids.append(str(created[0]["id"]))
        if not duplicate:
            summary = ", ".join(f"{line['quantity']} x {line['name']}" for line in lines)
            add_event(run, driver, guide["route_id"], guide_id, "return", "warning", f"Devolución: {summary} ({reason})")
        return {"return_id": ids[0] if ids else None, "return_ids": ids, "duplicate": duplicate}

    result = db.run_in_transaction(work)
    return ok(result, 200 if result["duplicate"] else 201)
