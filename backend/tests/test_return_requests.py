"""Solicitudes de devolución del cliente (backend/admin/src/admin_return_requests.py)."""

from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common import pg

USER = {"id": "auth-1", "email": "cliente@epa.com"}
ORG, CUSTOMER = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
UUID_A, UUID_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
KEY_A = f"solicitudes/{ORG}/{CUSTOMER}/{UUID_A}.jpg"
KEY_B = f"solicitudes/{ORG}/{CUSTOMER}/{UUID_B}.mp4"
CLIENT = make_permissions({"devoluciones_solicitud": ["view", "create"]})
VIEWER = make_permissions({"devoluciones_solicitud": ["view"]})
UPLOAD_ROUTE = "POST /api/v1/solicitudes-devolucion/archivos/url"


class FakeDb:
    def __init__(self):
        self.calls: list[tuple[str, list]] = []
        self.customer_id: str | None = CUSTOMER

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if "SELECT organization_id, customer_id FROM tbl_app_users" in sql:
            return [{"organization_id": ORG, "customer_id": self.customer_id}]
        if "AS next FROM tbl_return_requests" in sql.replace("\n", " "):
            return [{"next": 7}]
        if sql.lstrip().startswith("INSERT INTO tbl_return_requests"):
            return [{"id": "req-1", "request_number": params[3], "status": "pendiente_asignacion"}]
        if sql.lstrip().startswith("INSERT INTO tbl_return_request_items"):
            return [{"id": f"item-{params[1]}"}]
        if "FROM tbl_return_requests r" in sql:
            return [{"id": "req-1", "request_number": "SOL-2026-11-0001", "items": 1}]
        return []

    @contextmanager
    def transaction(self):
        yield self.query


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(pg, "query", fake.query)
    monkeypatch.setattr(pg, "transaction", fake.transaction)
    return fake


@pytest.fixture
def app(db, monkeypatch):
    load_stack_module("admin")
    module = load_stack_module("admin", "admin_return_requests")
    heads = {KEY_A: {"ContentType": "image/jpeg", "ContentLength": 1000},
             KEY_B: {"ContentType": "video/mp4", "ContentLength": 20 * 1024 * 1024}}
    monkeypatch.setattr(module, "_head", lambda key: heads.get(key))
    return load_stack_module("admin")


def item(**extra):
    return {"product_code": "ART-1", "quantity": 2, "reason_code": "danado", **extra}


def post(app, body, route="POST /api/v1/solicitudes-devolucion"):
    return app.handler(http_event(route, body=body, user=USER), None)


def test_cliente_crea_solicitud_con_foto_y_video(app, db, caller_permissions, audit_calls):
    caller_permissions.set(CLIENT)
    response = post(app, {"items": [item(files=[{"key": KEY_A}, {"key": KEY_B}], description="roto")]})
    assert response["statusCode"] == 201
    data = body_of(response)["data"]
    assert data["request_number"].startswith("SOL-") and data["request_number"].endswith("-0007")
    insert = next(p for s, p in db.calls if s.lstrip().startswith("INSERT INTO tbl_return_requests"))
    assert insert[:3] == [ORG, CUSTOMER, "app-user"]
    files = [p for s, p in db.calls if "INSERT INTO tbl_return_request_files" in s]
    assert [(f[1], f[2]) for f in files] == [(KEY_A, "photo"), (KEY_B, "video")]
    assert any(c[0] == "record" for c in audit_calls)


def test_organizacion_y_empresa_salen_del_usuario_no_del_cuerpo(app, db, caller_permissions):
    caller_permissions.set(CLIENT)
    post(app, {"organization_id": "x", "customer_id": "y", "items": [item()]})
    insert = next(p for s, p in db.calls if s.lstrip().startswith("INSERT INTO tbl_return_requests"))
    assert insert[:2] == [ORG, CUSTOMER]


def test_sin_permiso_create_es_403(app, caller_permissions):
    caller_permissions.set(VIEWER)
    assert post(app, {"items": [item()]})["statusCode"] == 403
    caller_permissions.set(make_permissions({"devoluciones": ["view", "edit"]}))
    assert post(app, {"items": [item()]})["statusCode"] == 403


def test_usuario_sin_empresa_es_403(app, db, caller_permissions):
    caller_permissions.set(CLIENT)
    db.customer_id = None
    assert post(app, {"items": [item()]})["statusCode"] == 403


@pytest.mark.parametrize("items", [
    [], None, [item(quantity=0)], [item(quantity=-1)], [item(quantity="3")], [item(quantity=True)],
    [item(quantity=1.5)], [item(reason_code="inventado")], [item(product_code="  ")],
    [item(reason_code="otro")], [item(reason_code="otro", description="  ")], [item(description="x" * 501)],
    [item(files=[{"key": KEY_A}] * 2)], [{"quantity": 1, "reason_code": "danado"}], ["texto"],
])
def test_validaciones_de_items(app, caller_permissions, items):
    caller_permissions.set(CLIENT)
    assert post(app, {"items": items})["statusCode"] == 400


def test_limites_de_items_y_archivos(app, caller_permissions):
    caller_permissions.set(CLIENT)
    assert post(app, {"items": [item()] * 51})["statusCode"] == 400
    files = [{"key": f"solicitudes/{ORG}/{CUSTOMER}/{i:08d}-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg"} for i in range(6)]
    assert post(app, {"items": [item(files=files)]})["statusCode"] == 400


def test_otro_con_descripcion_es_valido(app, caller_permissions):
    caller_permissions.set(CLIENT)
    assert post(app, {"items": [item(reason_code="otro", description="no coincide")]})["statusCode"] == 201


@pytest.mark.parametrize("key", [
    f"solicitudes/{ORG}/otra-empresa/{UUID_A}.jpg",
    f"solicitudes/otra-org/{CUSTOMER}/{UUID_A}.jpg",
    f"solicitudes/{ORG}/{CUSTOMER}/../x/{UUID_A}.jpg",
    f"solicitudes/{ORG}/{CUSTOMER}/{UUID_A}.exe",
    f"pedidos/algo/{UUID_A}.jpg", "", None, 5,
])
def test_llaves_ajenas_o_mal_formadas_se_rechazan(app, caller_permissions, key):
    caller_permissions.set(CLIENT)
    assert post(app, {"items": [item(files=[{"key": key}])]})["statusCode"] == 400


def test_archivo_no_subido_o_de_tipo_o_tamano_invalido(app, caller_permissions, monkeypatch):
    module = load_stack_module("admin", "admin_return_requests")
    caller_permissions.set(CLIENT)
    body = {"items": [item(files=[{"key": KEY_A}])]}
    monkeypatch.setattr(module, "_head", lambda key: None)
    assert post(app, body)["statusCode"] == 400
    monkeypatch.setattr(module, "_head", lambda key: {"ContentType": "application/pdf", "ContentLength": 10})
    assert post(app, body)["statusCode"] == 400
    monkeypatch.setattr(module, "_head", lambda key: {"ContentType": "image/jpeg", "ContentLength": 6 * 1024 * 1024})
    assert post(app, body)["statusCode"] == 400
    monkeypatch.setattr(module, "_head", lambda key: {"ContentType": "video/mp4", "ContentLength": 51 * 1024 * 1024})
    assert post(app, {"items": [item(files=[{"key": KEY_B}])]})["statusCode"] == 400


def test_upload_url_valida_el_tipo_y_firma_para_la_empresa(app, caller_permissions, monkeypatch):
    module = load_stack_module("admin", "admin_return_requests")
    caller_permissions.set(CLIENT)
    seen = {}

    class S3:
        def generate_presigned_post(self, bucket, key, **kw):
            seen.update(bucket=bucket, key=key, **kw)
            return {"url": "https://s3", "fields": {"key": key}}

    monkeypatch.setattr(module, "_client", lambda: S3())
    monkeypatch.setenv("MOBILE_EVIDENCE_BUCKET", "bucket-1")
    assert post(app, {"mime_type": "application/pdf"}, UPLOAD_ROUTE)["statusCode"] == 400
    data = body_of(post(app, {"mime_type": "video/mp4"}, UPLOAD_ROUTE))["data"]
    assert data["kind"] == "video" and data["max_bytes"] == 50 * 1024 * 1024
    assert seen["key"].startswith(f"solicitudes/{ORG}/{CUSTOMER}/") and seen["key"].endswith(".mp4")
    assert ["content-length-range", 1, 50 * 1024 * 1024] in seen["Conditions"]
    data = body_of(post(app, {"mime_type": "image/png"}, UPLOAD_ROUTE))["data"]
    assert data["max_bytes"] == 5 * 1024 * 1024


def test_upload_url_sin_bucket_es_503(app, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    monkeypatch.delenv("MOBILE_EVIDENCE_BUCKET", raising=False)
    assert post(app, {"mime_type": "image/png"}, UPLOAD_ROUTE)["statusCode"] == 503


def test_mias_filtra_por_organizacion_empresa_y_usuario(app, db, caller_permissions):
    caller_permissions.set(VIEWER)
    response = app.handler(http_event("GET /api/v1/solicitudes-devolucion/mias", user=USER), None)
    assert body_of(response)["data"][0]["request_number"] == "SOL-2026-11-0001"
    assert next(p for s, p in db.calls if "FROM tbl_return_requests r" in s) == [ORG, CUSTOMER, "app-user"]
