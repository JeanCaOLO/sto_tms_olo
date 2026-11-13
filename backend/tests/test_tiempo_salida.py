"""T-n por carretera (fase 5): apagado por defecto, minutos de manejo y respaldo en línea recta."""

import io
import json

import pytest
from conftest import load_stack_module


@pytest.fixture
def ts(monkeypatch):
    monkeypatch.delenv("TN_MODO", raising=False)
    monkeypatch.delenv("TN_MIN_POR_DIA", raising=False)
    monkeypatch.setenv("OSRM_URL", "CR=http://osrm:5000")
    return load_stack_module("planning", "tiempo_salida")


def _viaje(lead, *puntos):
    return {"lead": lead, "pedidos": [{"id": i, "lat": lat, "lng": lng} for i, (lat, lng) in enumerate(puntos)]}


def test_por_defecto_no_toca_el_lead(ts, monkeypatch):
    def prohibido(*a, **k):
        pytest.fail("no debe consultar OSRM con el modo apagado")
    monkeypatch.setattr(ts.matriz_distancias, "desde", prohibido)
    viajes = [_viaje(3, (10.6, -85.4))]
    informe = {}
    ts.ajustar(viajes, load_stack_module("planning", "ruta_geo").SEDE_CR, informe)
    assert viajes[0]["lead"] == 3 and informe["tn_modo"] == "linea"


@pytest.mark.parametrize("minutos, esperado", [(None, 1), (0, 1), (119.9, 1), (120, 2), (243, 3), (480, 5)])
def test_lead_por_minutos(ts, minutos, esperado):
    assert ts.lead_por_minutos(minutos, 120) == esperado


def test_con_modo_carretera_usa_la_parada_mas_lejana_en_tiempo(ts, monkeypatch):
    monkeypatch.setenv("TN_MODO", "carretera")
    monkeypatch.setenv("TN_MIN_POR_DIA", "100")
    rg = load_stack_module("planning", "ruta_geo")
    # Viaje 1: paradas a 30 y 250 min → 1 + 250//100 = 3. Viaje 2: 90 min → 1. Viaje 3: sin coordenadas → queda igual.
    monkeypatch.setattr(ts.matriz_distancias, "desde", lambda origen, puntos, region: [30.0, 250.0, 90.0])
    viajes = [_viaje(1, (10.0, -84.0), (10.6, -85.4)), _viaje(2, (9.9, -84.1)), _viaje(7, (None, None))]
    ts.ajustar(viajes, rg.SEDE_CR)
    assert [v["lead"] for v in viajes] == [3, 1, 7]


def test_si_osrm_no_responde_se_queda_el_lead_en_linea_recta(ts, monkeypatch):
    monkeypatch.setenv("TN_MODO", "carretera")
    monkeypatch.setattr(ts.matriz_distancias, "desde", lambda *a, **k: None)
    viajes = [_viaje(2, (10.6, -85.4))]
    ts.ajustar(viajes, load_stack_module("planning", "ruta_geo").SEDE_CR)
    assert viajes[0]["lead"] == 2


@pytest.mark.parametrize("valor", ["", "abc", "0", "-5"])
def test_min_por_dia_invalido_usa_el_defecto(ts, monkeypatch, valor):
    monkeypatch.setenv("TN_MIN_POR_DIA", valor)
    assert ts.min_por_dia() == ts.MIN_POR_DIA_DEFECTO


def test_desde_pide_una_fila_por_bloques_y_sin_osrm_devuelve_none(monkeypatch):
    md = load_stack_module("planning", "matriz_distancias")
    monkeypatch.setenv("OSRM_URL", "CR=http://osrm:5000")
    urls = []

    def urlopen(url, timeout):
        urls.append(url)
        n = len(url.split("destinations=")[1].split(";"))
        return io.BytesIO(json.dumps({"code": "Ok", "distances": [[1000] * n],
                                      "durations": [[600 + i * 60 for i in range(n)]]}).encode())
    monkeypatch.setattr(md.urllib.request, "urlopen", urlopen)
    destinos = [(10.0 + i * 0.001, -84.0) for i in range(250)]
    minutos = md.desde((9.93, -84.09), destinos, region="CR")
    assert len(minutos) == 250 and len(urls) == 3  # bloques de 100
    assert all("sources=0" in u for u in urls)
    assert minutos[0] == 10.0 and minutos[100] == 10.0 and minutos[99] == 10.0 + 99
    assert md.desde((9.93, -84.09), destinos, region="VN") is None  # sin OSRM para la región
