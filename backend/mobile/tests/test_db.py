"""Reconexión de `db.transaction()` ante una conexión reutilizada que llegó muerta (Lambda congelada)."""

import pg8000.dbapi
import pytest

from mobile_api import db
from mobile_api.errors import HttpError


class FakeConnection:
    def __init__(self, dead_on: str | None = None):
        self.dead_on, self.sql = dead_on, []

    def cursor(self):
        return FakeCursor(self)


class FakeCursor:
    description = None

    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, params):
        if self.connection.dead_on and sql.startswith(self.connection.dead_on):
            raise pg8000.dbapi.InterfaceError("network error")
        self.connection.sql.append(sql)

    def close(self):
        pass


@pytest.fixture
def connections(monkeypatch):
    made = []

    def connect(*_args, **_kwargs):
        made.append(FakeConnection())
        return made[-1]

    monkeypatch.setattr(db, "connect", connect)
    return made


def test_reconnects_when_reused_connection_is_dead_before_begin(monkeypatch, connections):
    monkeypatch.setattr(db, "_connection", FakeConnection(dead_on="BEGIN"))
    with db.transaction() as run:
        run("INSERT 1")
    assert connections[0].sql == ["BEGIN", "INSERT 1", "COMMIT"]
    assert db._connection is connections[0]


def test_connection_lost_mid_transaction_is_dropped_and_retryable(monkeypatch, connections):
    monkeypatch.setattr(db, "_connection", FakeConnection(dead_on="INSERT"))
    with pytest.raises(HttpError) as err:
        with db.transaction() as run:
            run("INSERT 1")
    assert err.value.status == 503
    assert db._connection is None


def test_socket_timeout_below_lambda_timeout():
    assert db.SOCKET_TIMEOUT_SECONDS < 20
