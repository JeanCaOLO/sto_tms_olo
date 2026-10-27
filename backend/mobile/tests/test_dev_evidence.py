"""Almacén local de evidencias (solo desarrollo): URL firmada → subida multipart → confirmación real."""

import sys
import time
from pathlib import Path

import pytest

from conftest import APP_USER, DRIVER, GUIDE, ORDER, ORG, ROUTE, body_of

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "local"))
import dev_evidence  # noqa: E402
from mobile_api import evidence, routes  # noqa: E402

UPLOAD = f"POST /api/mobile/v1/paradas/{{id}}/evidencias/upload-url"
CONFIRM = f"POST /api/mobile/v1/paradas/{{id}}/evidencias"
BOUNDARY = "----test-boundary"
CONTENT_TYPE = f"multipart/form-data; boundary={BOUNDARY}"
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 2000


def multipart(fields: dict, file_bytes: bytes | None) -> bytes:
    out = b""
    for name, value in fields.items():
        out += f'--{BOUNDARY}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    if file_bytes is not None:
        out += (f'--{BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="x.jpg"\r\n'
                f"Content-Type: image/jpeg\r\n\r\n").encode() + file_bytes + b"\r\n"
    return out + f"--{BOUNDARY}--\r\n".encode()


@pytest.fixture
def local_store(monkeypatch, tmp_path):
    monkeypatch.setattr(evidence, "upload_url", evidence.upload_url)
    monkeypatch.setattr(evidence, "_head", evidence._head)
    monkeypatch.setitem(routes.PRIVATE, dev_evidence.UPLOAD_URL_KEY, routes.PRIVATE[dev_evidence.UPLOAD_URL_KEY])
    monkeypatch.setitem(routes.ROUTES, dev_evidence.UPLOAD_URL_KEY, routes.ROUTES[dev_evidence.UPLOAD_URL_KEY])
    monkeypatch.setattr(dev_evidence, "_directory", dev_evidence._directory)
    dev_evidence.install(tmp_path)
    return tmp_path


@pytest.fixture(autouse=True)
def own_stop(fake_db):
    """La parada pertenece al chofer del token (guide_access real, BD falsa)."""
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [{
        "id": GUIDE, "route_id": ROUTE, "organization_id": ORG, "order_id": ORDER, "delivery_status": "pending",
        "notes": None, "route_status": "En tránsito", "driver_id": DRIVER, "stop_lat": None, "stop_lng": None}])


def ask_form(call, headers=None, kind="photo_invoice", mime="image/jpeg"):
    response = call(UPLOAD, path={"id": GUIDE}, body={"kind": kind, "mime_type": mime}, headers=headers)
    assert response["statusCode"] == 200
    return body_of(response)["data"]


def test_form_points_at_the_origin_metro_forwarded(call, local_store):
    form = ask_form(call, headers={"Host": "127.0.0.1:4100", "X-Forwarded-Host": "172.16.11.43:8081"})
    assert form["url"] == "http://172.16.11.43:8081/api/mobile/v1/_dev/evidencias"
    assert form["key"].startswith(f"tracking/{ROUTE}/{GUIDE}/") and form["key"].endswith(".jpg")


def test_upload_then_confirm_stores_the_file_and_the_row(call, fake_db, local_store):
    form = ask_form(call)
    status, _ = dev_evidence.save_upload(CONTENT_TYPE, multipart(form["fields"], JPEG))
    assert status == 204
    assert (local_store / form["key"]).read_bytes() == JPEG

    fake_db.answer("INSERT INTO tracking_evidences", [{"id": "ev-1"}])
    body = {"kind": "photo_invoice", "key": form["key"], "client_id": "3a50537a-530b-4dbc-86ef-317e64ef413e"}
    response = call(CONFIRM, path={"id": GUIDE}, body=body)
    assert response["statusCode"] == 201, response["body"]
    inserted = fake_db.wrote("INSERT INTO tracking_evidences")[0][1]
    assert form["key"] in inserted and len(JPEG) in inserted and "image/jpeg" in inserted and APP_USER in inserted


def test_confirm_without_upload_is_rejected(call, fake_db, local_store):
    form = ask_form(call)
    response = call(CONFIRM, path={"id": GUIDE}, body={"kind": "photo_invoice", "key": form["key"]})
    assert response["statusCode"] == 400 and not fake_db.wrote("INSERT INTO tracking_evidences")


def test_upload_rejects_bad_signature_expired_form_and_big_or_missing_file(call, local_store):
    fields = ask_form(call)["fields"]
    assert dev_evidence.save_upload(CONTENT_TYPE, multipart({**fields, "signature": "0" * 64}, JPEG))[0] == 403
    assert dev_evidence.save_upload(CONTENT_TYPE, multipart({**fields, "key": fields["key"].replace("tracking", "x")}, JPEG))[0] == 403
    expired = int(time.time()) - 1
    old = {**fields, "expires": str(expired), "signature": dev_evidence._sign(fields["key"], "image/jpeg", expired)}
    assert dev_evidence.save_upload(CONTENT_TYPE, multipart(old, JPEG))[0] == 403
    assert dev_evidence.save_upload(CONTENT_TYPE, multipart(fields, b"0" * (5 * 1024 * 1024 + 1)))[0] == 400
    assert dev_evidence.save_upload(CONTENT_TYPE, multipart(fields, None))[0] == 400
    assert dev_evidence.save_upload("application/json", b"{}")[0] == 400
    assert not list(local_store.rglob("*.jpg"))
