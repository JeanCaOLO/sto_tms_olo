"""Puente al OSRM propio para el frontend: valida la ruta, elige el mapa y reenvía."""

import io
import json
import urllib.error

import pytest
from conftest import http_event, load_stack_module

USUARIO = {"id": "u1", "email": "u@olo.com"}


@pytest.fixture
def proxy(monkeypatch):
    monkeypatch.setenv("OSRM_URL", "CR=http://osrm:5000;VN=http://osrm:5001")
    return load_stack_module("planning", "osrm_proxy")


def _osrm(monkeypatch, mod, urls, cuerpo=b'{"code":"Ok"}'):
    def urlopen(url, timeout):
        urls.append(url)
        r = io.BytesIO(cuerpo)
        r.status = 200
        return r
    monkeypatch.setattr(mod.urllib.request, "urlopen", urlopen)


def test_reenvia_al_osrm_de_la_region_del_primer_punto(proxy, monkeypatch):
    urls = []
    _osrm(monkeypatch, proxy, urls)
    assert proxy.reenviar("route/v1/driving/-84.09,9.93;-85.43,10.63", {"overview": "full", "x": "1"}) == (200, b'{"code":"Ok"}')
    proxy.reenviar("table/v1/driving/-68.0,10.16;-66.9,10.48", {"annotations": "distance,duration"})
    assert urls == ["http://osrm:5000/route/v1/driving/-84.09,9.93;-85.43,10.63?overview=full",
                    "http://osrm:5001/table/v1/driving/-68.0,10.16;-66.9,10.48?annotations=distance,duration"]


@pytest.mark.parametrize("ruta", ["nearest/v1/driving/-84,9", "route/v1/driving/../../etc", "route/v1/foot/-84,9;-84,10",
                                  "route/v1/driving/-84,9;http://x", "", "route/v1/driving/-84,9;-84,10?x=1"])
def test_rechaza_lo_que_no_es_route_o_table_con_coordenadas(proxy, ruta):
    with pytest.raises(proxy.HttpError) as e:
        proxy.reenviar(ruta, {})
    assert e.value.status == 400


def test_maximo_de_puntos(proxy):
    ruta = "table/v1/driving/" + ";".join(["-84.0,9.9"] * (proxy.MAX_PUNTOS + 1))
    with pytest.raises(proxy.HttpError) as e:
        proxy.reenviar(ruta, {})
    assert e.value.status == 400


def test_punto_fuera_de_los_mapas_da_503(proxy):
    with pytest.raises(proxy.HttpError) as e:
        proxy.reenviar("route/v1/driving/-3.7,40.4;-3.6,40.5", {})  # Madrid
    assert e.value.status == 503


def test_osrm_caido_da_502_y_su_error_pasa_tal_cual(proxy, monkeypatch):
    def caido(url, timeout):
        raise urllib.error.URLError("sin ruta")
    monkeypatch.setattr(proxy.urllib.request, "urlopen", caido)
    with pytest.raises(proxy.HttpError) as e:
        proxy.reenviar("route/v1/driving/-84.09,9.93;-85.43,10.63", {})
    assert e.value.status == 502

    def no_route(url, timeout):
        raise urllib.error.HTTPError(url, 400, "Bad", {}, io.BytesIO(b'{"code":"NoRoute"}'))
    monkeypatch.setattr(proxy.urllib.request, "urlopen", no_route)
    assert proxy.reenviar("route/v1/driving/-84.09,9.93;-85.43,10.63", {}) == (400, b'{"code":"NoRoute"}')


def test_la_ruta_http_devuelve_el_json_de_osrm(monkeypatch):
    monkeypatch.setenv("OSRM_URL", "CR=http://osrm:5000")
    app = load_stack_module("planning", "app")
    urls = []
    _osrm(monkeypatch, app.osrm_proxy, urls, json.dumps({"code": "Ok", "routes": []}).encode())
    res = app.handler(http_event("GET /api/v1/planificacion/osrm/{proxy+}",
                                 path={"proxy": "route/v1/driving/-84.09,9.93;-85.43,10.63"},
                                 query={"overview": "false"}, user=USUARIO), None)
    assert res["statusCode"] == 200 and json.loads(res["body"]) == {"code": "Ok", "routes": []}
    assert urls[0].endswith("?overview=false")
