"""Contrato web ↔ app: lo que escribe mobile debe ser lo que lee la web del TMS (`TMS AHORA SI`, solo referencia).

Compara constantes y SQL con el código de la web leyendo sus fuentes como TEXTO (ast), sin importarlas. Si la carpeta
de referencia no está (otra máquina, CI), esas pruebas se omiten; las de abajo, que no la usan, siempre corren.
"""

import ast
import re
from pathlib import Path

import pytest

from mobile_api import logic, sql

REFERENCE = Path(__file__).resolve().parents[3] / "TMS AHORA SI" / "backend" / "tracking" / "src"
needs_reference = pytest.mark.skipif(not REFERENCE.exists(), reason="sin la carpeta de referencia TMS AHORA SI")


def constants(filename: str) -> dict:
    """Asignaciones de nivel módulo evaluables como literal (strings, números, tuplas, dicts, sumas simples)."""
    tree = ast.parse((REFERENCE / filename).read_text(encoding="utf-8"))
    found = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                found[node.targets[0].id] = ast.literal_eval(node.value)
            except (ValueError, SyntaxError):
                pass
    return found


@needs_reference
@pytest.mark.parametrize("name", ["GEOFENCE_M", "DEPARTURE_RADIUS_M", "MAX_BATCH", "ACCURACY_MAX_M", "MAX_EVIDENCE_BYTES",
                                  "EVIDENCE_KINDS", "EVIDENCE_MIME", "URL_TTL_SECONDS", "GUIDE_STATUS_TEXT",
                                  "SPEED_KMH", "DETOUR_FACTOR", "SERVICE_MIN"])
def test_constants_match_web(name):
    web = constants("tracking_logic.py")
    if name not in web:
        pytest.skip(f"{name} no es literal en la web")
    assert getattr(logic, name) == web[name], name


@needs_reference
def test_status_vocabulary_matches_web():
    web = constants("tracking_logic.py")
    for name in ("_PLANNED", "_ACTIVE", "_COMPLETED", "_CANCELLED"):
        assert getattr(logic, name) == web[name], name


@needs_reference
def test_position_sql_matches_web():
    web = constants("tracking_sql.py")
    assert sql.POSITION_COLUMNS == web["POSITION_COLUMNS"]
    assert sql.POSITION_PLACEHOLDERS.count("%s") == len(web["POSITION_COLUMNS"].split(","))
    assert sql.UPSERT_LAST_POSITIONS_SQL.strip() == web["UPSERT_LAST_POSITIONS_SQL"].strip()
    assert sql.SET_DEPARTED_SQL == web["SET_DEPARTED_SQL"]


@needs_reference
def test_event_types_are_the_ones_the_web_writes():
    source = (REFERENCE / "app.py").read_text(encoding="utf-8")
    web_types = set(re.findall(r'"(delivery_completed|delivery_failed|stop_reverted|geofence_out|route_started)"', source))
    ours = (Path(__file__).resolve().parents[1] / "src" / "mobile_api" / "stops.py").read_text(encoding="utf-8")
    for event_type in ("delivery_completed", "delivery_failed", "stop_reverted", "geofence_out"):
        assert event_type in web_types and f'"{event_type}"' in ours, event_type


@needs_reference
@pytest.mark.parametrize("name", ["PLAN_TRIP_SQL", "ROUTE_BY_PLAN_TRIP_SQL", "ORIGIN_STORE_SQL", "ZONE_SQL",
                                  "PLAN_STOPS_SQL", "INSERT_ROUTE_SQL", "INSERT_GUIDE_SQL"])
def test_start_trip_sql_matches_web(name):
    web = constants("tracking_sql.py")[name]
    assert " ".join(getattr(sql, name).split()) == " ".join(web.split())


@needs_reference
def test_event_insert_columns_match_web():
    web = constants("tracking_sql.py")["INSERT_EVENT_SQL"]
    assert " ".join(sql.INSERT_EVENT_SQL.split()) == " ".join(web.split())


# --- no dependen de la referencia ------------------------------------------------------------------------------------

def test_evidence_key_lives_in_the_folder_of_its_order():
    order, guide = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
    stop = {"id": guide, "order_id": order, "order_number": "CR 0001/A"}
    key = logic.new_evidence_key(stop, "photo_invoice", "image/jpeg")
    assert re.fullmatch(rf"pedidos/CR-0001-A/{order}/photo_invoice-[0-9a-f-]{{36}}\.jpg", key)
    assert logic.require_evidence_key(stop, key) == key
    with pytest.raises(Exception):
        logic.require_evidence_key({**stop, "order_id": "99999999-9999-4999-8999-999999999999"}, key)
    without_order = logic.new_evidence_key({"id": guide, "order_id": None}, "signature", "image/png")
    assert without_order.startswith(f"pedidos/sin-pedido/{guide}/signature-")


def test_guide_strings_are_read_back_as_the_web_reads_them():
    for target, text in logic.GUIDE_STATUS_TEXT.items():
        assert logic.guide_state(target, text) == target
