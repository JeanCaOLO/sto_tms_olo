import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import pg

# Token firmado con jsonwebtoken (el que usaba server/tms-auth.mjs), secreto "test-secret".
NODE_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0yMjIyLTMzMzMtNDQ0NC01NTU1NTU1NTU1NTUiLCJlbWFpbCI6ImRl"
    "dkBvbG8uY29tIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3OTAxODA4NzB9.nDFLxHZiC6753NegE3jXKWll_bjVOxMnzIh-B06ocss"
)
# Hash de bcryptjs para "secreto123".
BCRYPTJS_HASH = "$2b$10$PZW41BhX61L9M22yjRmf6O/i017qXqIPm4Xi3aeaMooAwqHTkLqgu"


@pytest.fixture(autouse=True)
def jwt_env(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_NAME", raising=False)
    monkeypatch.setenv("JWT_SECRET", "test-secret")


def _authorize(token):
    authorizer = load_stack_module("authorizer")
    return authorizer.handler({"headers": {"authorization": f"Bearer {token}"}}, None)


def test_authorizer_accepts_tokens_issued_by_the_express_backend():
    result = _authorize(NODE_TOKEN)
    assert result == {
        "isAuthorized": True,
        "context": {"sub": "11111111-2222-3333-4444-555555555555", "email": "dev@olo.com"},
    }


def test_authorizer_rejects_tampered_missing_and_foreign_tokens(monkeypatch):
    assert _authorize(NODE_TOKEN[:-2] + "xx") == {"isAuthorized": False}
    assert load_stack_module("authorizer").handler({"headers": {}}, None) == {"isAuthorized": False}
    monkeypatch.setenv("JWT_SECRET", "otro-secreto")
    assert _authorize(NODE_TOKEN) == {"isAuthorized": False}


@pytest.fixture
def auth_app(monkeypatch):
    rows = {"credentials": []}

    def fake_query(sql, params=()):
        if "FROM auth_credentials c" in sql:
            return rows["credentials"]
        if sql.startswith("SELECT 1"):
            return [{"?column?": 1}] if rows["credentials"] else []
        return []

    monkeypatch.setattr(pg, "query", fake_query)
    return load_stack_module("auth"), rows


def test_login_with_bcryptjs_hash_issues_a_token_the_authorizer_accepts(auth_app):
    app, rows = auth_app
    for prefix in ("$2b$", "$2a$"):
        rows["credentials"] = [{"auth_user_id": "u-1", "email": "dev@olo.com",
                                "password_hash": prefix + BCRYPTJS_HASH[4:]}]
        response = app.handler(http_event("POST /api/auth/login",
                                          body={"email": "DEV@olo.com", "password": "secreto123"}), None)
        assert response["statusCode"] == 200
        session = body_of(response)["data"]
        assert session["user"] == {"id": "u-1", "email": "dev@olo.com"}
        assert _authorize(session["access_token"])["isAuthorized"] is True


def test_login_wrong_password_and_missing_fields(auth_app):
    app, rows = auth_app
    rows["credentials"] = [{"auth_user_id": "u-1", "email": "dev@olo.com", "password_hash": BCRYPTJS_HASH}]
    wrong = app.handler(http_event("POST /api/auth/login", body={"email": "dev@olo.com", "password": "x"}), None)
    assert wrong["statusCode"] == 401
    assert body_of(wrong)["error"] == "invalid_credentials"
    missing = app.handler(http_event("POST /api/auth/login", body={"email": "dev@olo.com"}), None)
    assert missing["statusCode"] == 400


def test_signup_validates_length_and_duplicates(auth_app):
    app, rows = auth_app
    user = {"id": "admin", "email": "a@olo.com"}
    short = app.handler(http_event("POST /api/auth/signup", body={"email": "n@olo.com", "password": "123"}, user=user), None)
    assert short["statusCode"] == 400
    created = app.handler(http_event("POST /api/auth/signup",
                                     body={"email": "N@olo.com", "password": "123456"}, user=user), None)
    assert body_of(created)["data"]["user"]["email"] == "n@olo.com"
    rows["credentials"] = [{"auth_user_id": "x"}]
    duplicate = app.handler(http_event("POST /api/auth/signup",
                                       body={"email": "n@olo.com", "password": "123456"}, user=user), None)
    assert duplicate["statusCode"] == 409


def test_session_returns_authorizer_user(auth_app):
    app, _ = auth_app
    user = {"id": "u-1", "email": "dev@olo.com"}
    response = app.handler(http_event("GET /api/auth/session", user=user), None)
    assert body_of(response) == {"data": {"user": user}, "error": None}


def test_inactive_user_cannot_log_in(auth_app):
    app, rows = auth_app
    rows["credentials"] = [{"auth_user_id": "u-1", "email": "dev@olo.com",
                            "password_hash": BCRYPTJS_HASH, "is_active": False}]
    response = app.handler(http_event("POST /api/auth/login",
                                      body={"email": "dev@olo.com", "password": "secreto123"}), None)
    assert response["statusCode"] == 403
    assert body_of(response)["error"] == "inactive_user"
