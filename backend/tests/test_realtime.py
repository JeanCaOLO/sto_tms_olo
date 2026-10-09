"""WebSocket de avisos en vivo (backend/realtime): conexión con JWT y aviso a todos."""

import pytest
from botocore.exceptions import ClientError

from conftest import body_of, load_stack_module
from tms_common.tokens import sign_session

SECRET = "test-secret"


class FakeTable:
    def __init__(self):
        self.items: dict[str, dict] = {}

    def put_item(self, Item):
        self.items[Item["connectionId"]] = Item

    def delete_item(self, Key):
        self.items.pop(Key["connectionId"], None)

    def scan(self, **_kwargs):
        return {"Items": [{"connectionId": cid} for cid in self.items]}


class FakeManagement:
    def __init__(self, gone=(), broken=()):
        self.sent: list[tuple[str, bytes]] = []
        self.gone, self.broken = set(gone), set(broken)

    def post_to_connection(self, ConnectionId, Data):
        if ConnectionId in self.gone:
            raise ClientError({"Error": {"Code": "GoneException"}}, "PostToConnection")
        if ConnectionId in self.broken:
            raise ClientError({"Error": {"Code": "LimitExceededException"}}, "PostToConnection")
        self.sent.append((ConnectionId, Data))


@pytest.fixture
def realtime(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_NAME", raising=False)
    monkeypatch.setenv("JWT_SECRET", SECRET)
    app = load_stack_module("realtime")
    table = FakeTable()
    monkeypatch.setattr(app, "_connections", lambda: table)
    return app, table


def ws_event(route_key: str, connection_id: str = "c1", token: str | None = None) -> dict:
    return {"requestContext": {"routeKey": route_key, "connectionId": connection_id},
            "queryStringParameters": {"token": token} if token else None}


def token_for(user_id: str = "user-1", secret: str = SECRET) -> str:
    return sign_session(user_id, "u@olo.com", secret)["access_token"]


def test_connect_con_token_valido_guarda_la_conexion(realtime):
    app, table = realtime
    assert app.handler(ws_event("$connect", token=token_for()), None) == {"statusCode": 200}
    assert table.items["c1"]["userId"] == "user-1"
    assert table.items["c1"]["expiresAt"] > 0


@pytest.mark.parametrize("token", [None, "basura", "firmado-con-otro"])
def test_connect_sin_token_valido_es_401_y_no_guarda(realtime, token):
    app, table = realtime
    if token == "firmado-con-otro":
        token = token_for(secret="otro-secreto")
    assert app.handler(ws_event("$connect", token=token), None) == {"statusCode": 401}
    assert table.items == {}


def test_disconnect_borra_la_conexion(realtime):
    app, table = realtime
    table.items["c1"] = {"connectionId": "c1"}
    assert app.handler(ws_event("$disconnect"), None) == {"statusCode": 200}
    assert table.items == {}


def test_default_se_ignora(realtime):
    app, _ = realtime
    assert app.handler(ws_event("$default"), None) == {"statusCode": 200}


def test_trigger_avisa_a_todos_y_limpia_las_conexiones_muertas(realtime, monkeypatch):
    app, table = realtime
    for cid in ("vivo", "muerto", "roto"):
        table.items[cid] = {"connectionId": cid}
    management = FakeManagement(gone={"muerto"}, broken={"roto"})
    monkeypatch.setattr(app, "_management_api", lambda: management)

    response = app.handler({"routeKey": "POST /api/v1/realtime/pedidos-nuevos", "requestContext": {}}, None)

    assert response["statusCode"] == 200
    assert body_of(response)["data"] == {"ok": True, "clientes": 1}
    assert [cid for cid, _ in management.sent] == ["vivo"]
    assert b'"type": "pedidos-nuevos"' in management.sent[0][1]
    assert set(table.items) == {"vivo", "roto"}  # la muerta se borra; la que falló por otra causa se conserva


def test_ruta_http_desconocida_es_404(realtime):
    app, _ = realtime
    response = app.handler({"routeKey": "GET /api/v1/realtime/otra", "requestContext": {}}, None)
    assert response["statusCode"] == 404
