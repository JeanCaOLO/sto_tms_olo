"""Envío de proformas por Gmail: conexión OAuth, token guardado y envío. Sin red ni AWS (todo se simula)."""

import base64
import json
from email import message_from_bytes, policy

import pytest

from conftest import body_of, http_event, load_stack_module

USER = {"id": "auth-1", "email": "liquidador@ologistics.com"}
CLIENT = {"client_id": "cid.apps.googleusercontent.com", "client_secret": "s3cret"}
PDF = base64.b64encode(b"%PDF-1.4 contenido").decode()


class FakeLambda:
    def __init__(self, answer):
        self.answer, self.calls = answer, []

    def invoke(self, FunctionName, Payload):
        self.calls.append((FunctionName, json.loads(Payload)))
        body = json.dumps(self.answer).encode()
        return {"Payload": type("P", (), {"read": lambda self_: body})()}


@pytest.fixture
def mail(monkeypatch):
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "https://api.test/api/tarifas-mail/google/callback")
    monkeypatch.setenv("APP_URL", "https://tms.test")
    monkeypatch.setenv("TARIFAS_FUNCTION", "dev-tms-tarifas-tarifas-api")
    app = load_stack_module("tarifas-mail")
    app._client_cache["value"] = CLIENT
    store: dict = {}
    monkeypatch.setattr(app.token_store, "get_connection", lambda uid: store.get(uid))
    monkeypatch.setattr(app.token_store, "save_connection", lambda uid, c: store.__setitem__(uid, c))
    monkeypatch.setattr(app.token_store, "delete_connection", lambda uid: store.pop(uid, None))
    lam = FakeLambda({"ok": True})
    monkeypatch.setattr(app, "_aws", lambda name: lam)
    http = {"form": [], "json": []}
    monkeypatch.setattr(app.google_oauth.http_util, "post_form", lambda url, data: http["form"].append((url, data)) or http["form_answer"](url, data))
    monkeypatch.setattr(app.google_oauth.http_util, "get_json", lambda url, bearer: {"email": "liq@gmail.com"})
    monkeypatch.setattr(app.gmail_send.http_util, "post_json", lambda url, payload, bearer: http["json"].append((url, payload, bearer)) or {"id": "msg-1"})
    http["form_answer"] = lambda url, data: {"access_token": "AT", "refresh_token": "RT"}
    return app, store, lam, http


def call(app, route, **kw):
    return app.handler(http_event(route, user=kw.pop("user", USER), **kw), None)


def send(app, **over):
    body = {"to": ["a@x.com"], "subject": "Proforma – PRO-VE-001", "body": "Hola\nTotal", "pdfBase64": PDF, "fileName": "Proforma-PRO-VE-001.pdf", **over}
    return call(app, "POST /api/tarifas-mail/proformas/{id}/send", path={"id": "pro_1"}, body=body)


# ── state firmado ──────────────────────────────────────────────────────────────────────────────

def test_state_firmado_vuelve_al_usuario_y_rechaza_alteraciones_y_vencidos(mail):
    app, *_ = mail
    oauth = app.google_oauth
    state = oauth.sign_state("auth-1", "k", now=1000)
    assert oauth.verify_state(state, "k", now=1001) == "auth-1"
    with pytest.raises(oauth.OAuthError):
        oauth.verify_state(state, "otra-clave", now=1001)
    with pytest.raises(oauth.OAuthError):
        oauth.verify_state(state[:-2] + "xx", "k", now=1001)
    with pytest.raises(oauth.OAuthError, match="venció"):
        oauth.verify_state(state, "k", now=1000 + oauth.STATE_TTL_SECONDS + 1)
    with pytest.raises(oauth.OAuthError):
        oauth.verify_state("sin-punto", "k")


# ── conexión ───────────────────────────────────────────────────────────────────────────────────

def test_start_devuelve_la_url_de_google_con_gmail_send_y_acceso_offline(mail):
    app, *_ = mail
    url = body_of(call(app, "POST /api/tarifas-mail/google/start"))["data"]["url"]
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "gmail.send" in url and "access_type=offline" in url and "prompt=consent" in url
    assert "gmail.readonly" not in url and "mail.google.com%2F" not in url  # nunca permisos de lectura


def test_callback_guarda_el_token_del_usuario_del_state_y_redirige_al_tms(mail):
    app, store, _, http = mail
    state = app.google_oauth.sign_state("auth-1", CLIENT["client_secret"])
    response = app.handler({"routeKey": "GET /api/tarifas-mail/google/callback",
                            "queryStringParameters": {"code": "c0de", "state": state}}, None)
    assert response["statusCode"] == 302
    assert response["headers"]["Location"] == "https://tms.test/proformas?google=connected"
    assert store["auth-1"] == {"refresh_token": "RT", "email": "liq@gmail.com"}
    assert http["form"][0][1]["code"] == "c0de"


def test_callback_con_state_falso_no_guarda_nada(mail):
    app, store, *_ = mail
    response = app.handler({"routeKey": "GET /api/tarifas-mail/google/callback",
                            "queryStringParameters": {"code": "c0de", "state": "falso.firma"}}, None)
    assert response["statusCode"] == 302 and "google=error" in response["headers"]["Location"]
    assert store == {}


def test_callback_sin_refresh_token_explica_que_hay_que_reconectar(mail):
    app, store, _, http = mail
    http["form_answer"] = lambda url, data: {"access_token": "AT"}
    state = app.google_oauth.sign_state("auth-1", CLIENT["client_secret"])
    response = app.handler({"routeKey": "GET /api/tarifas-mail/google/callback",
                            "queryStringParameters": {"code": "c", "state": state}}, None)
    assert "google=error" in response["headers"]["Location"] and store == {}


def test_status_y_desconectar(mail):
    app, store, *_ = mail
    assert body_of(call(app, "GET /api/tarifas-mail/google/status"))["data"] == {"connected": False, "email": None}
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}
    assert body_of(call(app, "GET /api/tarifas-mail/google/status"))["data"] == {"connected": True, "email": "liq@gmail.com"}
    call(app, "DELETE /api/tarifas-mail/google")
    assert store == {}


def test_sin_sesion_es_401(mail):
    app, *_ = mail
    response = app.handler({"routeKey": "GET /api/tarifas-mail/google/status", "requestContext": {}}, None)
    assert response["statusCode"] == 401


# ── envío ──────────────────────────────────────────────────────────────────────────────────────

def test_envio_ok_verifica_permiso_renueva_token_y_manda_el_correo_con_el_pdf(mail):
    app, store, lam, http = mail
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}
    response = send(app)
    assert response["statusCode"] == 200
    assert body_of(response)["data"] == {"sent": True, "messageId": "msg-1", "from": "liq@gmail.com", "to": ["a@x.com"]}
    assert lam.calls == [("dev-tms-tarifas-tarifas-api", {"action": "authorize_send", "user_id": "auth-1", "proforma_id": "pro_1"})]
    assert http["form"][-1][1]["grant_type"] == "refresh_token" and http["form"][-1][1]["refresh_token"] == "RT"
    _, payload, bearer = http["json"][0]
    assert bearer == "AT"
    mime = message_from_bytes(base64.urlsafe_b64decode(payload["raw"]), policy=policy.default)
    assert mime["To"] == "a@x.com" and mime["Subject"] == "Proforma – PRO-VE-001"
    attachment = next(mime.iter_attachments())
    assert attachment.get_filename() == "Proforma-PRO-VE-001.pdf" and attachment.get_content().startswith(b"%PDF")
    assert "Hola" in mime.get_body(("plain",)).get_content()


def test_sin_cuenta_conectada_es_409(mail):
    app, *_ = mail
    assert send(app)["statusCode"] == 409


def test_sin_permiso_o_proforma_no_aprobada_no_envia(mail):
    app, store, lam, http = mail
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}
    lam.answer = {"ok": False, "status": 409, "message": 'La proforma está "En Revisión": solo se envía una aprobada.'}
    response = send(app)
    assert response["statusCode"] == 409 and "aprobada" in body_of(response)["error"]["message"]
    assert http["json"] == []


@pytest.mark.parametrize("over,status", [
    ({"to": []}, 400), ({"to": ["no-es-correo"]}, 400), ({"to": ["a@x.com\nbcc:b@y.com"]}, 400),
    ({"pdfBase64": "###"}, 400), ({"pdfBase64": base64.b64encode(b"no es pdf").decode()}, 400),
    ({"subject": "  "}, 400),
])
def test_entradas_invalidas_no_envian(mail, over, status):
    app, store, _, http = mail
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}
    assert send(app, **over)["statusCode"] == status
    assert http["json"] == []


def test_el_asunto_no_puede_inyectar_cabeceras(mail):
    app, store, _, http = mail
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}
    send(app, subject="Hola\r\nBcc: robo@x.com")
    mime = message_from_bytes(base64.urlsafe_b64decode(http["json"][0][1]["raw"]), policy=policy.default)
    assert mime["Bcc"] is None and "Hola" in mime["Subject"]


def test_token_revocado_pide_reconectar(mail):
    app, store, _, http = mail
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}

    def revoked(url, data):
        raise app.google_oauth.http_util.UpstreamError(400, "invalid_grant")
    http["form_answer"] = revoked
    response = send(app)
    assert response["statusCode"] == 409 and "Vuelve a conectar" in body_of(response)["error"]["message"]
    assert http["json"] == []


def test_error_de_gmail_es_502_y_no_se_da_por_enviado(mail, monkeypatch):
    app, store, *_ = mail
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}

    def rejected(url, payload, bearer):
        raise app.gmail_send.http_util.UpstreamError(403, "quota")
    monkeypatch.setattr(app.gmail_send.http_util, "post_json", rejected)
    response = send(app)
    assert response["statusCode"] == 502 and "Gmail no aceptó" in body_of(response)["error"]["message"]


def test_pdf_demasiado_grande_es_413(mail):
    app, store, *_ = mail
    store["auth-1"] = {"refresh_token": "RT", "email": "liq@gmail.com"}
    big = base64.b64encode(b"%PDF" + b"0" * (app.gmail_send.MAX_PDF_BYTES + 1)).decode()
    assert send(app, pdfBase64=big)["statusCode"] == 413


def test_ruta_desconocida_es_404(mail):
    app, *_ = mail
    assert app.handler({"routeKey": "GET /nada"}, None)["statusCode"] == 404
