"""Cliente del API REST de eFlow QA (tms_common.eflow_api) contra un servidor FALSO que imita el
contrato del PDF de ePRAC, más su integración: flag mock/qa, lectura del ingest y costura del OMS."""

import json
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit

import pytest

from conftest import load_stack_module

ingest = load_stack_module("planning", "ingest_orders")
handoff = load_stack_module("oms", "handoff_pedidos")
models = load_stack_module("oms", "models")
from tms_common import config as tms_config  # noqa: E402  (el Layer ya está en sys.path por conftest)
from tms_common import eflow_api  # noqa: E402

LLAVE = {"idAlmacen": "0001", "idCompania": "0109", "idSucursal": "0001"}


def _exp(n, fecha="2999-01-01", **extra):
    return {**LLAVE, "idExpedicion": f"EXP-{n}", "fechaExpedicion": "2026-11-10T06:00:00",
            "fechaExpedicionPlanificada": f"{fecha}T08:00:00", "fechaPlanificadaDespacho": None, "estado": "DISP",
            "situacion": "DISP", "prioridad": 101, "idCliente": "CLI-1", "muelle": "M01",
            "observaciones": "Entrega matutina", "bajada": None, "numeroViajeWmh": None, **extra}


class FakeEflow(BaseHTTPRequestHandler):
    expediciones: list = []
    llamadas: list = []          # (método, ruta, cuerpo)
    logins = 0
    rechazar_token_una_vez = False
    errores_por_id: dict = {}

    def log_message(self, *a):
        pass

    def _send(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _auth_ok(self):
        return self.headers.get("Authorization") == f"Bearer tok-{FakeEflow.logins}"

    def do_POST(self):
        cuerpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or "{}")
        ruta = urlsplit(self.path).path
        FakeEflow.llamadas.append(("POST", ruta, cuerpo))
        if ruta == "/api/Autenticacion":
            if cuerpo.get("Password") != "pw":
                return self._send(401, {"result": {"success": False, "message": "Invalid username or password"}, "data": None})
            FakeEflow.logins += 1
            return self._send(200, {"result": {"success": True}, "data": {"token": f"tok-{FakeEflow.logins}"}})
        if FakeEflow.rechazar_token_una_vez:
            FakeEflow.rechazar_token_una_vez = False
            return self._send(401, {"success": False, "message": "expired", "errors": [{"code": "UNAUTHORIZED", "message": "x"}]})
        if not self._auth_ok():
            return self._send(401, {"success": False, "message": "no auth", "errors": []})
        items = cuerpo["expediciones"]
        if len(items) > 100:
            return self._send(400, {"success": False, "message": "validación", "data": None,
                                    "errors": [{"code": "LIMITE_LOTE_EXCEDIDO", "message": "100"}]})
        ok = [i for i in items if i["idExpedicion"] not in FakeEflow.errores_por_id]
        mal = [{**{k: i[k] for k in LLAVE}, "idExpedicion": i["idExpedicion"],
                "code": FakeEflow.errores_por_id[i["idExpedicion"]], "message": "rechazada"}
               for i in items if i["idExpedicion"] in FakeEflow.errores_por_id]
        self._send(200, {"success": bool(ok) and not mal, "message": "m",
                         "data": {"total": len(items), "procesadas": len(ok), "fallidas": len(mal), "resultados": ok},
                         "errors": mal})

    def do_GET(self):
        u = urlsplit(self.path)
        FakeEflow.llamadas.append(("GET", u.path, parse_qs(u.query)))
        if u.path == "/api/TestConexion":
            return self._send(200, {"success": True, "message": "ok", "data": {"conectado": True, "baseDatos": "WMS_QA"}, "errors": []})
        if not self._auth_ok():
            return self._send(401, {"success": False, "message": "no auth", "errors": []})
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        size, page = int(q["PageSize"]), int(q["PageNumber"])
        todas = [e for e in FakeEflow.expediciones if e["estado"] == q["Estado"] and e["situacion"] == q["Situacion"]]
        pages = max(1, -(-len(todas) // size))
        self._send(200, {"success": True, "message": "ok", "errors": [], "data": {
            "items": todas[(page - 1) * size: page * size], "pageNumber": page, "pageSize": size,
            "totalRecords": len(todas), "totalPages": pages}})


@pytest.fixture
def api(monkeypatch):
    FakeEflow.expediciones, FakeEflow.llamadas, FakeEflow.logins = [], [], 0
    FakeEflow.rechazar_token_una_vez, FakeEflow.errores_por_id = False, {}
    server = HTTPServer(("127.0.0.1", 0), FakeEflow)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("EFLOW_QA_HOST", f"http://127.0.0.1:{server.server_port}/api")
    monkeypatch.setenv("EFLOW_QA_USER", "u")
    monkeypatch.setenv("EFLOW_QA_PASSWORD", "pw")
    monkeypatch.setenv("EFLOW_API_MODE", "qa")
    monkeypatch.delenv("EFLOW_API_WRITE", raising=False)
    eflow_api.reiniciar_token()
    yield FakeEflow
    server.shutdown()
    eflow_api.reiniciar_token()


# --- flag ---------------------------------------------------------------------

def test_flag_default_es_mock(monkeypatch):
    monkeypatch.delenv("EFLOW_API_MODE", raising=False)
    assert eflow_api.modo() == "mock" and not eflow_api.activo()
    monkeypatch.setenv("EFLOW_API_MODE", "QA")
    assert eflow_api.activo()
    monkeypatch.setenv("EFLOW_API_MODE", "otra-cosa")
    assert eflow_api.modo() == "mock"


def test_writer_por_defecto_sigue_el_flag(monkeypatch):
    monkeypatch.setenv("EFLOW_API_MODE", "mock")
    assert isinstance(handoff._escritor_por_defecto(), handoff.SimExpedicionesWriter)
    monkeypatch.setenv("EFLOW_API_MODE", "qa")
    assert isinstance(handoff._escritor_por_defecto(), handoff.EflowApiWriter)


def test_host_http_no_se_confunde_con_sql_server(monkeypatch):
    for k in ("EFLOW_CR_HOST", "EFLOW_SECRET_NAME"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("EFLOW_QA_HOST", "http://10.0.0.1:87/api")
    assert tms_config._eflow_from_env("cr") is None


# --- cliente ------------------------------------------------------------------

def test_test_conexion(api):
    assert eflow_api.test_conexion()["conectado"] is True


def test_login_invalido_lanza_error(api, monkeypatch):
    monkeypatch.setenv("EFLOW_QA_PASSWORD", "mala")
    with pytest.raises(eflow_api.EflowApiError, match="Autenticación"):
        eflow_api.obtener_expediciones(date(2026, 1, 1), date(2026, 1, 2))


def test_obtener_expediciones_recorre_paginas_y_reutiliza_token(api):
    api.expediciones = [_exp(i) for i in range(7)] + [_exp(99, situacion="SOAC")]
    items = eflow_api.obtener_expediciones(date(2026, 11, 1), date(2026, 11, 30), pagina_tam=3)
    assert [i["idExpedicion"] for i in items] == [f"EXP-{i}" for i in range(7)]
    assert api.logins == 1  # un solo login para las 3 páginas


def test_renueva_el_token_ante_401(api):
    eflow_api.cambiar_prioridad([{**LLAVE, "idExpedicion": "EXP-1", "prioridad": 3}])  # login 1
    api.rechazar_token_una_vez = True
    res = eflow_api.cambiar_prioridad([{**LLAVE, "idExpedicion": "EXP-1", "prioridad": 2}])
    assert res.exito and api.logins == 2


def test_lotes_de_100_y_sin_duplicados(api):
    items = [{**LLAVE, "idExpedicion": f"E{i}", "prioridad": 1} for i in range(230)] + [{**LLAVE, "idExpedicion": "E0", "prioridad": 1}]
    res = eflow_api.cambiar_prioridad(items)
    posts = [c for c in api.llamadas if c[1].endswith("CambiarPrioridadExpedicion")]
    assert [len(p[2]["expediciones"]) for p in posts] == [100, 100, 30]
    assert len(res.ok) == 230


def test_error_por_expediente_no_lanza_pero_exigir_exito_si(api):
    api.errores_por_id = {"EXP-2": "ESTADO_INVALIDO"}
    res = eflow_api.generar_acciones([{**LLAVE, "idExpedicion": "EXP-1"}, {**LLAVE, "idExpedicion": "EXP-2"}])
    assert len(res.ok) == 1 and res.error_de("EXP-2")["code"] == "ESTADO_INVALIDO"
    with pytest.raises(eflow_api.EflowApiError, match="ESTADO_INVALIDO"):
        eflow_api.exigir_exito(res, "GenerarAcciones")


def test_solo_lectura_no_envia_escrituras(api, monkeypatch):
    monkeypatch.setenv("EFLOW_API_WRITE", "off")
    res = eflow_api.asignar_viaje([{**LLAVE, "idExpedicion": "EXP-1", "numeroViajeWmh": 20261120}])
    assert not res.errores and not [c for c in api.llamadas if "AsignarNumeroViajeWMH" in c[1]]


def test_sin_red_da_error_claro(monkeypatch):
    monkeypatch.setenv("EFLOW_QA_HOST", "http://127.0.0.1:1/api")
    monkeypatch.setenv("EFLOW_QA_USER", "u")
    monkeypatch.setenv("EFLOW_QA_PASSWORD", "pw")
    eflow_api.reiniciar_token()
    with pytest.raises(eflow_api.EflowApiError, match="No se pudo conectar"):
        eflow_api.test_conexion()


# --- costura del OMS ----------------------------------------------------------

PK = models.PedidoPK("0001", "0109", "0001", "EXP-1")


def _rutas(api):
    return [c[1] for c in api.llamadas if c[0] == "POST" and "Autenticacion" not in c[1]]


def test_writer_actualizar_prioridad_manda_solo_el_numero(api):
    handoff.EflowApiWriter().actualizar_prioridad(PK, 3)
    assert _rutas(api) == ["/api/Expediciones/CambiarPrioridadExpedicion"]
    cuerpo = next(c[2] for c in api.llamadas if c[1].endswith("CambiarPrioridadExpedicion"))
    assert cuerpo["expediciones"][0] == {**LLAVE, "idExpedicion": "EXP-1", "prioridad": 3}


def test_writer_marcar_generada_prioridad_y_generar_acciones(api):
    handoff.EflowApiWriter().marcar_generada(PK, 0)
    assert _rutas(api) == ["/api/Expediciones/CambiarPrioridadExpedicion", "/api/Expediciones/GenerarAcciones"]


def test_writer_propaga_el_rechazo_del_api(api):
    api.errores_por_id = {"EXP-1": "ESTADO_INVALIDO"}
    with pytest.raises(eflow_api.EflowApiError):
        handoff.EflowApiWriter().marcar_generada(PK, 0)


# --- lectura del ingest -------------------------------------------------------

def test_ingest_lee_la_cola_del_api_con_la_forma_del_sql(api, monkeypatch):
    monkeypatch.setenv("EFLOW_API_DIAS_ATRAS", "0")
    api.expediciones = [
        _exp(1, "2999-01-02"),
        _exp(2, "2999-01-01"),
        _exp(3, "2000-01-01"),                       # fecha vencida: fuera
        _exp(4, "2999-01-03", numeroViajeWmh=555),   # ya tiene viaje: fuera
    ]
    filas = ingest._eflow_api_disp_disp(500)
    assert [f["IDEXPEDICION"] for f in filas] == ["EXP-2", "EXP-1"]  # ordenadas por fecha
    f = filas[0]
    assert f["FECHA"] == "2999-01-01" and f["TPEXES"] == "DISP" and f["PESOPEDIDO_TOTAL"] is None
    assert f["IDCLIENTE"] == "CLI-1" and f["OBSERVACIONES"] == "Entrega matutina"
