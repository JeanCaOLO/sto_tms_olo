"""Entrar con Google: validación del ID token (fuera de la VPC) y alta/búsqueda del usuario (auth)."""

import pytest

from conftest import load_stack_module

CLIENT = "cliente.apps.googleusercontent.com"


def _claims(email="ana@ologistics.com", **extra):
    base = {"aud": CLIENT, "iss": "https://accounts.google.com", "email": email, "email_verified": "true", "name": "Ana"}
    return {**base, **extra}


def test_token_valido_de_dominio_permitido():
    g = load_stack_module("auth-google", "google_login")
    assert g.verify("tok", CLIENT, tokeninfo=lambda _: _claims("Ana@Intelix.biz")) == {"email": "ana@intelix.biz", "name": "Ana"}


@pytest.mark.parametrize("claims, code", [
    (_claims("ana@gmail.com"), "domain_not_allowed"),
    (_claims("ana@ologistics.com.evil.com"), "domain_not_allowed"),
    (_claims(aud="otro-cliente"), "invalid_google_token"),
    (_claims(iss="https://evil.example"), "invalid_google_token"),
    (_claims(email_verified="false"), "email_not_verified"),
])
def test_token_rechazado(claims, code):
    g = load_stack_module("auth-google", "google_login")
    with pytest.raises(g.LoginError) as err:
        g.verify("tok", CLIENT, tokeninfo=lambda _: claims)
    assert err.value.code == code


def test_dominio_no_permitido_muestra_el_aviso():
    g = load_stack_module("auth-google", "google_login")
    with pytest.raises(g.LoginError) as err:
        g.verify("tok", CLIENT, tokeninfo=lambda _: _claims("x@hotmail.com"))
    assert err.value.status == 403 and "@ologistics.com o @intelix.biz" in err.value.message


class _Db:
    def __init__(self, existing):
        self.existing, self.sql = existing, []

    def query(self, sql, params=()):
        self.sql.append(sql)
        return self.existing if "FROM tbl_auth_credentials c" in sql else []

    def run_in_transaction(self, work):
        return work(lambda sql, params=(): self.sql.append(sql) or [])


@pytest.fixture
def auth(monkeypatch):
    app = load_stack_module("auth")
    monkeypatch.setattr(app, "jwt_secret", lambda: "s")
    monkeypatch.setattr(app, "sign_session", lambda uid, email, _s: {"access_token": "t", "user": {"id": uid, "email": email}})
    return app


def test_usuario_nuevo_se_crea_sin_rol(auth, monkeypatch):
    db = _Db([])
    monkeypatch.setattr(auth, "pg", db)
    out = auth.handler({"action": "google_login", "email": "nuevo@ologistics.com", "name": "Nuevo"})
    assert out["status"] == 200 and out["body"]["data"]["user"]["email"] == "nuevo@ologistics.com"
    alta = [s for s in db.sql if "INSERT INTO tbl_app_users" in s]
    assert len(alta) == 1 and "role_id" not in alta[0]


def test_usuario_existente_entra_sin_crear_nada(auth, monkeypatch):
    db = _Db([{"auth_user_id": "u-1", "email": "ana@intelix.biz", "app_user_id": "a-1", "is_active": True}])
    monkeypatch.setattr(auth, "pg", db)
    out = auth.handler({"action": "google_login", "email": "ana@intelix.biz", "name": "Ana"})
    assert out["status"] == 200 and out["body"]["data"]["user"]["id"] == "u-1"
    assert not [s for s in db.sql if "INSERT" in s]


def test_usuario_desactivado_no_entra(auth, monkeypatch):
    monkeypatch.setattr(auth, "pg", _Db([{"auth_user_id": "u-1", "email": "a@intelix.biz", "app_user_id": "a-1", "is_active": False}]))
    assert auth.handler({"action": "google_login", "email": "a@intelix.biz"})["status"] == 403


def test_auth_tambien_rechaza_dominios_ajenos(auth, monkeypatch):
    monkeypatch.setattr(auth, "pg", _Db([]))
    assert auth.handler({"action": "google_login", "email": "x@gmail.com"})["body"]["error"] == "domain_not_allowed"
