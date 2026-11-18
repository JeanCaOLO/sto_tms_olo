"""Novedad de recepción: el registro es solo explicación; la resolución cierra la revisión con historial."""
import re
import uuid

from tms_common import audit, pg
from tms_common.errors import HttpError
from tms_common.event import path_param, query_params
from tms_common.responses import json_response

import admin_returns as returns
import admin_return_incidents_sql as sql

EXPLANATION_LIMIT = 1000
OUTCOMES = ('accepted','restored')


def _return(run, caller, org, return_id, *, lock=False):
    scope, extra = returns._scope(caller, 's.country_id')
    statement = returns.sql.RETURN_SQL.format(scope=scope)
    if lock:
        statement += ' FOR UPDATE OF rt'
    rows = run(statement, [return_id,org,*extra])
    if not rows:
        raise HttpError(404,'Devolución no encontrada.')
    return rows[0]


def record(event):
    caller,org = returns._caller(event,'edit')
    return_id = path_param(event,'returnId')
    body = returns._body(event)
    explanation = body.get('explanation')
    if not isinstance(explanation,str) or not 1 <= len(explanation.strip()) <= EXPLANATION_LIMIT:
        raise HttpError(400,'Escriba la novedad (entre 1 y 1000 caracteres).')
    explanation = explanation.strip()
    try:
        key = str(uuid.UUID(body.get('idempotency_key')))
    except (ValueError,TypeError,AttributeError) as error:
        raise HttpError(400,'La novedad requiere una clave idempotente UUID.') from error
    identifier = str(uuid.uuid5(uuid.NAMESPACE_URL,f'return-incident:{org}:{return_id}:{caller.app_user_id}:{key}'))
    created = False
    with pg.transaction() as run:
        current = _return(run,caller,org,return_id,lock=True)
        previous = run(sql.FIND_ATTEMPT_SQL,[org,return_id,caller.app_user_id,key])
        if previous:
            incident = previous[0]
            if incident['explanation'] != explanation:
                raise HttpError(409,'La clave de la novedad ya se usó con otro texto.')
        else:
            if current['status'] not in ('pending','approved','received','completed'):
                raise HttpError(409,'La devolución ya está en revisión o su estado no permite registrar una novedad.')
            incident = run(sql.INSERT_INCIDENT_SQL,[identifier,org,return_id,key,explanation,caller.app_user_id,
                current['status'],current.get('received_quantity'),current.get('received_condition')])[0]
            if not run(sql.MARK_REVIEW_SQL,[return_id,org]):
                raise HttpError(409,'La devolución cambió de estado; recargue e inténtelo de nuevo.')
            audit.record(event,'update',module_key=returns.MODULE,entity_table='tbl_returns',entity_id=return_id,
                         metadata={'action':'registrar-novedad','incident_id':identifier})
            created = True
    return json_response(201 if created else 200,{'data':{'incident':incident,
        'trip':returns._trip(caller,org,str(current['route_id']))},'error':None})


def _quantity(value):
    if isinstance(value,bool) or not isinstance(value,int) or not 0 <= value <= 2147483647:
        raise HttpError(400,'received_quantity debe ser un entero entre 0 y 2147483647.')
    return value


def _resolution_target(outcome, incident, current, body):
    """Estado y cantidades finales. Aceptar exige cantidad y condición explícitas si no hubo recepción previa."""
    if outcome == 'restored':
        return (incident['previous_status'],incident['previous_received_quantity'],
                incident['previous_received_condition'],False)
    status = incident['previous_status'] if incident['previous_status'] in ('received','completed') else 'received'
    quantity = _quantity(body['received_quantity']) if 'received_quantity' in body else current.get('received_quantity')
    condition = body.get('condition',current.get('received_condition'))
    if quantity is None or condition is None:
        raise HttpError(400,'Para aceptar la diferencia indique received_quantity y condition.')
    if condition not in returns.CONDITIONS:
        raise HttpError(400,f'condition debe ser una de: {", ".join(returns.CONDITIONS)}')
    return status,quantity,condition,incident['previous_status'] not in ('received','completed')


def resolve(event):
    """Saca una devolución de Novedades. Lo hacen los mismos roles que pueden recibir (permiso edit)."""
    caller,org = returns._caller(event,'edit')
    return_id = path_param(event,'returnId')
    body = returns._body(event)
    outcome = body.get('outcome')
    if outcome not in OUTCOMES:
        raise HttpError(400,f'outcome debe ser uno de: {", ".join(OUTCOMES)}')
    note = body.get('note')
    if not isinstance(note,str) or not 1 <= len(note.strip()) <= EXPLANATION_LIMIT:
        raise HttpError(400,'Escriba el motivo de la resolución (entre 1 y 1000 caracteres).')
    note = note.strip()
    try:
        key = str(uuid.UUID(body.get('idempotency_key')))
    except (ValueError,TypeError,AttributeError) as error:
        raise HttpError(400,'La resolución requiere una clave idempotente UUID.') from error
    try:
        incident_id = str(uuid.UUID(body.get('incident_id')))
    except (ValueError,TypeError,AttributeError) as error:
        raise HttpError(400,'La resolución requiere el incident_id de la novedad revisada.') from error
    receipt = {}
    if 'received_quantity' in body:
        receipt['received_quantity'] = _quantity(body['received_quantity'])
    if 'condition' in body:
        if body['condition'] not in returns.CONDITIONS:
            raise HttpError(400,f'condition debe ser una de: {", ".join(returns.CONDITIONS)}')
        receipt['condition'] = body['condition']
    if outcome == 'restored' and receipt:
        raise HttpError(400,'Restaurar conserva la recepción anterior; no admite cantidad ni condición nuevas.')
    identifier = str(uuid.uuid5(uuid.NAMESPACE_URL,f'return-incident-resolution:{org}:{return_id}:{caller.app_user_id}:{key}'))
    created = False
    updated = None
    with pg.transaction() as run:
        current = _return(run,caller,org,return_id,lock=True)
        previous = run(sql.FIND_RESOLUTION_SQL,[org,return_id,caller.app_user_id,key])
        if previous:
            resolution = previous[0]
            if (resolution['outcome'] != outcome or resolution['note'] != note
                    or str(resolution['incident_id']) != incident_id
                    or receipt.get('received_quantity',resolution['resulting_received_quantity']) != resolution['resulting_received_quantity']
                    or receipt.get('condition',resolution['resulting_received_condition']) != resolution['resulting_received_condition']):
                raise HttpError(409,'La clave de la resolución ya se usó con otros datos.')
        else:
            if current['status'] != 'in_review':
                raise HttpError(409,'La devolución no está en revisión; no hay novedad que resolver.')
            rows = run(sql.LATEST_INCIDENT_SQL,[org,return_id])
            if not rows:
                raise HttpError(409,'La devolución no tiene novedades registradas.')
            incident = rows[0]
            if str(incident['id']) != incident_id:
                raise HttpError(409,'La novedad cambió; recargue y revise la novedad actual antes de resolverla.')
            status,quantity,condition,receives_now = _resolution_target(outcome,incident,current,body)
            resolution = run(sql.INSERT_RESOLUTION_SQL,[identifier,org,return_id,incident['id'],key,outcome,note,
                caller.app_user_id,status,quantity,condition])[0]
            updated = run(sql.LEAVE_REVIEW_SQL,[status,quantity,condition,receives_now,receives_now,
                caller.app_user_id,return_id,org])
            if not updated:
                raise HttpError(409,'La devolución cambió de estado; recargue e inténtelo de nuevo.')
            audit.record(event,'update',module_key=returns.MODULE,entity_table='tbl_returns',entity_id=return_id,
                         metadata={'action':'resolver-novedad','outcome':outcome,'resolution_id':identifier})
            created = True
    return json_response(201 if created else 200,{'data':{'resolution':resolution,
        'return':updated[0] if updated else None,
        'trip':returns._trip(caller,org,str(current['route_id']))},'error':None})


def history(event):
    caller,org = returns._caller(event,'view')
    return_id = path_param(event,'returnId')
    _return(pg.query,caller,org,return_id)
    params = query_params(event)
    def number(name,default,minimum,maximum):
        raw = params.get(name,str(default))
        if not isinstance(raw,str) or not re.fullmatch(r'[0-9]{1,9}',raw) or not minimum <= int(raw) <= maximum:
            raise HttpError(400,f'{name} debe ser un entero entre {minimum} y {maximum}.')
        return int(raw)
    limit,offset = number('limit',25,1,100),number('offset',0,0,1_000_000)
    rows = pg.query(sql.HISTORY_SQL,[org,return_id,limit+1,offset])
    return returns._ok({'items':rows[:limit],'has_more':len(rows)>limit,'limit':limit,'offset':offset})
