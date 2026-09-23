import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from tms_common.responses import json_response


def test_encoding_matches_node_pg_output():
    row = {
        "amount": Decimal("12.50"),
        "created": datetime(2026, 9, 23, 10, 5, 7, 123456),
        "aware": datetime(2026, 9, 23, 4, 0, tzinfo=timezone(timedelta(hours=-6))),
        "day": date(2026, 9, 23),
        "id": UUID("11111111-2222-3333-4444-555555555555"),
    }
    body = json.loads(json_response(200, row)["body"])
    assert body == {
        "amount": "12.50",
        "created": "2026-09-23T10:05:07.123Z",
        "aware": "2026-09-23T10:00:00.000Z",
        "day": "2026-09-23T00:00:00.000Z",
        "id": "11111111-2222-3333-4444-555555555555",
    }


def test_decimal_as_float_for_eflow():
    body = json.loads(json_response(200, {"w": Decimal("1.5")}, decimal_as=float)["body"])
    assert body == {"w": 1.5}
