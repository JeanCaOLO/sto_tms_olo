import json
from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common.errors import HttpError

USER = {"id": "auth-1", "email": "admin@ologistics.com"}
CARRIER_ID = "c0ffee00-0000-4000-8000-000000000001"
OTHER_ID = "c0ffee00-0000-4000-8000-000000000002"
KEY = f"carriers/{CARRIER_ID}/contract/12345678-1234-4234-8234-123456789abc.pdf"


@pytest.fixture
def files():
    return load_stack_module("documents", "contract_files")


def test_new_key_belongs_to_the_carrier_and_is_accepted(files):
    key = files.new_contract_key(CARRIER_ID)
    assert key.startswith(f"carriers/{CARRIER_ID}/contract/") and key.endswith(".pdf")
    assert files.require_contract_key(CARRIER_ID, key) == key


@pytest.mark.parametrize("key", [
    f"carriers/{OTHER_ID}/contract/12345678-1234-4234-8234-123456789abc.pdf",   # de otro transportista
    f"carriers/{CARRIER_ID}/contract/../../secreto.pdf",
    f"carriers/{CARRIER_ID}/contract/12345678-1234-4234-8234-123456789abc.exe",
    "", None,
])
def test_keys_not_generated_for_this_carrier_are_rejected(files, key):
    with pytest.raises(HttpError, match="Llave de archivo inválida"):
        files.require_contract_key(CARRIER_ID, key)


def test_uploaded_object_must_be_a_pdf_within_size(files):
    files.require_uploaded_pdf({"ContentType": "application/pdf", "ContentLength": 2048})
    with pytest.raises(HttpError, match="no se subió"):
        files.require_uploaded_pdf(None)
    with pytest.raises(HttpError, match="debe ser un PDF"):
        files.require_uploaded_pdf({"ContentType": "text/html", "ContentLength": 10})
    with pytest.raises(HttpError, match="tamaño"):
        files.require_uploaded_pdf({"ContentType": "application/pdf", "ContentLength": 11 * 1024 * 1024})


def test_download_name_is_safe(files):
    assert files.download_name({"code": "TR-01", "name": "x"}) == "contrato-TR-01.pdf"
    assert files.download_name({"code": None, "name": 'Trans "Ñ" / S.A.'}) == "contrato-Trans-S-A.pdf"


class FakeS3:
    def __init__(self, head=None):
        self.head, self.calls = head, []

    def generate_presigned_post(self, bucket, key, **kwargs):
        self.calls.append(("post", key, kwargs))
        return {"url": f"https://{bucket}.s3.amazonaws.com/", "fields": {"key": key}}

    def head_object(self, Bucket, Key):
        return self.head

    def generate_presigned_url(self, op, Params, ExpiresIn):
        self.calls.append(("get", Params, ExpiresIn))
        return "https://signed/get"


@pytest.fixture
def documents(monkeypatch):
    from tms_common import pg
    calls, carrier = [], {"id": CARRIER_ID, "code": "TR-01", "name": "Trans", "country_id": "cr",
                          "contract_file_key": None}

    def query(sql, params=()):
        calls.append((sql, list(params)))
        return [carrier] if "FROM carriers" in sql else []

    monkeypatch.setattr(pg, "query", query)
    monkeypatch.setenv("DOCUMENTS_BUCKET", "dev-tms-documents-1")
    app = load_stack_module("documents")
    s3 = FakeS3()
    monkeypatch.setattr(app, "s3", lambda: s3)
    return app, s3, calls, carrier


def _event(route, body=None):
    return http_event(route, path={"id": CARRIER_ID}, body=body, user=USER)


def test_upload_form_signs_only_pdf_up_to_10mb(documents):
    app, s3, _, _ = documents
    body = body_of(app.handler(_event("POST /api/v1/carriers/{id}/contract/upload"), None))
    assert body["data"]["key"].startswith(f"carriers/{CARRIER_ID}/contract/")
    _, _, kwargs = s3.calls[0]
    assert {"Content-Type": "application/pdf"} in kwargs["Conditions"]
    assert ["content-length-range", 1, 10 * 1024 * 1024] in kwargs["Conditions"]


def test_save_checks_the_object_and_stores_the_key(documents):
    app, s3, calls, _ = documents
    s3.head = {"ContentType": "application/pdf", "ContentLength": 1000}
    response = app.handler(_event("PUT /api/v1/carriers/{id}/contract", {"key": KEY}), None)
    assert response["statusCode"] == 200
    assert [p for sql, p in calls if sql.startswith("UPDATE carriers")] == [[KEY, CARRIER_ID]]


def test_save_rejects_a_missing_upload(documents):
    app, s3, calls, _ = documents
    s3.head = None
    response = app.handler(_event("PUT /api/v1/carriers/{id}/contract", {"key": KEY}), None)
    assert response["statusCode"] == 400 and not [c for c in calls if c[0].startswith("UPDATE")]


def test_download_without_contract_is_404_and_with_contract_signs_a_link(documents):
    app, s3, _, carrier = documents
    assert app.handler(_event("GET /api/v1/carriers/{id}/contract"), None)["statusCode"] == 404
    carrier["contract_file_key"] = KEY
    body = body_of(app.handler(_event("GET /api/v1/carriers/{id}/contract"), None))
    assert body["data"]["url"] == "https://signed/get"
    _, params, ttl = s3.calls[-1]
    assert params["Key"] == KEY and 'filename="contrato-TR-01.pdf"' in params["ResponseContentDisposition"]
    assert ttl == 300


def test_download_never_signs_a_key_of_another_carrier_or_object(documents):
    app, s3, _, carrier = documents
    for key in ["carriers/otro/contract/x.pdf", "otra-carpeta/secreto.pdf", KEY.replace(".pdf", ".exe")]:
        carrier["contract_file_key"] = key
        assert app.handler(_event("GET /api/v1/carriers/{id}/contract"), None)["statusCode"] == 404
    assert not [c for c in s3.calls if c[0] == "get"]


def test_editing_requires_the_carriers_edit_permission(documents, caller_permissions):
    from conftest import make_permissions
    app, _, calls, _ = documents
    caller_permissions.set(make_permissions({"transportistas": ["view"]}))
    response = app.handler(_event("POST /api/v1/carriers/{id}/contract/upload"), None)
    assert response["statusCode"] == 403
