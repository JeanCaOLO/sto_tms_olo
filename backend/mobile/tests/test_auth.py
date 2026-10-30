import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from conftest import APP_USER, AUTH_USER, DRIVER, EMAIL, body_of, driver_row, event, access_token
from mobile_api import routes, security

LOGIN = "POST /api/mobile/v1/auth/login"
REFRESH = "POST /api/mobile/v1/auth/refresh"
LOGOUT = "POST /api/mobile/v1/auth/logout"
TRIPS = "GET /api/mobile/v1/mi-viaje"


@pytest.fixture(autouse=True)
def fast_password(monkeypatch):
    """bcrypt real es lento y nativo: aquí se prueba la lógica, no la librería."""
    monkeypatch.setattr(security, "verify_password", lambda password, hashed: password == "correcta" and hashed == "hash")


def _credentials(fake_db):
    fake_db.answer("FROM auth_credentials c WHERE", [{"auth_user_id": AUTH_USER, "email": EMAIL, "password_hash": "hash"}])


def login(body):
    return routes.handler(event(LOGIN, body=body, token=None), None)


def test_salud_is_public(fake_db):
    response = routes.handler(event("GET /api/mobile/v1/salud", token=None), None)
    assert response["statusCode"] == 200 and body_of(response)["data"] == {"status": "ok"}


def test_login_returns_tokens_and_stores_only_the_refresh_hash(fake_db):
    _credentials(fake_db)
    response = login({"email": "  Chofer@Demo.TMS.local ", "password": "correcta", "device_id": "dev-1"})
    data = body_of(response)["data"]
    assert response["statusCode"] == 200
    assert data["driver"] == {"id": DRIVER, "name": "Ana Mora"} and data["user"]["email"] == EMAIL
    assert data["expires_in"] == security.ACCESS_TTL_SECONDS
    claims = jwt.decode(data["access_token"], options={"verify_signature": False})
    assert claims["sub"] == AUTH_USER and claims["iss"] == "tms-mobile" and claims["typ"] == "access"
    stored = fake_db.wrote("INSERT INTO mobile_refresh_tokens")[0][1]
    assert stored[0] == APP_USER and stored[1] == security.hash_refresh(data["refresh_token"]) and stored[2] == "dev-1"
    assert data["refresh_token"] not in str(stored)                      # en la BD solo el hash
    assert ["chofer@demo.tms.local"] in [params for _, params in fake_db.calls]    # correo normalizado


def test_login_wrong_password_is_401_and_audited(fake_db):
    _credentials(fake_db)
    response = login({"email": EMAIL, "password": "mala"})
    assert response["statusCode"] == 401 and body_of(response)["error"]["code"] == "invalid_credentials"
    assert not fake_db.wrote("INSERT INTO mobile_refresh_tokens")
    assert any("login_failed" in str(p) for _, p in fake_db.wrote("INSERT INTO audit.events"))


def test_login_is_throttled_after_five_recent_failures_without_checking_the_password(fake_db):
    _credentials(fake_db)
    fake_db.answer("FROM audit.events", [{"n": 5}])
    response = login({"email": EMAIL, "password": "correcta"})                # aunque la clave sea correcta
    assert response["statusCode"] == 429 and body_of(response)["error"]["code"] == "too_many_attempts"
    assert not [c for c in fake_db.calls if "FROM auth_credentials" in c[0]]   # ni se consultó la credencial
    assert not fake_db.wrote("INSERT INTO mobile_refresh_tokens")


def test_login_is_throttled_by_ip_even_with_few_failures_per_email(fake_db):
    _credentials(fake_db)
    fake_db.answers = {"split_part(ip::text": [{"n": 30}], **fake_db.answers}   # la consulta por IP va primero
    ev = {**event(LOGIN, body={"email": EMAIL, "password": "correcta"}, token=None),
          "requestContext": {"http": {"sourceIp": "9.9.9.9"}}}
    response = routes.handler(ev, None)
    assert response["statusCode"] == 429 and body_of(response)["error"]["code"] == "too_many_attempts"


def test_login_with_four_recent_failures_still_works(fake_db):
    _credentials(fake_db)
    fake_db.answer("FROM audit.events", [{"n": 4}])
    assert login({"email": EMAIL, "password": "correcta"})["statusCode"] == 200


def test_login_unknown_email_is_the_same_401(fake_db):
    response = login({"email": "nadie@x.com", "password": "correcta"})
    assert response["statusCode"] == 401 and body_of(response)["error"]["code"] == "invalid_credentials"


def test_login_requires_fields(fake_db):
    assert login({"email": EMAIL})["statusCode"] == 400
    assert login({})["statusCode"] == 400


@pytest.mark.parametrize("row,code", [
    (driver_row(role_name="Operaciones"), "not_a_driver"),
    (driver_row(role_name="Administrador"), "not_a_driver"),
    (driver_row(driver_id=None), "not_a_driver"),
    (driver_row(is_active=False), "inactive_user"),
    (driver_row(organization_id=None), "no_organization"),
])
def test_login_only_lets_linked_active_drivers_in(fake_db, row, code):
    _credentials(fake_db)
    fake_db.answer("FROM app_users u", [row])
    response = login({"email": EMAIL, "password": "correcta"})
    assert response["statusCode"] == 403 and body_of(response)["error"]["code"] == code
    assert not fake_db.wrote("INSERT INTO mobile_refresh_tokens")


def test_private_route_needs_a_token(fake_db):
    response = routes.handler(event(TRIPS, token=None), None)
    assert response["statusCode"] == 401 and body_of(response)["error"]["code"] == "no_token"


def test_expired_token_asks_the_app_to_refresh(fake_db):
    old = access_token(now=int(time.time()) - 2 * security.ACCESS_TTL_SECONDS)
    response = routes.handler(event(TRIPS, token=old), None)
    assert response["statusCode"] == 401 and body_of(response)["error"]["code"] == "token_expired"


def test_token_signed_with_another_secret_is_rejected(fake_db):
    forged = access_token(secret="otro-secreto-que-no-es-el-nuestro-0123456789")
    response = routes.handler(event(TRIPS, token=forged), None)
    assert response["statusCode"] == 401 and body_of(response)["error"]["code"] == "invalid_token"


def test_a_tms_style_token_without_issuer_is_rejected(fake_db):
    import os
    tms = jwt.encode({"sub": AUTH_USER, "email": EMAIL, "exp": int(time.time()) + 600}, os.environ["JWT_SECRET"], "HS256")
    assert routes.handler(event(TRIPS, token=tms), None)["statusCode"] == 401


def test_token_of_a_user_that_stopped_being_a_driver_is_403(fake_db):
    fake_db.answer("FROM app_users u", [driver_row(is_active=False)])
    assert routes.handler(event(TRIPS), None)["statusCode"] == 403


def _refresh_row(**over):
    base = {"id": "rt-1", "app_user_id": APP_USER, "auth_user_id": AUTH_USER, "email": EMAIL,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=5), "revoked_at": None}
    base.update(over)
    return base


def test_refresh_rotates_the_token(fake_db):
    fake_db.answer("FROM mobile_refresh_tokens t", [_refresh_row()])
    response = routes.handler(event(REFRESH, body={"refresh_token": "viejo"}, token=None), None)
    data = body_of(response)["data"]
    assert response["statusCode"] == 200 and data["refresh_token"] != "viejo" and data["access_token"]
    assert fake_db.wrote("UPDATE mobile_refresh_tokens")[0][1] == ["rt-1"]            # el anterior queda revocado
    assert fake_db.wrote("INSERT INTO mobile_refresh_tokens")


def test_refresh_reuse_revokes_every_session_of_the_user(fake_db):
    fake_db.answer("FROM mobile_refresh_tokens t", [_refresh_row(revoked_at=datetime.now(timezone.utc) - timedelta(minutes=10))])
    response = routes.handler(event(REFRESH, body={"refresh_token": "robado"}, token=None), None)
    assert response["statusCode"] == 401 and body_of(response)["error"]["code"] == "invalid_refresh"
    revoke_all = fake_db.wrote("UPDATE mobile_refresh_tokens")
    assert revoke_all and revoke_all[0][1] == [APP_USER]
    assert not fake_db.wrote("INSERT INTO mobile_refresh_tokens")


def test_refresh_retry_right_after_rotation_gets_a_new_session_without_revoking_everything(fake_db):
    """La respuesta del primer canje se perdió: el reintento con el mismo token no debe cerrar todas las sesiones."""
    fake_db.answer("FROM mobile_refresh_tokens t", [_refresh_row(revoked_at=datetime.now(timezone.utc) - timedelta(seconds=5))])
    response = routes.handler(event(REFRESH, body={"refresh_token": "reintento"}, token=None), None)
    assert response["statusCode"] == 200 and body_of(response)["data"]["refresh_token"] != "reintento"
    assert fake_db.wrote("INSERT INTO mobile_refresh_tokens")
    assert not fake_db.wrote("UPDATE mobile_refresh_tokens")


@pytest.mark.parametrize("rows", [[], [_refresh_row(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))]])
def test_refresh_unknown_or_expired_is_401(fake_db, rows):
    fake_db.answer("FROM mobile_refresh_tokens t", rows)
    response = routes.handler(event(REFRESH, body={"refresh_token": "x"}, token=None), None)
    assert response["statusCode"] == 401 and body_of(response)["error"]["code"] == "invalid_refresh"


def test_refresh_of_a_deactivated_driver_is_refused(fake_db):
    fake_db.answer("FROM mobile_refresh_tokens t", [_refresh_row()])
    fake_db.answer("FROM app_users u", [driver_row(is_active=False)])
    assert routes.handler(event(REFRESH, body={"refresh_token": "x"}, token=None), None)["statusCode"] == 403
    assert not fake_db.wrote("INSERT INTO mobile_refresh_tokens")


def test_logout_revokes_and_is_idempotent(fake_db):
    fake_db.answer("FROM mobile_refresh_tokens t", [_refresh_row()])
    assert routes.handler(event(LOGOUT, body={"refresh_token": "x"}, token=None), None)["statusCode"] == 200
    assert fake_db.wrote("UPDATE mobile_refresh_tokens")
    fake_db.answer("FROM mobile_refresh_tokens t", [])
    assert routes.handler(event(LOGOUT, body={"refresh_token": "desconocido"}, token=None), None)["statusCode"] == 200
    assert routes.handler(event(LOGOUT, body={}, token=None), None)["statusCode"] == 200


def test_hash_refresh_is_stable_and_not_reversible():
    assert security.hash_refresh("a") == security.hash_refresh("a") != security.hash_refresh("b")
    assert len(security.hash_refresh("a")) == 64 and security.new_refresh_token() != security.new_refresh_token()


def test_real_bcrypt_accepts_a_tms_style_hash(monkeypatch):
    bcrypt = pytest.importorskip("bcrypt")
    monkeypatch.undo()
    hashed = bcrypt.hashpw(b"clave-demo", bcrypt.gensalt(rounds=4)).decode()
    assert security.verify_password("clave-demo", hashed) and not security.verify_password("otra", hashed)
    assert security.verify_password("x", "no-es-un-hash") is False


def _context_queries(fake_db):
    return [c for c in fake_db.calls if "FROM app_users u" in c[0]]


def test_driver_context_is_cached_per_container(fake_db):
    routes.handler(event(TRIPS), None)
    routes.handler(event(TRIPS), None)
    assert len(_context_queries(fake_db)) == 1


def test_cached_context_expires_so_a_deactivated_user_is_cut_within_a_minute(fake_db, monkeypatch):
    from mobile_api import auth
    clock = [1000.0]
    monkeypatch.setattr(auth.time, "monotonic", lambda: clock[0])
    assert routes.handler(event(TRIPS), None)["statusCode"] == 200
    fake_db.answer("FROM app_users u", [driver_row(is_active=False)])
    assert routes.handler(event(TRIPS), None)["statusCode"] == 200        # aún en caché
    clock[0] += auth.CONTEXT_TTL_SECONDS
    assert routes.handler(event(TRIPS), None)["statusCode"] == 403


def test_login_always_reads_the_context_from_the_db(fake_db):
    _credentials(fake_db)
    routes.handler(event(TRIPS), None)
    login({"email": EMAIL, "password": "correcta"})
    assert len(_context_queries(fake_db)) == 2
