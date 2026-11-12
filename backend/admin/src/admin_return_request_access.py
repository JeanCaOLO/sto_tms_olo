"""Acceso de solicitudes. Solo usa relaciones incluidas en admin y filtra en SQL."""
from tms_common import pg, permissions
from tms_common.errors import HttpError
import admin_return_requests_sql as sql

CLIENT_MODULE = 'devoluciones_solicitud'
OPERATOR_MODULE = 'devoluciones'


def identity(caller):
    rows = pg.query(sql.CUSTOMER_SQL, [caller.app_user_id])
    if not rows:
        raise HttpError(401, 'No existe app_user para este usuario autenticado.')
    return rows[0]


def client_context(event, action):
    caller = permissions.for_event(event)
    if action is None:
        action = 'view' if caller.can(CLIENT_MODULE, 'view') else 'create'
    caller.require(CLIENT_MODULE, action)
    row = identity(caller)
    if not row['customer_id'] or row['customer_organization_id'] != row['organization_id']:
        raise HttpError(403, 'Tu usuario no tiene una empresa valida asignada; contacta al administrador.')
    return caller, row


def client(event, action):
    caller, row = client_context(event, action)
    return caller, str(row['organization_id']), str(row['customer_id'])


def operator(event, action):
    caller = permissions.for_event(event)
    caller.require(OPERATOR_MODULE, action)
    return caller, str(identity(caller)['organization_id'])


def operator_filter(caller, org):
    statement, params = sql.OPERATOR_SCOPE_SQL, [org, caller.app_user_id]
    if caller.country_filter is not None:
        statement += sql.COUNTRY_SCOPE_SQL
        params.append(list(caller.country_filter))
    return statement, params


def read_filter(event):
    # Si puede leer la bandeja se aplica ese alcance, incluso siendo administrador.
    caller = permissions.for_event(event)
    if caller.can(OPERATOR_MODULE, 'view'):
        org = str(identity(caller)['organization_id'])
        return operator_filter(caller, org)
    caller, org, company = client(event, 'view')
    return sql.CLIENT_SCOPE_SQL, [org, company, caller.app_user_id]
