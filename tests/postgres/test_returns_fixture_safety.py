"""Valida el destino permitido sin abrir conexiones ni requerir un servidor PostgreSQL."""
import importlib.util
from pathlib import Path

import pytest


@pytest.fixture
def harness():
    path=Path(__file__).with_name('test_returns_concurrency.py')
    spec=importlib.util.spec_from_file_location('returns_fixture_safety_target',path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('dsn',[
    'postgresql://user@database.example/tms_returns_test_codex',
    'postgresql://user@127.0.0.1/tms_olo',
    'postgresql://user@localhost/postgres',
    'sqlite://user@localhost/tms_returns_test_codex',
    'postgresql://user@127.0.0.1/tms_returns_test_codex?options=extra',
    'postgresql://user@127.0.0.1/tms_returns_test_codex#extra',
])
def test_rejects_remote_shared_or_ambiguous_destinations(harness,monkeypatch,dsn):
    monkeypatch.setattr(harness,'DSN',dsn)
    with pytest.raises(ValueError):
        harness.Database()


@pytest.mark.parametrize('host',['localhost','127.0.0.1','[::1]'])
def test_accepts_only_named_local_test_database_without_connecting(harness,monkeypatch,host):
    monkeypatch.setattr(harness,'DSN',f'postgresql://user@{host}:5432/tms_returns_test_codex')
    database=harness.Database()
    assert database.options['database']=='tms_returns_test_codex'
    assert database.schema.startswith('returns_codex_')
    assert database.connections==[]
