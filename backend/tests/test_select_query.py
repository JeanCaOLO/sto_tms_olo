import pytest

from conftest import load_stack_module
from tms_common.errors import HttpError


@pytest.fixture
def sq(fake_columns):
    return load_stack_module("data", "select_query")


def test_simple_select_with_filters_order_and_limit(sq):
    sql, params = sq.build_list_query(
        "drivers", "id, name", [["status", "eq", "active"], ["carrier_id", "in", ["a", "b"]]],
        {"column": "name", "ascending": False}, "10",
    )
    assert sql == (
        'SELECT t."id" AS "id", t."name" AS "name" FROM "drivers" t '
        'WHERE t."status" = %s AND t."carrier_id" IN (%s,%s) ORDER BY t."name" DESC LIMIT 10'
    )
    assert params == ["active", "a", "b"]


def test_embed_resolves_foreign_key_as_jsonb_subquery(sq):
    sql, _ = sq.build_list_query("drivers", "*, carrier:carriers(id, name)", [])
    assert 't.*' in sql
    assert 'FROM "carriers" e0 WHERE e0."id" = t."carrier_id"' in sql
    assert 'AS "carrier"' in sql


def test_nested_embed_uses_distinct_aliases(sq):
    sql, _ = sq.build_list_query("drivers", "id, carriers(name, countries(name))", [])
    assert "e0" in sql and "e1" in sql


def test_empty_in_matches_nothing_and_is_null(sq):
    sql, params = sq.build_list_query("drivers", "*", [["id", "in", []], ["status", "is", None]])
    assert 'WHERE FALSE AND t."status" IS NULL' in sql
    assert params == []


def test_count_query(sq):
    sql, params = sq.build_count_query("drivers", [["status", "neq", "x"]])
    assert sql == 'SELECT count(*)::int AS count FROM "drivers" t WHERE t."status" <> %s'
    assert params == ["x"]


@pytest.mark.parametrize("select", ["name; DROP TABLE drivers", "id,", "carriers(id"])
def test_malformed_select_is_rejected(sq, select):
    with pytest.raises(HttpError) as err:
        sq.build_list_query("drivers", select, [])
    assert err.value.status == 400


def test_unknown_column_is_rejected_before_reaching_sql(sq):
    with pytest.raises(HttpError, match="Columna desconocida"):
        sq.build_list_query("drivers", "*", [["password", "eq", "x"]])


def test_unknown_operator_and_bad_limit(sq):
    with pytest.raises(HttpError, match="operador no soportado"):
        sq.build_list_query("drivers", "*", [["id", "like", "%a%"]])
    with pytest.raises(HttpError, match="limit inválido"):
        sq.build_list_query("drivers", "*", [], None, "5; DROP")


def test_embed_without_foreign_key_is_rejected(sq):
    with pytest.raises(HttpError, match="No hay foreign key"):
        sq.build_list_query("drivers", "roles(id)", [])
