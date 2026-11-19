"""Recolectas: el planificador agenda las devoluciones abiertas como paradas
`collection` en un viaje del día que ya pasa por ese cliente o su zona.

Reunión 2026-11-05. v1 sencillo:
- Va en el viaje que ya entrega a ese mismo cliente; si no hay, en uno de su zona
  (o de su tienda, si es EPA). Si ningún viaje del día pasa por ahí, la devolución
  queda sin agendar y se reintenta en el siguiente día que se planifique.
- La parada se pone justo después de las entregas a ese cliente; si no hay, al final.
- No ocupa capacidad: son 1 a 3 artículos y el camión ya bajó carga.
  ponytail: sin peso/volumen de la devolución; agregarlo cuando haya devoluciones grandes.
- El pedido original (order_id) da dirección y coordenadas; no se toca.

Contrato v2 de Devoluciones (sql/77, docs/devoluciones/ENTREGA_PLANIFICACION_BD_V2.md): las
solicitudes aprobadas nuevas salen de `vw_return_collection_candidates` y se reservan con
`assign_return_collection_v2`, que fija peso/volumen/coordenadas en la parada y valida
capacidad. Cada intento va en un SAVEPOINT: si falla, se deshace solo esa parada y se
registra la evaluación (`planning.no_candidate` / `planning.failed`), no el plan entero.
"""

import uuid

import pg8000.dbapi

_SOLTAR = """
UPDATE tbl_returns r SET pickup_date = NULL, updated_at = now()
FROM tbl_orders o
WHERE o.id = r.order_id AND r.organization_id = %s AND o.warehouse_id = %s AND o.customer_id = %s
  AND r.pickup_date = %s::date AND NOT EXISTS (SELECT 1 FROM tbl_plan_stops s WHERE s.return_id = r.id)"""

# Viajes con camión del día (los liberados también: la recolecta no va a eFlow).
# delivery_zone del viaje = su grupo (zona, o la tienda si es EPA).
_VIAJES = """
SELECT t.id AS trip_id, t.delivery_zone AS clave, array_agg(o.final_customer_id) AS clientes
FROM tbl_plan_trips t
JOIN tbl_route_plans pl ON pl.id = t.plan_id
JOIN tbl_plan_stops s ON s.trip_id = t.id AND s.stop_type = 'delivery'
JOIN tbl_orders o ON o.id = s.order_id
WHERE pl.organization_id = %s AND pl.warehouse_id = %s AND pl.customer_id = %s AND pl.plan_date = %s::date
  AND t.vehicle_id IS NOT NULL AND t.status = 'pending'
GROUP BY t.id, t.delivery_zone, t.sequence_order
ORDER BY t.sequence_order"""

_ABIERTAS = """
SELECT r.id AS return_id, r.return_number, o.id AS order_id, o.final_customer_id, o.delivery_zone, o.delivery_city,
       o.delivery_latitude AS lat, o.delivery_longitude AS lng, fc.name AS customer_name, fc.customer_type
FROM tbl_returns r
JOIN tbl_orders o ON o.id = r.order_id
LEFT JOIN tbl_final_customers fc ON fc.id = o.final_customer_id
WHERE r.organization_id = %s AND o.warehouse_id = %s AND o.customer_id = %s
  AND COALESCE(r.status, 'pending') IN ('pending', 'approved')
  AND (r.pickup_date IS NULL OR r.pickup_date = %s::date)
  AND NOT EXISTS (SELECT 1 FROM tbl_plan_stops s WHERE s.return_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM tbl_return_collection_results cr WHERE cr.return_id = r.id)  -- ya recogida por v2
ORDER BY r.created_at"""

# Posición: tras la última entrega a ese cliente en el viaje; si no hay, al final.
_POSICION = """
SELECT COALESCE(max(s.stop_order) FILTER (WHERE o.final_customer_id = %s), max(s.stop_order), 0) AS pos
FROM tbl_plan_stops s JOIN tbl_orders o ON o.id = s.order_id WHERE s.trip_id = %s"""
_CORRER = "UPDATE tbl_plan_stops SET stop_order = stop_order + 1 WHERE trip_id = %s AND stop_order > %s"
_INS = """
INSERT INTO tbl_plan_stops (trip_id, order_id, stop_order, order_number, customer_name, delivery_city,
  delivery_zone, latitude, longitude, weight, volume, es_cliente_retira, stop_type, return_id)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL,false,'collection',%s)"""
_AGENDAR = "UPDATE tbl_returns SET pickup_date = %s::date, updated_at = now() WHERE id = %s"

# v2: candidatas del alcance del plan (el país lo valida la función contra el viaje).
_V2_CANDIDATAS = """
SELECT c.request_id, c.order_id, r.request_number, (c.snapshot->>'final_customer_id')::uuid AS final_customer_id,
       c.snapshot->>'final_customer_name' AS customer_name, c.snapshot->>'city' AS delivery_city,
       c.snapshot->>'zone_name' AS delivery_zone, fc.customer_type
FROM vw_return_collection_candidates c
JOIN tbl_return_requests r ON r.id = c.request_id
LEFT JOIN tbl_final_customers fc ON fc.id = (c.snapshot->>'final_customer_id')::uuid
WHERE c.organization_id = %s AND c.warehouse_id = %s AND c.customer_id = %s
ORDER BY c.request_id"""
_V2_ASIGNAR = "SELECT assign_return_collection_v2(%s,%s,%s,%s,%s,%s)"
_V2_EVALUAR = "SELECT record_return_collection_evaluation_v2(%s,%s,%s,%s,%s,%s)"
_REINTENTABLES = {"40P01", "40001"}  # deadlock/serialización: que reintente la transacción entera


def _en_savepoint(run, trabajo) -> str | None:
    """Corre `trabajo()` en un SAVEPOINT. Error de dominio → deshace solo eso y devuelve el mensaje."""
    run("SAVEPOINT recolecta_v2", [])
    try:
        trabajo()
    except pg8000.dbapi.DatabaseError as err:
        detalle = err.args[0] if err.args and isinstance(err.args[0], dict) else {}
        if detalle.get("C") in _REINTENTABLES:
            raise
        run("ROLLBACK TO SAVEPOINT recolecta_v2", [])
        return str(detalle.get("M") or err)[:1000]
    run("RELEASE SAVEPOINT recolecta_v2", [])
    return None


def _evaluar(run, org: str, request_id, actor: str, fecha: str, resultado: str, causa: str) -> None:
    """Evaluación idempotente: misma solicitud/día/resultado/causa = misma clave, sin evento duplicado
    en cada replan horario. ponytail: si falla el registro, se pierde la evaluación, no el plan."""
    op = uuid.uuid5(uuid.NAMESPACE_URL, f"tms-recolecta-v2:{request_id}:{fecha}:{resultado}:{causa}")
    _en_savepoint(run, lambda: run(_V2_EVALUAR, [org, str(request_id), actor, str(op), resultado, causa]))


def _agendar_v2(run, org: str, warehouse: str, customer: str, fecha: str, clave, actor: str, viajes: list[dict]) -> int:
    """Reserva cada solicitud v2 completa en un viaje del día que pase por su cliente o zona. Si la
    función rechaza un viaje (capacidad, magnitudes), prueba el siguiente compatible."""
    agendadas = 0
    for d in run(_V2_CANDIDATAS, [org, warehouse, customer]):
        compatibles = viajes_compatibles(d, viajes, clave)
        if not compatibles:
            _evaluar(run, org, d["request_id"], actor, fecha, "planning.no_candidate",
                     f"Sin viaje del {fecha} que pase por su cliente o zona")
            continue

        def reservar(trip_id, d=d):
            pos = run(_POSICION, [d["final_customer_id"], trip_id])[0]["pos"]
            run(_CORRER, [trip_id, pos])
            stop = run(_INS + " RETURNING id", [trip_id, d["order_id"], pos + 1, d["request_number"], d["customer_name"],
                                                d["delivery_city"], d["delivery_zone"], None, None, None])[0]["id"]
            run(_V2_ASIGNAR, [org, str(d["request_id"]), str(trip_id), str(stop), actor, str(uuid.uuid4())])

        error = None
        for trip_id in compatibles:
            error = _en_savepoint(run, lambda t=trip_id: reservar(t))
            if not error:
                agendadas += 1
                break
        if error:  # registra el motivo del último viaje probado
            _evaluar(run, org, d["request_id"], actor, fecha, "planning.failed", error)
    return agendadas


def viajes_compatibles(devolucion: dict, viajes: list[dict], clave) -> list[str]:
    """Viajes que entregan al mismo cliente y luego los de su grupo (zona o tienda), sin repetir."""
    mismos = [v["trip_id"] for v in viajes if devolucion["final_customer_id"] in (v["clientes"] or [])]
    grupo = clave(devolucion)
    return mismos + [v["trip_id"] for v in viajes if v["clave"] == grupo and v["trip_id"] not in mismos]


def elegir_viaje(devolucion: dict, viajes: list[dict], clave) -> str | None:
    """Viaje que entrega al mismo cliente; si no hay, el primero de su grupo (zona o tienda)."""
    return next(iter(viajes_compatibles(devolucion, viajes, clave)), None)


def agendar(run, org: str, warehouse: str, customer: str, fecha: str, clave, actor: str) -> int:
    """Mete las devoluciones abiertas en los viajes con camión del día (compañía `customer`).
    `clave(o)` = grupo del planificador (zona o tienda); `actor` = app_user del plan.
    Devuelve cuántas quedaron agendadas (históricas + v2)."""
    p = [org, warehouse, customer, fecha]
    run(_SOLTAR, p)  # las del día que perdieron su parada en el replan vuelven a estar libres
    viajes = run(_VIAJES, p)
    agendadas = 0
    for d in run(_ABIERTAS, p):
        trip_id = elegir_viaje(d, viajes, clave)
        if trip_id is None:
            continue
        pos = run(_POSICION, [d["final_customer_id"], trip_id])[0]["pos"]
        run(_CORRER, [trip_id, pos])
        run(_INS, [trip_id, d["order_id"], pos + 1, d["return_number"], d["customer_name"], d["delivery_city"],
                   d["delivery_zone"], d["lat"], d["lng"], d["return_id"]])
        run(_AGENDAR, [fecha, d["return_id"]])
        agendadas += 1
    return agendadas + _agendar_v2(run, org, warehouse, customer, fecha, clave, actor, viajes)
