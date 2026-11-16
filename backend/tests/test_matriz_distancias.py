"""Matriz de distancias: OSRM propio cuando responde, línea recta cuando no."""

import io
import json
import urllib.error

import pytest
from conftest import load_stack_module

PUNTOS = [(9.9281, -84.0907), (9.8644, -83.9194), (10.6350, -85.4377)]


@pytest.fixture
def md(monkeypatch):
    mod = load_stack_module("planning", "matriz_distancias")
    monkeypatch.delenv("OSRM_URL", raising=False)
    return mod


def _responde(monkeypatch, md, cuerpo, urls=None):
    def urlopen(url, timeout):
        if urls is not None:
            urls.append(url)
        return io.BytesIO(json.dumps(cuerpo).encode())
    monkeypatch.setattr(md.urllib.request, "urlopen", urlopen)


def _sin_red(monkeypatch, md):
    def urlopen(*a, **k):
        pytest.fail("no debe llamar a la red")
    monkeypatch.setattr(md.urllib.request, "urlopen", urlopen)


def test_sin_osrm_configurado_usa_linea_recta_con_rodeo(md, monkeypatch):
    _sin_red(monkeypatch, md)
    m = md.construir(PUNTOS)
    assert m["fuente"] == "haversine"
    assert m["km"][0][0] == 0.0 and m["km"][0][1] == pytest.approx(m["km"][1][0])
    assert m["km"][0][1] == pytest.approx(20.0 * md.FACTOR_RODEO, rel=0.05)  # San José–Cartago ≈ 20 km en línea recta
    assert m["min"][0][1] == pytest.approx(m["km"][0][1] / md.VELOCIDAD_KMH * 60)


def test_con_osrm_devuelve_km_y_minutos_reales_en_el_orden_de_los_puntos(md, monkeypatch):
    urls = []
    _responde(monkeypatch, md, {"code": "Ok",
                                "distances": [[0, 25000, 210000], [26000, 0, 230000], [211000, 231000, 0]],
                                "durations": [[0, 2400, 12600], [2500, 0, 13800], [12700, 13900, 0]]}, urls)
    m = md.construir(PUNTOS, "http://osrm:5000/")
    assert m["fuente"] == "osrm"
    assert m["km"][0][1] == 25.0 and m["km"][1][0] == 26.0 and m["min"][0][2] == 210.0
    # Una sola llamada, con las coordenadas en lng,lat.
    assert urls == ["http://osrm:5000/table/v1/driving/-84.090700,9.928100;-83.919400,9.864400;-85.437700,10.635000"
                    "?annotations=distance,duration"]


def test_toma_la_url_de_la_variable_de_entorno(md, monkeypatch):
    monkeypatch.setenv("OSRM_URL", "http://10.0.0.1:5000")
    _responde(monkeypatch, md, {"code": "Ok", "distances": [[0, 1000], [1000, 0]], "durations": [[0, 60], [60, 0]]})
    assert md.construir(PUNTOS[:2])["fuente"] == "osrm"


@pytest.mark.parametrize("cuerpo", [
    {"code": "NoTable"},
    {"code": "Ok", "distances": [[0, None], [1000, 0]], "durations": [[0, 60], [60, 0]]},  # par sin ruta
    {"code": "Ok", "distances": [[0, 1000]], "durations": [[0, 60], [60, 0]]},             # matriz incompleta
])
def test_respuesta_invalida_o_incompleta_cae_a_linea_recta(md, monkeypatch, cuerpo):
    _responde(monkeypatch, md, cuerpo)
    assert md.construir(PUNTOS[:2], "http://osrm:5000")["fuente"] == "haversine"


@pytest.mark.parametrize("error", [urllib.error.URLError("sin ruta"), TimeoutError(), ConnectionRefusedError()])
def test_osrm_caido_cae_a_linea_recta(md, monkeypatch, error):
    def urlopen(url, timeout):
        raise error
    monkeypatch.setattr(md.urllib.request, "urlopen", urlopen)
    assert md.construir(PUNTOS, "http://osrm:5000")["fuente"] == "haversine"


def test_respuesta_que_no_es_json_cae_a_linea_recta(md, monkeypatch):
    monkeypatch.setattr(md.urllib.request, "urlopen", lambda url, timeout: io.BytesIO(b"<html>502</html>"))
    assert md.construir(PUNTOS, "http://osrm:5000")["fuente"] == "haversine"


def test_menos_de_dos_puntos_no_llama_a_la_red(md, monkeypatch):
    _sin_red(monkeypatch, md)
    assert md.construir([PUNTOS[0]], "http://osrm:5000") == {"km": [[0.0]], "min": [[0.0]], "fuente": "haversine"}
    assert md.construir([], "http://osrm:5000")["km"] == []


def test_la_accion_estado_ruteo_de_la_lambda_devuelve_el_diagnostico(monkeypatch):
    app = load_stack_module("planning", "app")
    monkeypatch.delenv("OSRM_URL", raising=False)
    res = app.handler({"accion": "estado_ruteo"}, None)
    assert res["osrm_url"] == "" and set(res["regiones"]) == {"CR", "VN"}
    assert res["regiones"]["CR"]["fuente"] == "haversine" and res["regiones"]["CR"]["km"] > 150
    assert res["regiones"]["VN"]["tramo"] == "valencia_caracas" and res["regiones"]["VN"]["km"] > 100


@pytest.mark.parametrize("config, region, esperado", [
    ("http://uno:5000", "CR", "http://uno:5000"),               # URL sola: sirve a todas las regiones
    ("http://uno:5000", "VN", "http://uno:5000"),
    ("CR=http://a:5000;VN=http://a:5001", "CR", "http://a:5000"),
    ("CR=http://a:5000;VN=http://a:5001", "vn", "http://a:5001"),
    ("CR=http://a:5000", "VN", ""),                             # región sin mapa → línea recta
    ("CR=http://a:5000", None, ""),
    ("", "CR", ""),
])
def test_url_por_region(md, config, region, esperado):
    assert md.url_de(region, config) == esperado


def test_cada_region_consulta_su_propio_osrm(md, monkeypatch):
    monkeypatch.setenv("OSRM_URL", "CR=http://a:5000;VN=http://a:5001")
    urls = []
    _responde(monkeypatch, md, {"code": "Ok", "distances": [[0, 1000], [1000, 0]], "durations": [[0, 60], [60, 0]]}, urls)
    md.construir(PUNTOS[:2], region="VN")
    md.construir(PUNTOS[:2], region="CR")
    assert [u.split("/table")[0] for u in urls] == ["http://a:5001", "http://a:5000"]


def _osrm_falso(llamadas):
    """OSRM de mentira: distancia = |Δlng| en metros×1e5, duración = la mitad. Respeta sources/destinations."""
    import urllib.parse

    def urlopen(url, timeout):
        partes = urllib.parse.urlsplit(url)
        coords = [tuple(map(float, c.split(","))) for c in partes.path.split("/driving/")[1].split(";")]
        q = urllib.parse.parse_qs(partes.query)
        origenes = [int(i) for i in q["sources"][0].split(";")] if "sources" in q else range(len(coords))
        destinos = [int(i) for i in q["destinations"][0].split(";")] if "destinations" in q else range(len(coords))
        llamadas.append(len(coords))
        d = [[abs(coords[i][0] - coords[j][0]) * 1e5 for j in destinos] for i in origenes]
        return io.BytesIO(json.dumps({"code": "Ok", "distances": d, "durations": [[x / 2 for x in f] for f in d]}).encode())
    return urlopen


def test_un_dia_grande_se_pide_por_bloques_y_arma_la_misma_matriz(md, monkeypatch):
    llamadas = []
    monkeypatch.setattr(md.urllib.request, "urlopen", _osrm_falso(llamadas))
    puntos = [(10.0 + i * 0.001, -68.0 + (i * 37 % 251) * 0.001) for i in range(250)]  # 250 > BLOQUE (100)
    m = md.construir(puntos, "http://osrm:5001", region="VN")
    assert m["fuente"] == "osrm" and len(llamadas) == 9  # 3 bloques × 3 bloques
    assert max(llamadas) <= 2 * md.BLOQUE
    for i, j in [(0, 249), (249, 0), (120, 7), (5, 5), (199, 200)]:
        assert m["km"][i][j] == pytest.approx(abs(puntos[i][1] - puntos[j][1]) * 100)
        assert m["min"][i][j] == pytest.approx(m["km"][i][j] * 1000 / 2 / 60)


def test_si_un_bloque_falla_todo_el_dia_cae_a_linea_recta(md, monkeypatch):
    llamadas = []
    bueno = _osrm_falso(llamadas)

    def urlopen(url, timeout):
        if len(llamadas) == 4:
            llamadas.append("falla")
            raise TimeoutError()
        return bueno(url, timeout)
    monkeypatch.setattr(md, "HILOS", 1)
    monkeypatch.setattr(md.urllib.request, "urlopen", urlopen)
    puntos = [(10.0, -68.0 + i * 0.001) for i in range(250)]
    assert md.construir(puntos, "http://osrm:5001")["fuente"] == "haversine"
