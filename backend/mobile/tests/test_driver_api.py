from datetime import date, datetime, timedelta, timezone

import pytest

from conftest import (APP_USER, DRIVER, GUIDE, NOW, ORDER, ORG, OTHER_DRIVER, ROUTE, TRIP, body_of, driver_row, event)
from mobile_api import consent, db as db_module, evidence, logic, positions, routes, stops, trips

STOP_LAT, STOP_LNG = 9.9300, -84.0800
UUID1 = "44444444-4444-4444-8444-444444444444"
FOLDER = f"pedidos/PED-001/{ORDER}/"   # carpeta del pedido de guide_row() en el bucket de evidencias


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    for module in (trips, positions, stops, evidence):
        monkeypatch.setattr(module, "now", lambda: NOW)


def route_row(**over):
    base = {"id": ROUTE, "route_number": "VJ-1", "route_date": date(2026, 10, 16), "status": "En tránsito",
            "assigned_at": NOW - timedelta(days=2), "actual_start_time": NOW - timedelta(hours=1), "planned_end_time": None, "origin_lat": None,
            "origin_lng": None, "plate": "ABC123", "zone_name": "GAM", "last_lat": STOP_LAT, "last_lng": STOP_LNG,
            "last_position_at": NOW - timedelta(seconds=30)}
    base.update(over)
    return base


def guide_item(sequence=1, **over):
    base = {"id": f"2222222{sequence}-2222-4222-8222-222222222222", "route_id": ROUTE, "guide_number": f"VJ-1-{sequence}",
            "sequence_number": sequence, "status": "Pendiente", "delivery_status": "pending",
            "planned_arrival_time": NOW + timedelta(minutes=20 * sequence), "actual_arrival_time": None,
            "recipient_name": None, "order_number": f"P-{sequence}", "invoice_number": f"F-{sequence}",
            "total_items": 3, "total_weight": 5, "delivery_address": "Calle 1", "delivery_city": "San José",
            "latitude": STOP_LAT + 0.01 * sequence, "longitude": STOP_LNG, "customer_name": f"Cliente {sequence}",
            "customer_phone": "2222-0000", "evidence_kinds": []}
    base.update(over)
    return base


def guide_row(**over):
    base = {"id": GUIDE, "route_id": ROUTE, "organization_id": ORG, "order_id": ORDER, "order_number": "PED-001",
            "delivery_status": "pending",
            "notes": None, "route_status": "En tránsito", "driver_id": DRIVER, "stop_lat": None, "stop_lng": None,
            "evidence_kinds": ["photo_invoice", "signature"]}
    base.update(over)
    return base


def pos(**over):
    base = {"client_id": UUID1, "route_id": ROUTE, "lat": 9.93, "lng": -84.08, "recorded_at": "2026-10-16T14:59:00Z",
            "speed_mps": 10, "battery_pct": 80}
    base.update(over)
    return base


# --- mi-viaje ------------------------------------------------------------------------------------------------

def test_mi_viaje_lists_active_and_planned_trips_of_the_driver(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_row()])
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_item(1), guide_item(2, delivery_status="delivered")])
    fake_db.answer("FROM plan_trips pt", [{"plan_trip_id": TRIP, "plan_date": date(2026, 10, 16), "assigned_at": NOW, "delivery_zone": "GAM",
                                           "plate": "XYZ789", "driver_name": "Ana"}])
    fake_db.answer("FROM plan_stops ps JOIN orders o", [{
        "trip_id": TRIP, "stop_order": 1, "order_id": ORDER, "order_number": "P-9", "invoice_number": "F-9",
        "total_items": 3, "total_weight": 5, "delivery_address": "Calle 9", "delivery_city": "Heredia",
        "latitude": STOP_LAT, "longitude": STOP_LNG, "customer_name": "Cliente 9", "customer_phone": "2222-9999"}])
    result = body_of(call("GET /api/mobile/v1/mi-viaje"))["data"]["items"]
    assert [item["kind"] for item in result] == ["route"]      # solo el viaje actual
    route = result[0]
    assert route["route_id"] == ROUTE and route["phase"] == "en_ruta"
    assert route["progress"] == {"total": 2, "done": 1, "delivered": 1, "failed": 0, "remaining": 1, "percent": 50}
    assert route["driver_name"] and "origin" in route
    assert route["assigned_at"] is not None                  # fecha en que se le asignó el viaje
    assert route["next_stop_id"] == route["stops"][0]["id"] and route["stops"][0]["distance_m"] is not None
    assert route["stops"][0]["delay_min"] is not None and route["stops"][1]["state"] == "delivered"
    mine = [c for c in fake_db.calls if "r.driver_id = %s" in c[0]][0][1]
    assert mine[:2] == [ORG, DRIVER]                       # siempre por el conductor del token
    assert [c for c in fake_db.calls if "pt.driver_id = %s" in c[0]][0][1][:2] == [ORG, DRIVER]


def test_mi_viaje_empty_agenda(call):
    assert body_of(call("GET /api/mobile/v1/mi-viaje"))["data"] == {"items": []}


def test_trip_without_position_is_still_por_salir(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_row(last_lat=None, last_lng=None, last_position_at=None)])
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_item(1)])
    item = body_of(call("GET /api/mobile/v1/mi-viaje"))["data"]["items"][0]
    assert item["phase"] == "por_salir" and item["position"] is None and item["stops"][0]["distance_m"] is None


def test_mi_viaje_keeps_guides_and_trips_whose_order_or_store_is_missing(call, fake_db):
    """Un pedido o tienda faltante no debe ocultarle paradas ni el viaje al chofer: el TMS sí las cuenta."""
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_row(origin_lat=None, origin_lng=None)])
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_item(1, order_number=None, invoice_number=None, customer_name=None)])
    item = body_of(call("GET /api/mobile/v1/mi-viaje"))["data"]["items"][0]
    assert item["progress"]["total"] == 1 and item["stops"][0]["order_number"] is None
    sql = {c[0] for c in fake_db.calls}
    assert any("LEFT JOIN orders o ON o.id = g.order_id" in q for q in sql)
    assert any("LEFT JOIN stores s ON s.id = r.store_id" in q for q in sql)


def test_mi_viaje_and_unfinished_check_ignore_trips_closed_by_planning(call, fake_db):
    """Si Planificación completó/canceló el viaje, el chofer no lo ve activo ni queda bloqueado para iniciar otro."""
    call("GET /api/mobile/v1/mi-viaje")
    mine = [c[0] for c in fake_db.calls if "r.driver_id = %s" in c[0]][0]
    assert "pt.status NOT IN ('completed', 'cancelled')" in mine
    from mobile_api import sql
    assert "LEFT JOIN plan_trips pt" in sql.UNFINISHED_ROUTE_SQL
    assert "pt.status NOT IN ('completed', 'cancelled')" in sql.UNFINISHED_ROUTE_SQL


# --- aislamiento entre conductores ------------------------------------------------------------------------------

@pytest.mark.parametrize("route,body", [
    ("POST /api/mobile/v1/paradas/{id}/transicion", {"to": "delivered", "reason": "x"}),
    ("POST /api/mobile/v1/paradas/{id}/novedades", {"description": "x"}),
    ("POST /api/mobile/v1/paradas/{id}/devoluciones", {"product_name": "a", "reason": "b", "quantity": 1}),
    ("POST /api/mobile/v1/paradas/{id}/evidencias/upload-url", {"kind": "signature", "mime_type": "image/png"}),
    ("POST /api/mobile/v1/paradas/{id}/evidencias", {"kind": "signature", "key": "x"}),
])
def test_a_driver_cannot_touch_another_drivers_stop(call, fake_db, route, body):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(driver_id=OTHER_DRIVER)])
    assert call(route, path={"id": GUIDE}, body=body)["statusCode"] == 404
    assert not fake_db.wrote("UPDATE dispatch_guides") and not fake_db.wrote("INSERT INTO tracking_events")
    assert not fake_db.wrote("INSERT INTO returns") and not fake_db.wrote("INSERT INTO tracking_evidences")


def test_stop_of_another_organization_or_unknown_is_404(call, fake_db):
    route = "POST /api/mobile/v1/paradas/{id}/transicion"
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(organization_id="otra-org")])
    assert call(route, path={"id": GUIDE}, body={"to": "delivered"})["statusCode"] == 404
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [])
    assert call(route, path={"id": GUIDE}, body={"to": "delivered"})["statusCode"] == 404
    assert call(route, path={"id": "no-es-uuid"}, body={"to": "delivered"})["statusCode"] == 404


def test_positions_of_another_drivers_trip_are_rejected_and_not_written(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [])          # la consulta ya filtra por conductor
    result = body_of(call("POST /api/mobile/v1/posiciones", body={"positions": [pos()]}))["data"]
    assert result["accepted"] == 0 and result["rejected"][0]["reason"] == "viaje no encontrado"
    assert not fake_db.wrote("INSERT INTO tracking_positions") and not fake_db.wrote("INSERT INTO tracking_last_positions")
    assert [c for c in fake_db.calls if "driver_id = %s" in c[0] and "FROM routes r" in c[0]][0][1][:2] == [ORG, DRIVER]


# --- posiciones ------------------------------------------------------------------------------------------------------

def test_positions_reject_bad_dedupe_and_update_last_position(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [{"id": ROUTE, "status": "En tránsito", "vehicle_id": "v", "driver_id": DRIVER}])
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])
    body = {"device_id": "dev-1", "positions": [
        pos(), pos(client_id="66666666-6666-4666-8666-666666666666", lat=200),
        pos(client_id="77777777-7777-4777-8777-777777777777", route_id="99999999-9999-4999-8999-999999999999")]}
    result = body_of(call("POST /api/mobile/v1/posiciones", body=body))["data"]
    assert result["accepted"] == 1 and result["duplicates"] == 0
    assert {r["reason"] for r in result["rejected"]} == {"lat fuera de rango", "viaje no encontrado"}
    assert len(fake_db.wrote("INSERT INTO tracking_last_positions")) == 1


def test_positions_of_a_closed_trip_are_not_active(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [{"id": ROUTE, "status": "Completada", "vehicle_id": None, "driver_id": DRIVER}])
    result = body_of(call("POST /api/mobile/v1/posiciones", body={"positions": [pos()]}))["data"]
    assert result["accepted"] == 0 and result["rejected"][0]["reason"] == "viaje no activo"


POSITIONS = "POST /api/mobile/v1/posiciones"


def route_for_positions(**over):
    base = {"id": ROUTE, "status": "En tránsito", "vehicle_id": "v", "driver_id": DRIVER, "departed_at": None,
            "actual_end_time": None, "origin_lat": 9.93, "origin_lng": -84.08}
    base.update(over)
    return base


def test_first_position_far_from_origin_sets_departed_at_once(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions()])
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])
    call(POSITIONS, body={"positions": [pos(lat=9.99, lng=-84.08)]})        # ~6.6 km de la sede
    sets = fake_db.wrote("UPDATE routes SET departed_at")
    assert len(sets) == 1 and sets[0][1][1] == ROUTE


def test_position_near_origin_or_already_departed_does_not_set_departed_at(call, fake_db):
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions()])
    call(POSITIONS, body={"positions": [pos(lat=9.9301, lng=-84.0801)]})    # dentro de 300 m
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions(departed_at=NOW)])
    call(POSITIONS, body={"positions": [pos(lat=9.99)]})
    assert not fake_db.wrote("UPDATE routes SET departed_at")


def test_mock_or_inaccurate_points_are_stored_but_do_not_move_last_position_nor_depart(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions()])
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])
    call(POSITIONS, body={"positions": [pos(lat=9.99, is_mock=True)]})
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])
    call(POSITIONS, body={"positions": [pos(lat=9.99, accuracy_m=500)]})
    assert len(fake_db.wrote("INSERT INTO tracking_positions")) == 2
    assert not fake_db.wrote("INSERT INTO tracking_last_positions") and not fake_db.wrote("UPDATE routes SET departed_at")


def test_duplicate_points_do_not_touch_last_position(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions()])
    fake_db.answer("INSERT INTO tracking_positions", [])                    # ON CONFLICT DO NOTHING: ya existían
    result = body_of(call(POSITIONS, body={"positions": [pos()]}))["data"]
    assert result["accepted"] == 0 and result["duplicates"] == 1
    assert not fake_db.wrote("INSERT INTO tracking_last_positions")


def test_late_points_within_grace_are_stored_but_do_not_move_last_position(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions(
        status="Completada", actual_end_time=NOW - timedelta(minutes=30))])
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])
    result = body_of(call(POSITIONS, body={"positions": [pos()]}))["data"]
    assert result["accepted"] == 1
    assert not fake_db.wrote("INSERT INTO tracking_last_positions")
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions(
        status="Completada", actual_end_time=NOW - timedelta(hours=3))])
    assert body_of(call(POSITIONS, body={"positions": [pos()]}))["data"]["rejected"][0]["reason"] == "viaje no activo"


def test_position_writes_run_in_one_transaction(call, fake_db, monkeypatch):
    opened = []
    monkeypatch.setattr(db_module, "run_in_transaction", lambda work, retries=0: opened.append(1) or work(fake_db.run))
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_for_positions()])
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])
    call(POSITIONS, body={"positions": [pos()]})
    assert opened == [1]


def test_positions_batch_limits(call):
    route = "POST /api/mobile/v1/posiciones"
    assert call(route, body={"positions": []})["statusCode"] == 400
    assert call(route, body={"positions": [pos()] * 201})["statusCode"] == 400


# --- transición, geocerca ----------------------------------------------------------------------------------------------

TRANSITION = "POST /api/mobile/v1/paradas/{id}/transicion"


def delivered(call, **body):
    return call(TRANSITION, path={"id": GUIDE}, body={"to": "delivered", "receiver_name": "Luis", **body})


def stop_with_coords(fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(stop_lat=STOP_LAT, stop_lng=STOP_LNG)])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 2}])


def test_transition_updates_guide_counter_and_event_atomically(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 3, "pending": 1}])
    result = body_of(delivered(call))["data"]
    assert result == {"stop_id": GUIDE, "state": "delivered", "done": 3, "pending": 1, "distance_m": None,
                      "route_closed": False, "route_reopened": False}
    assert fake_db.wrote("UPDATE dispatch_guides")[0][1][:2] == ["delivered", "Entregado"]
    assert fake_db.wrote("UPDATE routes SET completed_stops")[0][1] == [3, ROUTE]
    event_params = fake_db.wrote("INSERT INTO tracking_events")[0][1]
    assert event_params[3] == "delivery_completed" and event_params[9] == APP_USER


def test_failed_needs_reason_and_records_it(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 0}])
    assert call(TRANSITION, path={"id": GUIDE}, body={"to": "failed"})["statusCode"] == 400
    assert call(TRANSITION, path={"id": GUIDE}, body={"to": "failed", "reason": "Local cerrado"})["statusCode"] == 200
    assert "Fallo: Local cerrado" in fake_db.wrote("UPDATE dispatch_guides")[0][1][4]


def test_transition_needs_an_active_trip(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(route_status="Completada")])
    assert delivered(call)["statusCode"] == 409


def test_invalid_target_and_time(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    assert call(TRANSITION, path={"id": GUIDE}, body={"to": "lost"})["statusCode"] == 400
    assert delivered(call, occurred_at="ayer")["statusCode"] == 400
    assert delivered(call, lat=999, lng=0)["statusCode"] == 400


def test_delivery_requires_invoice_photo_and_signature(call, fake_db):
    for kinds in ([], ["photo_invoice"], ["signature"]):
        fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(evidence_kinds=kinds)])
        response = delivered(call)
        assert response["statusCode"] == 400 and "evidence_required" in response["body"]
    assert not fake_db.wrote("UPDATE dispatch_guides")
    # No entregar y volver a pendiente no piden evidencias.
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(evidence_kinds=[])])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 2}])
    assert call(TRANSITION, path={"id": GUIDE}, body={"to": "failed", "reason": "Ausente"})["statusCode"] == 200


def test_delivery_within_geofence_stores_distance(call, fake_db):
    stop_with_coords(fake_db)
    result = body_of(delivered(call, lat=STOP_LAT + 0.0005, lng=STOP_LNG))["data"]       # ~55 m
    assert 40 <= result["distance_m"] <= 70
    events = fake_db.wrote("INSERT INTO tracking_events")
    assert len(events) == 1 and events[0][1][10] == result["distance_m"]


def test_delivery_far_from_stop_requires_reason(call, fake_db):
    stop_with_coords(fake_db)
    response = delivered(call, lat=STOP_LAT + 0.01, lng=STOP_LNG)                          # ~1,1 km
    assert response["statusCode"] == 400 and body_of(response)["error"]["code"] == "outside_geofence"
    assert not fake_db.wrote("UPDATE dispatch_guides")


def test_delivery_far_with_reason_is_saved_with_an_incident(call, fake_db):
    stop_with_coords(fake_db)
    response = delivered(call, lat=STOP_LAT + 0.01, lng=STOP_LNG, reason="No se podía estacionar")
    data = body_of(response)["data"]
    assert response["statusCode"] == 200 and data["distance_m"] > logic.GEOFENCE_M
    events = fake_db.wrote("INSERT INTO tracking_events")
    assert [e[1][3] for e in events] == ["delivery_completed", "geofence_out"]
    assert "No se podía estacionar" in events[1][1][8] and events[0][1][10] == data["distance_m"]
    assert "Fallo" not in (fake_db.wrote("UPDATE dispatch_guides")[0][1][4] or "")


def test_delivery_without_device_location_needs_a_reason(call, fake_db):
    stop_with_coords(fake_db)
    response = delivered(call)
    assert response["statusCode"] == 400 and body_of(response)["error"]["code"] == "no_location"
    assert not fake_db.wrote("UPDATE dispatch_guides")
    ok = delivered(call, reason="GPS apagado")
    assert ok["statusCode"] == 200 and body_of(ok)["data"]["distance_m"] is None
    events = fake_db.wrote("INSERT INTO tracking_events")
    assert [e[1][3] for e in events] == ["delivery_completed", "geofence_out"] and "sin ubicación" in events[1][1][8]


def test_stop_without_coordinates_has_nothing_to_measure(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 2}])
    assert delivered(call)["statusCode"] == 200
    assert delivered(call, lat=9.0, lng=-84.0)["statusCode"] == 200
    assert len(fake_db.wrote("INSERT INTO tracking_events")) == 2                             # sin incidentes


def test_revert_records_stop_reverted_without_distance(call, fake_db):
    stop_with_coords(fake_db)
    result = body_of(call(TRANSITION, path={"id": GUIDE}, body={"to": "pending", "lat": 0, "lng": 0}))["data"]
    assert result["state"] == "pending" and result["distance_m"] is None
    assert fake_db.wrote("INSERT INTO tracking_events")[0][1][3] == "stop_reverted"


# --- novedades, devoluciones -------------------------------------------------------------------------------------------

def test_incident_accepts_pickup_and_rejects_other_kinds(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    route = "POST /api/mobile/v1/paradas/{id}/novedades"
    assert call(route, path={"id": GUIDE}, body={})["statusCode"] == 400
    assert call(route, path={"id": GUIDE}, body={"description": "x", "kind": "otro"})["statusCode"] == 400
    ok = call(route, path={"id": GUIDE}, body={"description": "Recolecta de envases", "kind": "pickup"})
    assert ok["statusCode"] == 201 and fake_db.wrote("INSERT INTO tracking_events")[0][1][3] == "pickup"


def test_return_requires_fields_and_active_trip(call, fake_db):
    route = "POST /api/mobile/v1/paradas/{id}/devoluciones"
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    for body in [{"reason": "x", "quantity": 1}, {"product_name": "a", "quantity": 1},
                 {"product_name": "a", "reason": "x", "quantity": 0}, {"product_name": "a", "reason": "x", "quantity": "2"},
                 {"product_name": "a", "reason": "x", "quantity": 1, "client_id": "no-uuid"},
                 {"product_name": "a", "reason": "x", "quantity": 1, "photo_key": "tracking/otra/llave.jpg"}]:
        assert call(route, path={"id": GUIDE}, body=body)["statusCode"] == 400, body
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(route_status="Completada")])
    assert call(route, path={"id": GUIDE}, body={"product_name": "a", "reason": "x", "quantity": 1})["statusCode"] == 409
    assert not fake_db.wrote("INSERT INTO returns")


def test_return_is_inserted_with_guide_and_order_and_is_idempotent(call, fake_db):
    route = "POST /api/mobile/v1/paradas/{id}/devoluciones"
    client_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    body = {"product_name": "Pintura 4L", "quantity": 2, "reason": "Empaque dañado", "client_id": client_id}
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("INSERT INTO returns", [{"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}])
    first = call(route, path={"id": GUIDE}, body=body)
    assert first["statusCode"] == 201 and body_of(first)["data"]["duplicate"] is False
    params = fake_db.wrote("INSERT INTO returns")[0][1]
    assert params[:4] == [ORG, GUIDE, ORDER, f"DV-{client_id}"] and params[6] == "Pintura 4L" and params[7] == 2
    assert fake_db.wrote("INSERT INTO tracking_events")[0][1][3] == "return"
    fake_db.answer("INSERT INTO returns", [])
    again = call(route, path={"id": GUIDE}, body=body)
    assert again["statusCode"] == 200 and body_of(again)["data"]["duplicate"] is True
    assert len(fake_db.wrote("INSERT INTO tracking_events")) == 1


# --- consentimiento --------------------------------------------------------------------------------------------------

def test_consent_is_idempotent_per_version(call, fake_db):
    route = "POST /api/mobile/v1/consentimiento-gps"
    assert call(route, body={})["statusCode"] == 400
    fake_db.answer("INSERT INTO tracking_consents", [{"consented_at": NOW}])
    first = call(route, body={"version": "2026-10", "device_id": "dev-1"})
    assert first["statusCode"] == 201 and body_of(first)["data"]["duplicate"] is False
    assert fake_db.wrote("INSERT INTO tracking_consents")[0][1] == [ORG, APP_USER, "2026-10", "dev-1"]
    fake_db.answer("INSERT INTO tracking_consents", [])
    fake_db.answer("FROM tracking_consents WHERE", [{"consented_at": NOW}])
    again = call(route, body={"version": "2026-10"})
    assert again["statusCode"] == 200 and body_of(again)["data"]["duplicate"] is True


# --- evidencias -----------------------------------------------------------------------------------------------------

class FakeS3:
    def __init__(self, head=None):
        self.head, self.posts = head, []

    def generate_presigned_post(self, bucket, key, **kw):
        self.posts.append((bucket, key, kw))
        return {"url": f"https://s3/{bucket}", "fields": {"key": key}}

    def head_object(self, Bucket, Key):
        if self.head is None:
            error = Exception("nf")
            error.response = {"Error": {"Code": "404"}}
            raise error
        return self.head


@pytest.fixture
def s3(monkeypatch):
    fake = FakeS3({"ContentType": "image/jpeg", "ContentLength": 1000})
    monkeypatch.setattr(evidence, "s3", lambda: fake)
    return fake


def test_upload_url_signs_only_small_images_for_own_stop(call, fake_db, s3):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    route = "POST /api/mobile/v1/paradas/{id}/evidencias/upload-url"
    data = body_of(call(route, path={"id": GUIDE}, body={"kind": "photo_invoice", "mime_type": "image/jpeg"}))["data"]
    assert data["key"].startswith(f"{FOLDER}photo_invoice-") and data["key"].endswith(".jpg")
    bucket, key, kw = s3.posts[0]
    assert bucket == "bucket-de-prueba" and ["content-length-range", 1, logic.MAX_EVIDENCE_BYTES] in kw["Conditions"]
    # El objeto lleva de qué pedido y parada es, y la política firmada lo exige tal cual.
    assert kw["Fields"]["x-amz-meta-pedido"] == "PED-001" and kw["Fields"]["x-amz-meta-pedido-id"] == ORDER
    assert {"x-amz-meta-parada-id": GUIDE} in kw["Conditions"]
    assert call(route, path={"id": GUIDE}, body={"kind": "video", "mime_type": "image/png"})["statusCode"] == 400
    assert call(route, path={"id": GUIDE}, body={"kind": "signature", "mime_type": "application/pdf"})["statusCode"] == 400


def test_upload_url_with_client_id_gives_the_same_key_on_every_retry(call, fake_db, s3):
    """Reintentar la subida (timeout, URL vencida) sobrescribe el mismo objeto: no quedan huérfanos en S3."""
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    route = "POST /api/mobile/v1/paradas/{id}/evidencias/upload-url"
    body = {"kind": "signature", "mime_type": "image/png", "client_id": UUID1.upper()}
    first = body_of(call(route, path={"id": GUIDE}, body=body))["data"]["key"]
    again = body_of(call(route, path={"id": GUIDE}, body=body))["data"]["key"]
    assert first == again == f"{FOLDER}signature-{UUID1}.png"
    assert logic.require_evidence_key(guide_row(), first, "signature") == first  # y el servidor la reconoce al confirmar
    other = body_of(call(route, path={"id": GUIDE}, body={**body, "client_id": "55555555-5555-4555-8555-555555555555"}))
    assert other["data"]["key"] != first
    anonymous = body_of(call(route, path={"id": GUIDE}, body={"kind": "signature", "mime_type": "image/png"}))
    assert anonymous["data"]["key"] != body_of(call(route, path={"id": GUIDE}, body={"kind": "signature", "mime_type": "image/png"}))["data"]["key"]
    assert call(route, path={"id": GUIDE}, body={**body, "client_id": "no-uuid"})["statusCode"] == 400


def test_confirm_stores_key_and_links_the_guide(call, fake_db, s3):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("INSERT INTO tracking_evidences", [{"id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc"}])
    key = f"{FOLDER}signature-{'a' * 8}-aaaa-4aaa-8aaa-{'a' * 12}.jpg"
    route = "POST /api/mobile/v1/paradas/{id}/evidencias"
    response = call(route, path={"id": GUIDE}, body={"kind": "signature", "key": key, "client_id": UUID1})
    assert response["statusCode"] == 201 and body_of(response)["data"]["duplicate"] is False
    assert fake_db.wrote("UPDATE dispatch_guides SET signature_url")[0][1] == [key, GUIDE]
    assert not fake_db.wrote("UPDATE dispatch_guides SET photo_url")
    # La fila identifica el pedido (id y número) y el bucket donde quedó el archivo.
    inserted = fake_db.wrote("INSERT INTO tracking_evidences")[0][1]
    assert inserted[-3:] == [ORDER, "PED-001", "bucket-de-prueba"]
    photo = key.replace("signature-", "photo_invoice-")
    call(route, path={"id": GUIDE}, body={"kind": "photo_invoice", "key": photo})
    assert fake_db.wrote("UPDATE dispatch_guides SET photo_url")[0][1] == [photo, GUIDE]
    # Una firma no se puede confirmar como foto de factura (ni al revés).
    assert call(route, path={"id": GUIDE}, body={"kind": "photo_invoice", "key": key})["statusCode"] == 400


def test_confirm_rejects_foreign_key_missing_upload_and_big_files(call, fake_db, s3):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    route = "POST /api/mobile/v1/paradas/{id}/evidencias"
    foreign = f"pedidos/OTRO-002/99999999-9999-4999-8999-999999999999/signature-{'a' * 36}.jpg"
    assert call(route, path={"id": GUIDE}, body={"kind": "signature", "key": foreign})["statusCode"] == 400
    old_format = f"tracking/{ROUTE}/{GUIDE}/{'a' * 36}.jpg"
    assert call(route, path={"id": GUIDE}, body={"kind": "signature", "key": old_format})["statusCode"] == 400
    key = f"{FOLDER}signature-{'a' * 36}.jpg"
    s3.head = None
    assert call(route, path={"id": GUIDE}, body={"kind": "signature", "key": key})["statusCode"] == 400
    s3.head = {"ContentType": "image/jpeg", "ContentLength": 6 * 1024 * 1024}
    assert call(route, path={"id": GUIDE}, body={"kind": "signature", "key": key})["statusCode"] == 400
    s3.head = {"ContentType": "application/pdf", "ContentLength": 10}
    assert call(route, path={"id": GUIDE}, body={"kind": "signature", "key": key})["statusCode"] == 400
    assert not fake_db.wrote("INSERT INTO tracking_evidences")


# --- ejecución general -----------------------------------------------------------------------------------------------

def test_writes_set_the_audit_actor_local_to_the_transaction(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 0}])
    delivered(call)
    actors = [(sql, params) for sql, params in fake_db.calls if "set_config" in sql]
    # Una sola vez, LOCAL (true): se borra con el COMMIT, sin un viaje extra para limpiarlo.
    assert len(actors) == 1 and actors[0][0].endswith("%s, true)") and '"auth_user_id"' in actors[0][1][0]
    first_write = next(i for i, (sql, _) in enumerate(fake_db.calls) if sql.startswith("UPDATE"))
    assert fake_db.calls.index(actors[0]) < first_write
    from mobile_api import db
    assert db._actor is None


def test_reads_do_not_bind_an_actor(call, fake_db):
    call("GET /api/mobile/v1/mi-viaje")
    assert not [c for c in fake_db.calls if "set_config" in c[0]]


def test_unknown_route_is_404_and_internal_errors_do_not_leak(call, fake_db, monkeypatch):
    assert call("GET /api/mobile/v1/nada")["statusCode"] == 404

    def boom(*a, **k):
        raise RuntimeError("secreto interno de la BD")

    monkeypatch.setitem(routes.PRIVATE, "GET /api/mobile/v1/mi-viaje", boom)
    response = call("GET /api/mobile/v1/mi-viaje")
    assert response["statusCode"] == 500 and "secreto" not in response["body"]


def test_distance_is_symmetric_and_none_without_coordinates():
    assert logic.distance_to_stop_m(None, 1, 2, 3) is None
    a = logic.distance_to_stop_m(9.93, -84.08, 9.94, -84.08)
    assert a == logic.distance_to_stop_m(9.94, -84.08, 9.93, -84.08) and 1000 < a < 1200


def test_aws_proxy_event_is_resolved_to_the_real_route_and_path_params():
    """En AWS llega `ANY /api/mobile/v1/{proxy+}`: la ruta y el {id} salen de método + rawPath."""
    aws = {"routeKey": "ANY /api/mobile/v1/{proxy+}", "pathParameters": {"proxy": "paradas/abc-1/transicion"},
           "rawPath": "/api/mobile/v1/paradas/abc-1/transicion", "requestContext": {"http": {"method": "POST"}}}
    resolved = routes.resolve(aws)
    assert resolved["routeKey"] == "POST /api/mobile/v1/paradas/{id}/transicion"
    assert resolved["pathParameters"] == {"id": "abc-1"}
    plain = {"routeKey": "ANY /api/mobile/v1/{proxy+}", "rawPath": "/api/mobile/v1/mi-viaje/",
             "requestContext": {"http": {"method": "GET"}}}
    assert routes.resolve(plain)["routeKey"] == "GET /api/mobile/v1/mi-viaje"
    unknown = {"routeKey": "ANY /api/mobile/v1/{proxy+}", "rawPath": "/api/mobile/v1/otra", "requestContext": {"http": {"method": "GET"}}}
    assert routes.resolve(unknown) is unknown


def test_incident_on_a_closed_route_is_409(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(route_status="Completada")])
    response = call("POST /api/mobile/v1/paradas/{id}/novedades", path={"id": GUIDE}, body={"description": "tarde"})
    assert response["statusCode"] == 409
    assert not fake_db.wrote("INSERT INTO route_events")


def test_mi_viaje_returns_only_todays_plan_and_planned_filter_is_today(call, fake_db):
    fake_db.answer("FROM plan_trips pt", [
        {"plan_trip_id": TRIP, "plan_date": date(2026, 10, 16), "assigned_at": NOW, "delivery_zone": "GAM", "plate": "A", "driver_name": "Ana"},
        {"plan_trip_id": "other", "plan_date": date(2026, 10, 16), "assigned_at": NOW, "delivery_zone": "GAM", "plate": "B", "driver_name": "Ana"}])
    fake_db.answer("FROM plan_stops ps JOIN orders o", [
        {"trip_id": tid, "stop_order": 1, "order_id": ORDER, "order_number": "P", "invoice_number": "F", "total_items": 1,
         "total_weight": 1, "delivery_address": "x", "delivery_city": "y", "latitude": STOP_LAT, "longitude": STOP_LNG,
         "customer_name": "c", "customer_phone": None} for tid in (TRIP, "other")])
    items = body_of(call("GET /api/mobile/v1/mi-viaje"))["data"]["items"]
    assert [i["id"] for i in items] == [TRIP] and items[0]["progress"]["remaining"] == 1
    planned_query = [c for c in fake_db.calls if "pt.driver_id = %s" in c[0]][0]
    assert "rp.plan_date = (now() AT TIME ZONE coalesce(co.timezone" in planned_query[0]   # "hoy" según el país
    routes_query = [c for c in fake_db.calls if "r.driver_id = %s" in c[0]][0]
    assert "route_date" not in routes_query[0].split("WHERE")[1]    # el viaje abierto se ve hasta cerrarlo, sea cual sea su fecha


def test_far_delivery_accepts_preset_reason_code(call, fake_db):
    stop_with_coords(fake_db)
    response = delivered(call, lat=STOP_LAT + 0.01, lng=STOP_LNG, reason_code="acceso_bloqueado")
    assert response["statusCode"] == 200
    assert any("Acceso bloqueado" in str(c[1]) for c in fake_db.calls)      # el texto del motivo queda en el evento


def test_reason_code_otro_needs_text_and_unknown_code_rejected(call):
    assert delivered(call, reason_code="otro")["statusCode"] == 400
    assert delivered(call, reason_code="inventado")["statusCode"] == 400


def test_mi_viaje_hides_next_trips_until_current_is_fully_done(call, fake_db):
    first = route_row(id="r-a", route_number="VJ-A")
    second = route_row(id="r-b", route_number="VJ-B")
    fake_db.answer("FROM routes r LEFT JOIN stores s", [first, second])
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [
        {**guide_item(1), "route_id": "r-a"}, {**guide_item(2, delivery_status="delivered"), "route_id": "r-a"},
        {**guide_item(3), "route_id": "r-b"}])
    items = body_of(call("GET /api/mobile/v1/mi-viaje"))["data"]["items"]
    assert [i["route_number"] for i in items] == ["VJ-A"]            # VJ-B oculto: a VJ-A le falta una parada


def test_mi_viaje_shows_next_trip_once_current_is_done(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_row(id="r-a", route_number="VJ-A"), route_row(id="r-b", route_number="VJ-B")])
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [
        {**guide_item(1, delivery_status="delivered"), "route_id": "r-a"},
        {**guide_item(2, delivery_status="failed"), "route_id": "r-a"}, {**guide_item(3), "route_id": "r-b"}])
    items = body_of(call("GET /api/mobile/v1/mi-viaje"))["data"]["items"]
    assert [i["route_number"] for i in items] == ["VJ-B"]


def test_mi_viaje_all_done_keeps_last_trip_summary(call, fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [route_row(id="r-a", route_number="VJ-A")])
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [{**guide_item(1, delivery_status="delivered"), "route_id": "r-a"}])
    items = body_of(call("GET /api/mobile/v1/mi-viaje"))["data"]["items"]
    assert [i["route_number"] for i in items] == ["VJ-A"] and items[0]["progress"]["remaining"] == 0


# --- cierre automático del viaje ------------------------------------------------------------------------------

def test_last_stop_closes_the_trip_and_sends_it_to_liquidaciones(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 5, "pending": 0}])
    fake_db.answer("UPDATE routes SET status = 'Completada'", [{"id": ROUTE}])
    result = body_of(delivered(call))["data"]
    assert result["route_closed"] is True and result["pending"] == 0
    close = fake_db.wrote("UPDATE routes SET status = 'Completada'")
    assert close and close[0][1][1] == 5 and close[0][1][2] == ROUTE           # estado Completada, 5 paradas hechas
    assert fake_db.wrote("UPDATE plan_trips SET status = 'completed'")          # y su viaje planificado
    assert [c for c in fake_db.wrote("INSERT INTO tracking_events") if c[1][3] == "route_completed"]


def test_a_failed_last_stop_also_closes_the_trip(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row()])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 2, "pending": 0}])
    fake_db.answer("UPDATE routes SET status = 'Completada'", [{"id": ROUTE}])
    result = body_of(call(TRANSITION, path={"id": GUIDE}, body={"to": "failed", "reason": "Cliente ausente"}))["data"]
    assert result["route_closed"] is True


def test_trip_stays_open_while_stops_are_pending(call, fake_db):
    stop_with_coords(fake_db)
    result = body_of(delivered(call, lat=STOP_LAT, lng=STOP_LNG))["data"]
    assert result["route_closed"] is False and not fake_db.wrote("UPDATE routes SET status = 'Completada'")


def test_resending_the_last_stop_after_the_trip_closed_is_not_an_error(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(route_status="Completada", delivery_status="delivered")])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 5, "pending": 0}])
    response = delivered(call)
    assert response["statusCode"] == 200 and body_of(response)["data"]["route_closed"] is True


def test_a_closed_trip_still_rejects_a_different_change(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [guide_row(route_status="Completada", delivery_status="delivered")])
    assert call(TRANSITION, path={"id": GUIDE}, body={"to": "pending"})["statusCode"] == 409


# --- deshacer el cierre (ventana corta) -----------------------------------------------------------------------

def closed_guide(minutes_ago=3, **over):
    return guide_row(route_status="Completada", delivery_status="delivered", route_ended_at=NOW - timedelta(minutes=minutes_ago), **over)


def test_driver_can_undo_the_last_stop_inside_the_window_and_the_trip_reopens(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [closed_guide()])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 4, "pending": 1}])
    fake_db.answer("UPDATE routes SET status = 'En tránsito'", [{"id": ROUTE}])
    response = call(TRANSITION, path={"id": GUIDE}, body={"to": "pending"})
    assert response["statusCode"] == 200 and body_of(response)["data"]["route_reopened"] is True
    assert fake_db.wrote("UPDATE plan_trips SET status = 'pending'")
    assert [c for c in fake_db.wrote("INSERT INTO tracking_events") if c[1][3] == "route_reopened"]


def test_undo_after_the_window_is_rejected(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [closed_guide(minutes_ago=11)])
    response = call(TRANSITION, path={"id": GUIDE}, body={"to": "pending"})
    assert response["statusCode"] == 409 and body_of(response)["error"]["code"] == "reopen_expired"
    assert not fake_db.wrote("UPDATE routes SET status = 'En tránsito'")


def test_a_settled_trip_cannot_be_reopened(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [closed_guide(settlements=1)])
    response = call(TRANSITION, path={"id": GUIDE}, body={"to": "pending"})
    assert response["statusCode"] == 409 and body_of(response)["error"]["code"] == "already_settled"
