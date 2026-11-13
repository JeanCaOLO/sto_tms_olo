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


def can_choose_company(caller):
    return caller.is_admin or (caller.role_name or '').strip().casefold() == 'gerente'


def creation_companies(event, *, company=None, country=None):
    caller = permissions.for_event(event)
    if not can_choose_company(caller):
        raise HttpError(403, 'Solo superusuarios y gerentes pueden elegir la empresa de una solicitud.')
    if not caller.can(CLIENT_MODULE, 'create'):
        caller.require(OPERATOR_MODULE, 'create')
    org = str(identity(caller)['organization_id'])
    access, values = operator_filter(caller, org)
    # El catálogo usa c/w directamente; conserva exactamente el predicado de scope de la bandeja.
    access = access.replace('r.organization_id', 'c.organization_id').replace('r.customer_id', 'c.id')
    filters = ''
    if company:
        filters += ' AND c.id = %s::uuid'
        values.append(company)
    if country:
        filters += ' AND COALESCE(c.country_id,w.country_id) = %s::uuid'
        values.append(country)
    return caller, org, pg.query(sql.CREATION_COMPANIES_SQL.format(access=access, filters=filters), values)


def creator(event, selected_company=None):
    caller = permissions.for_event(event)
    if selected_company is not None and can_choose_company(caller):
        import uuid
        try:
            company = str(uuid.UUID(selected_company))
        except (ValueError, TypeError, AttributeError) as error:
            raise HttpError(400, 'La empresa debe ser un UUID válido.') from error
        caller, org, rows = creation_companies(event, company=company)
        if not rows:
            raise HttpError(403, 'La empresa no está dentro de tu alcance autorizado.')
        return caller, org, str(rows[0]['id'])
    # Cliente conserva empresa fija, sin confiar en un customer_id enviado por el navegador.
    return client(event, 'create')


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
