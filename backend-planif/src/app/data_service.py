"""Casos de uso de la API genérica de datos (/api/data/{table}).

Orquesta la lista blanca del dominio (schema/relations/table_modules) con la
matriz de permisos (`lib/tms_common.permissions`), los builders de SQL
(adaptador outbound) y el port de ejecución (`DataRepo`). No conoce HTTP: recibe
el `event` (para resolver permisos/usuario) y parámetros ya parseados, y
devuelve el cuerpo `{data, error, [count]}` del contrato.
"""

from __future__ import annotations

from adapters.outbound.aurora.mutations import (build_delete_query, build_insert_query,
                                                build_update_query)
from adapters.outbound.aurora.select_query import build_count_query, build_list_query
from domain.data.schema import assert_table
from domain.data.table_modules import (APP_USERS_READERS, SHARED_READ, module_for,
                                        read_modules)
from ports.data_repo import DataRepo
from lib.tms_common import permissions
from lib.tms_common.errors import HttpError
from lib.tms_common.event import auth_user

# Solo se escriben por /api/v1/admin (atómico y restringido a administradores);
# por la API genérica cualquier usuario logueado podría cambiarse el rol.
ADMIN_MANAGED = frozenset({"app_users", "roles", "user_scopes"})


class DataService:
    def __init__(self, repo: DataRepo) -> None:
        self._repo = repo

    def _table(self, table_raw: str) -> str:
        self._repo.ensure_schema()
        return assert_table(table_raw)

    def _writable_table(self, event: dict, table_raw: str, action: str, values: object = None) -> str:
        table = self._table(table_raw)
        if table in ADMIN_MANAGED:
            raise HttpError(403, f'"{table}" se administra desde Configuración (/api/v1/admin)')
        caller = permissions.for_event(event)
        caller.require(module_for(table), action)
        self._require_allowed_countries(caller, values)
        return table

    @staticmethod
    def _require_allowed_countries(caller: "permissions.Permissions", values: object) -> None:
        """No se puede escribir una fila de un país que el rol no ve."""
        allowed = caller.country_filter
        rows = values if isinstance(values, list) else [values]
        if allowed is None:
            return
        for row in rows:
            country = row.get("country_id") if isinstance(row, dict) else None
            if country is not None and str(country) not in allowed:
                raise HttpError(403, "Tu rol no tiene acceso a ese país.")

    @staticmethod
    def _readable(event: dict, table: str, caller: "permissions.Permissions", filters: list) -> list:
        """Filtros a aplicar; 403 si el rol no ve ningún módulo que lea la tabla."""
        if caller.is_admin or table in SHARED_READ:
            return filters
        if table == "app_users":
            if any(caller.can(m, "view") for m in APP_USERS_READERS):
                return filters
            return [*filters, ["auth_user_id", "eq", auth_user(event)["id"]]]
        if not any(caller.can(m, "view") for m in read_modules(table)):
            raise HttpError(403, f'Tu rol no tiene permiso para ver "{table}".')
        return filters

    @staticmethod
    def _shape(rows: list[dict], params: dict) -> dict:
        data: object = rows
        if params.get("single") == "true":
            if len(rows) != 1:
                raise HttpError(406, "Se esperaba exactamente una fila")
            data = rows[0]
        elif params.get("maybeSingle") == "true":
            data = rows[0] if rows else None
        result = {"data": data, "error": None}
        if params.get("count") == "exact":
            result["count"] = len(rows)
        return result

    # GET /api/data/{table}
    def list_rows(self, event: dict, table_raw: str, params: dict, filters: list, order: dict | None) -> dict:
        table = self._table(table_raw)
        caller = permissions.for_event(event)
        filters = self._readable(event, table, caller, filters or [])
        countries = caller.country_filter
        if params.get("head") == "true":
            sql, args = build_count_query(table, filters, countries)
            total = self._repo.run(sql, args)[0]["count"]
            return {"data": None, "count": total, "error": None}
        sql, args = build_list_query(table, params.get("select") or "*", filters, order,
                                     params.get("limit"), countries)
        return self._shape(self._repo.run(sql, args), params)

    def _mutation_response(self, rows: list[dict], body: dict) -> dict:
        return {"data": rows if body.get("returning") else None, "error": None}

    # POST /api/data/{table}
    def insert_rows(self, event: dict, table_raw: str, body: dict) -> dict:
        table = self._writable_table(event, table_raw, "create", body.get("values"))
        sql, args = build_insert_query(table, body.get("values"))
        return self._mutation_response(self._repo.run(sql, args), body)

    # PATCH /api/data/{table}
    def update_rows(self, event: dict, table_raw: str, body: dict) -> dict:
        table = self._writable_table(event, table_raw, "edit", body.get("values"))
        sql, args = build_update_query(table, body.get("values"), body.get("filters"))
        return self._mutation_response(self._repo.run(sql, args), body)

    # DELETE /api/data/{table}
    def delete_rows(self, event: dict, table_raw: str, body: dict) -> dict:
        table = self._writable_table(event, table_raw, "delete")
        sql, args = build_delete_query(table, body.get("filters"))
        return self._mutation_response(self._repo.run(sql, args), body)
