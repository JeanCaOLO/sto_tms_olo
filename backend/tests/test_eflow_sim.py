"""Tests del módulo SIMULADO eflow-sim (sim_source + handler app).

Cubre: filtro por params (cabecera y detalle), update que persiste en el store
en memoria, 404 cuando no existe el registro, 400 cuando faltan claves. Mismo
estilo que test_eflow_mock.py (load_stack_module/http_event/body_of).

El store de sim_source es estado mutable del módulo; cada test lo recarga para
no arrastrar los updates de otro (recrea el seed desde disco).
"""

import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common.errors import HttpError


@pytest.fixture
def sim():
    """sim_source con el store reseteado al seed de disco (estado fresco por test)."""
    mod = load_stack_module("eflow-sim", "sim_source")
    mod._DB = mod._cargar()
    return mod


@pytest.fixture
def app():
    """handler del stack eflow-sim; resetea el store de su sim_source."""
    sim_mod = load_stack_module("eflow-sim", "sim_source")
    sim_mod._DB = sim_mod._cargar()
    return load_stack_module("eflow-sim", "app")


# --- sim_source: filtros -----------------------------------------------------

def test_cabecera_sin_filtros_devuelve_todo(sim):
    assert len(sim.cabecera({})) == 4


def test_cabecera_filtra_por_estado(sim):
    disp = sim.cabecera({"TPEXES": "DISP"})
    assert {r["IDEXPEDICION"] for r in disp} == {"EXP-000123", "EXP-000124", "EXP-000125"}


def test_cabecera_combina_filtros(sim):
    rows = sim.cabecera({"IDCOMPANIA": "0109", "IDSUCURSAL": "0002"})
    assert [r["IDEXPEDICION"] for r in rows] == ["EXP-000126"]


def test_detalle_filtra_por_expedicion(sim):
    lineas = sim.detalle({"IDEXPEDICION": "EXP-000123"})
    assert len(lineas) == 2 and {l["IDLINEA"] for l in lineas} == {1, 2}


def test_filtro_sin_coincidencias_devuelve_vacio(sim):
    assert sim.cabecera({"IDEXPEDICION": "NO-EXISTE"}) == []


# --- sim_source: update persiste ---------------------------------------------

def test_actualizar_cabecera_persiste(sim):
    clave = {"IDEXPEDICION": "EXP-000123", "IDCOMPANIA": "0109", "IDALMACEN": "0001", "IDSUCURSAL": "0001"}
    resp = sim.actualizar_cabecera({**clave, "TPEXSI": "GENE", "PRIORIDAD": 1, "BAJADA": "A1"})
    assert resp["status"] == "success"
    row = sim.cabecera(clave)[0]
    assert row["TPEXSI"] == "GENE" and row["PRIORIDAD"] == 1 and row["BAJADA"] == "A1"
    # TPEXES no estaba en el payload: no se toca.
    assert row["TPEXES"] == "DISP"


def test_actualizar_detalle_persiste_en_todas_las_lineas(sim):
    clave = {"IDEXPEDICION": "EXP-000123", "IDCOMPANIA": "0109", "IDALMACEN": "0001", "IDSUCURSAL": "0001"}
    sim.actualizar_detalle({**clave, "TPEXSI": "GENE"})
    assert all(l["TPEXSI"] == "GENE" for l in sim.detalle(clave))


def test_detalle_no_actualiza_bajada(sim):
    # BAJADA no está entre los campos de detalle: aunque se mande, se ignora.
    clave = {"IDEXPEDICION": "EXP-000123", "IDCOMPANIA": "0109", "IDALMACEN": "0001", "IDSUCURSAL": "0001"}
    sim.actualizar_detalle({**clave, "BAJADA": "ZZ"})
    assert all("BAJADA" not in l for l in sim.detalle(clave))


# --- sim_source: errores -----------------------------------------------------

def test_actualizar_registro_inexistente_da_404(sim):
    with pytest.raises(HttpError) as exc:
        sim.actualizar_cabecera({"IDEXPEDICION": "EXP-999", "IDCOMPANIA": "0109", "IDALMACEN": "0001", "IDSUCURSAL": "0001", "TPEXSI": "GENE"})
    assert exc.value.status == 404


def test_actualizar_sin_claves_da_400(sim):
    with pytest.raises(HttpError) as exc:
        sim.actualizar_cabecera({"IDEXPEDICION": "EXP-000123", "TPEXSI": "GENE"})
    assert exc.value.status == 400 and "faltan claves" in str(exc.value)


# --- handler app: shapes HTTP ------------------------------------------------

def test_get_cabecera_filtra_por_query(app):
    rows = body_of(app.handler(http_event("GET /api/eflow-sim/expediciones-cabecera", query={"TPEXES": "GENE"}), None))
    assert [r["IDEXPEDICION"] for r in rows] == ["EXP-000126"]


def test_post_cabecera_responde_success_y_persiste(app):
    payload = {"IDEXPEDICION": "EXP-000124", "IDCOMPANIA": "0109", "IDALMACEN": "0001", "IDSUCURSAL": "0001", "PRIORIDAD": 3}
    resp = body_of(app.handler(http_event("POST /api/eflow-sim/expediciones-cabecera", body=payload), None))
    assert resp["status"] == "success" and resp["message"] == "Updated" and resp["IDEXPEDICION"] == "EXP-000124"
    rows = body_of(app.handler(http_event("GET /api/eflow-sim/expediciones-cabecera", query={"IDEXPEDICION": "EXP-000124"}), None))
    assert rows[0]["PRIORIDAD"] == 3


def test_post_registro_inexistente_devuelve_404_con_shape_error(app):
    bad = {"IDEXPEDICION": "EXP-999", "IDCOMPANIA": "0109", "IDALMACEN": "0001", "IDSUCURSAL": "0001", "TPEXSI": "GENE"}
    resp = app.handler(http_event("POST /api/eflow-sim/expediciones-cabecera", body=bad), None)
    assert resp["statusCode"] == 404
    assert body_of(resp)["status"] == "error"


def test_post_sin_claves_devuelve_400(app):
    resp = app.handler(http_event("POST /api/eflow-sim/expediciones-detalle", body={"TPEXSI": "GENE"}), None)
    assert resp["statusCode"] == 400 and body_of(resp)["status"] == "error"


def test_body_invalido_da_400(app):
    event = http_event("POST /api/eflow-sim/expediciones-cabecera")
    event["body"] = "{no-json"
    resp = app.handler(event, None)
    assert resp["statusCode"] == 400
