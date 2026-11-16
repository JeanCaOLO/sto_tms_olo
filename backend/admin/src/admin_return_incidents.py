"""Novedad de recepción: solo explicación. La aceptación interna queda fuera de este flujo."""
import re
import uuid

from tms_common import audit, pg
from tms_common.errors import HttpError
from tms_common.event import path_param, query_params
from tms_common.responses import json_response

import admin_returns as returns
import admin_return_incidents_sql as sql

EXPLANATION_LIMIT = 1000


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
