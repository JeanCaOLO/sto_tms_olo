from datetime import date

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions

USER = {"id": "auth-1", "email": "admin@ologistics.com"}


def _row(type_, name, days_left, country="cr", **extra):
    return {"type": type_, "entity_id": f"id-{name}", "name": name, "code": None, "carrier_name": None,
            "license_number": None, "country_id": country, "expiry_date": date(2026, 11, 1), "days_left": days_left,
            **extra}


ROWS = [
    _row("carrier_contract", "Trans CR", -3),
    _row("driver_license", "Ana", 12, license_number="B1-123"),
    _row("driver_license", "Luis VE", 0, country="ve"),
    _row("driver_license", "Sin transportista", 5, country=None),
]


@pytest.fixture
def alerts(monkeypatch):
    from tms_common import pg
    calls = []

    def query(sql, params=()):
        calls.append((sql, list(params)))
        return ROWS

    monkeypatch.setattr(pg, "query", query)
    return load_stack_module("alerts"), calls


def test_classify_marks_expired_and_due_soon():
    exp = load_stack_module("alerts", "expirations")
    assert exp.classify(ROWS[0])["status"] == "expired"
    assert exp.classify(ROWS[2])["status"] == "due_soon"          # vence hoy
    assert exp.classify(ROWS[1])["expiry_date"] == "2026-11-01"


def test_api_asks_for_the_30_day_window_and_admin_sees_everything(alerts):
    app, calls = alerts
    body = body_of(app.handler(http_event("GET /api/v1/alerts/expirations", user=USER), None))
    assert calls[0][1] == [30]
    assert len(body["data"]) == 4 and body["window_days"] == 30


def test_api_filters_by_module_and_country(alerts, caller_permissions):
    app, _ = alerts
    caller_permissions.set(make_permissions({"conductores": ["view"]}, countries=("cr",)))
    body = body_of(app.handler(http_event("GET /api/v1/alerts/expirations", user=USER), None))
    # sin `transportistas` no ve contratos; de VE no ve nada; lo que no tiene país sí se ve
    assert sorted(a["name"] for a in body["data"]) == ["Ana", "Sin transportista"]


def test_digest_returns_all_alerts(alerts):
    app, _ = alerts
    assert len(app.digest_handler({}, None)["alerts"]) == 4


def test_email_groups_expired_and_due_and_escapes_html():
    body = load_stack_module("alerts-mailer", "email_body")
    alerts = [
        {"type": "carrier_contract", "name": "<b>Trans</b>", "code": "TR-1", "license_number": None,
         "carrier_name": None, "expiry_date": "2026-10-09", "days_left": -3, "status": "expired"},
        {"type": "driver_license", "name": "Ana", "code": None, "license_number": "B1", "carrier_name": "Trans",
         "expiry_date": "2026-10-13", "days_left": 1, "status": "due_soon"},
    ]
    email = body.build_email(alerts, date(2026, 10, 12), "https://tms")
    assert email["subject"] == "TMS · Vencimientos al 12/10/2026: 1 vencidos, 1 por vencer"
    assert "venció hace 3 días" in email["text"] and "vence en 1 día" in email["text"]
    assert "&lt;b&gt;Trans&lt;/b&gt;" in email["html"] and "<b>Trans</b>" not in email["html"]
    assert "09/10/2026" in email["text"] and "https://tms" in email["html"]


def test_no_alerts_no_email():
    body = load_stack_module("alerts-mailer", "email_body")
    assert body.build_email([], date(2026, 10, 12)) is None


class _Payload:
    def __init__(self, data):
        self.data = data

    def read(self):
        import json
        return json.dumps(self.data).encode()


@pytest.fixture
def mailer(monkeypatch):
    module = load_stack_module("alerts-mailer", "mailer")
    sent, digest = [], {"payload": {"alerts": []}, "error": None}

    class FakeLambda:
        def invoke(self, FunctionName, Payload):
            response = {"Payload": _Payload(digest["payload"])}
            if digest["error"]:
                response["FunctionError"] = "Unhandled"
            return response

    class FakeSes:
        def send_email(self, **kwargs):
            sent.append(kwargs)
            return {"MessageId": "m-1"}

    monkeypatch.setattr(module.boto3, "client", lambda name: FakeLambda() if name == "lambda" else FakeSes())
    monkeypatch.setenv("DIGEST_FUNCTION", "dev-tms-alerts-alerts-digest")
    monkeypatch.setenv("ALERT_FROM", "jalvarez@ologistics.com")
    monkeypatch.setenv("ALERT_TO", "jbonilla@ologistics.com")
    monkeypatch.setenv("ALERT_CC", "rperez@ologistics.com")
    return module, sent, digest


def test_mailer_sends_to_and_cc(mailer):
    module, sent, digest = mailer
    digest["payload"] = {"alerts": [{"type": "driver_license", "name": "Ana", "expiry_date": "2026-10-20",
                                     "days_left": 8, "status": "due_soon"}]}
    assert module.handler({}, None)["sent"] is True
    assert sent[0]["Destination"] == {"ToAddresses": ["jbonilla@ologistics.com"], "CcAddresses": ["rperez@ologistics.com"]}
    assert sent[0]["FromEmailAddress"] == "jalvarez@ologistics.com"


def test_mailer_sends_nothing_without_alerts(mailer):
    module, sent, _ = mailer
    assert module.handler({}, None) == {"sent": False, "alerts": 0} and not sent


def test_mailer_fails_loudly_if_the_digest_fails(mailer):
    module, sent, digest = mailer
    digest["error"] = True
    digest["payload"] = {"errorMessage": "db down"}
    with pytest.raises(RuntimeError, match="vencimientos falló"):
        module.handler({}, None)
    assert not sent


def test_mailer_test_mode_sends_only_to_the_given_address_with_sample_data(mailer):
    module, sent, _ = mailer
    result = module.handler({"test_to": "jalvarez@ologistics.com"}, None)
    assert result["sent"] is True and result["alerts"] == 2
    assert sent[0]["Destination"] == {"ToAddresses": ["jalvarez@ologistics.com"], "CcAddresses": []}
    assert sent[0]["Content"]["Simple"]["Subject"]["Data"].startswith("[PRUEBA] ")
