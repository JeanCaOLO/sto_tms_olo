"""Productor durable y entrada autenticada de acuses; el consumidor de Planificación es externo."""
import json
from datetime import datetime

from tms_common import audit, pg
from tms_common.errors import HttpError

import admin_return_request_access as access
import admin_return_requests as requests
import admin_return_collection_sql as sql


def enqueue(run, request_id):
    if not run(sql.ENQUEUE_SQL, [request_id]):
        raise HttpError(409, 'No se pudo persistir el evento de la solicitud.')


def claim(event):
    caller, org = access.operator(event, 'edit')
    scope, values = access.request_operator_filter(caller, org)
    with pg.transaction() as run:
        run(sql.EXHAUST_SQL.format(access=scope), values)
        rows = run(sql.CLAIM_SQL.format(access=scope), values)
    return requests._ok(rows)


def retry(event):
    caller, org = access.operator(event, 'edit')
    with pg.transaction() as run:
        request = requests._request(event, run, access.request_operator_filter(caller, org), lock=True)
        rows = run(sql.RETRY_SQL, [request['id']])
        if not rows:
            raise HttpError(409, 'Solo se reintenta una entrega agotada.')
        audit.record(event, 'update', module_key='devoluciones', entity_table='tbl_return_request_outbox',
                     entity_id=str(rows[0]['id']), metadata={'action': 'retry_delivery'})
    return requests._ok({'event_id': str(rows[0]['id'])})


def accept(event):
    caller, org = access.operator(event, 'edit')
    body = requests._body(event)
    if body.get('schema_version') != 1 or isinstance(body.get('schema_version'), bool):
        raise HttpError(400, 'schema_version debe ser 1.')
    event_id = requests._uuid_param(body.get('event_id'), 'event_id')
    cause = requests._uuid_param(body.get('causation_id'), 'causation_id')
    kind = body.get('event_type')
    if kind not in ('planning.received','planning.no_candidate','planning.failed','planning.assigned'):
        raise HttpError(400, 'event_type de Planificación inválido.')
    try:
        when = datetime.fromisoformat(body['occurred_at'].replace('Z', '+00:00'))
        if when.tzinfo is None:
            raise ValueError()
    except (KeyError, TypeError, ValueError, AttributeError):
        raise HttpError(400, 'occurred_at debe incluir fecha y zona horaria.') from None
    with pg.transaction() as run:
        request = requests._request(event, run, access.request_operator_filter(caller, org), lock=True)
        outbox = run(sql.OUTBOX_SQL, [request['id']])
        if not outbox or str(outbox[0]['id']) != cause:
            raise HttpError(409, 'causation_id no corresponde a esta solicitud.')
        previous = run(sql.EVENT_SQL, [event_id])
        if previous:
            if previous[0]['payload'] != body or str(previous[0]['request_id']) != str(request['id']):
                raise HttpError(409, 'event_id ya se usó con otro contenido.')
            return requests._ok({'event_id': event_id, 'duplicate': True})
        if kind == 'planning.received':
            token = requests._uuid_param(body.get('lease_token'), 'lease_token')
            if not run(sql.ACK_SQL, [event_id, cause, token]):
                raise HttpError(409, 'Acuse sin lease vigente o ya confirmado.')
        elif outbox[0]['status'] != 'acknowledged':
            raise HttpError(409, 'Primero debe confirmarse la recepción del evento solicitado.')
        run(sql.INSERT_EVENT_SQL, [event_id,request['id'],cause,kind,json.dumps(body),caller.app_user_id,when])
        if kind == 'planning.assigned':
            _assign(run, request, body, event_id)
    return requests._ok({'event_id': event_id, 'duplicate': False}, 201)


def _assign(run, request, body, event_id):
    assignment = requests._uuid_param(body.get('assignment_id'), 'assignment_id')
    attempt = requests._uuid_param(body.get('attempt_id'), 'attempt_id')
    item = requests._uuid_param(body.get('request_item_id'), 'request_item_id')
    guide = requests._uuid_param(body.get('stop_id'), 'stop_id')
    route = requests._uuid_param(body.get('route_id'), 'route_id')
    quantity = body.get('assigned_quantity')
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity<=0:
        raise HttpError(400, 'assigned_quantity debe ser un entero positivo.')
    if not run(sql.ASSIGNMENT_GUIDE_SQL, [request['id'],guide,route]):
        raise HttpError(422, 'La parada no es una recolecta compatible con el pedido y la organización.')
    if run(sql.GUIDE_ORIGIN_SQL,[request['id'],guide]):
        raise HttpError(422, 'Una parada de recolecta no puede mezclar puntos operativos distintos.')
    run(sql.ROUTE_LOCK_SQL,[route,request['organization_id']])
    balance = run(sql.ASSIGNABLE_SQL, [request['id'],item])
    if not balance or quantity>balance[0]['remaining']:
        raise HttpError(409, 'La asignación supera el saldo no recogido de la solicitud.')
    run(sql.INSERT_ASSIGNMENT_SQL, [assignment,item,attempt,route,guide,quantity,event_id])
