"""Caché de permisos del tarifador: ahorra las queries de cada request sin dejar datos viejos más de TTL.
Vive en backend/tarifas (tarifas_perms); la capa común no cambia."""

import pytest

from conftest import http_event, load_stack_module, make_permissions
from tms_common import permissions


@pytest.fixture
def real(monkeypatch):
    perms = load_stack_module("tarifas", "tarifas_perms")
    perms.clear_cache()
    monkeypatch.setenv("TMS_PERMS_TTL_SECONDS", "30")
    calls = []
    clock = {"now": 1000.0}

    def fake_for_event(event):
        calls.append(event["requestContext"]["authorizer"]["lambda"]["sub"])
        return make_permissions(is_admin=True)

    monkeypatch.setattr(permissions, "for_event", fake_for_event)
    monkeypatch.setattr(perms.time, "monotonic", lambda: clock["now"])
    yield perms, calls, clock
    perms.clear_cache()


def event(user_id="u1"):
    return http_event("GET /x", user={"id": user_id, "email": "a@b.c"})


def test_second_request_inside_ttl_does_not_query(real):
    perms, calls, _ = real
    perms.for_event(event())
    perms.for_event(event())
    assert calls == ["u1"]


def test_expires_after_ttl(real):
    perms, calls, clock = real
    perms.for_event(event())
    clock["now"] += 31
    perms.for_event(event())
    assert calls == ["u1", "u1"]


def test_each_user_has_own_entry(real):
    perms, calls, _ = real
    perms.for_event(event("u1"))
    perms.for_event(event("u2"))
    assert calls == ["u1", "u2"]


@pytest.mark.parametrize("value", ["0", "", "abc"])
def test_off_by_default_or_invalid(real, monkeypatch, value):
    perms, calls, _ = real
    monkeypatch.setenv("TMS_PERMS_TTL_SECONDS", value)
    perms.for_event(event())
    perms.for_event(event())
    assert calls == ["u1", "u1"]


def test_errors_are_not_cached(real, monkeypatch):
    perms, calls, _ = real
    from tms_common.errors import HttpError

    def boom(event):
        calls.append("x")
        raise HttpError(403, "inactivo")

    monkeypatch.setattr(permissions, "for_event", boom)
    for _ in range(2):
        with pytest.raises(HttpError):
            perms.for_event(event())
    assert calls == ["x", "x"]
