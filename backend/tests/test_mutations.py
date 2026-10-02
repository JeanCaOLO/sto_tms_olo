import pytest

from conftest import load_stack_module
from tms_common.errors import HttpError


@pytest.fixture
def mut(fake_columns):
    return load_stack_module("data", "mutations")


def test_insert_multiple_rows_fills_missing_columns_with_null(mut):
    sql, params = mut.build_insert_query("drivers", [{"name": "A"}, {"name": "B", "status": "x"}])
    assert sql == 'INSERT INTO "drivers" ("name", "status") VALUES (%s,%s), (%s,%s) RETURNING *'
    assert params == ["A", None, "B", "x"]


def test_update_puts_set_params_before_where_params(mut):
    sql, params = mut.build_update_query("drivers", {"name": "N"}, [["id", "eq", "1"]])
    assert sql == 'UPDATE "drivers" SET "name" = %s WHERE "id" = %s RETURNING *'
    assert params == ["N", "1"]


def test_delete(mut):
    sql, params = mut.build_delete_query("drivers", [["id", "eq", "1"]])
    assert sql == 'DELETE FROM "drivers" WHERE "id" = %s RETURNING *'
    assert params == ["1"]


@pytest.mark.parametrize("call", [
    lambda m: m.build_update_query("drivers", {"name": "N"}, []),
    lambda m: m.build_delete_query("drivers", None),
])
def test_update_and_delete_without_filters_are_blocked(mut, call):
    with pytest.raises(HttpError, match="requiere al menos un filtro"):
        call(mut)


@pytest.mark.parametrize("values", [None, [], {}, [{}]])
def test_insert_without_values_is_rejected(mut, values):
    with pytest.raises(HttpError) as err:
        mut.build_insert_query("drivers", values)
    assert err.value.status == 400


def test_insert_unknown_column_is_rejected(mut):
    with pytest.raises(HttpError, match="Columna desconocida"):
        mut.build_insert_query("drivers", {"hacked": 1})
