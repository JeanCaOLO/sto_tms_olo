"""Planificador: arma viajes sobre `orders` (eFlow ya ingestado) por CAPACIDAD
real del camión y los PERSISTE en route_plans/plan_trips/plan_stops.

Reemplaza el agrupamiento fijo de la demo: los pedidos de una zona se consolidan
en la flota propia (vehicles) por peso/volumen con margen legal CR, no por un
número fijo de paradas. Idempotente: re-planificar un día borra sus planes y los
reconstruye con la cola vigente (replan).
"""

from tms_common import pg

# Márgenes de seguridad (ver capacity-fit.ts / Decreto 31363-MOPT): el peso es
# límite legal, el volumen solo geometría de carga.
MARGEN_PESO = 0.85
MARGEN_VOLUMEN = 0.95
# Tope operativo de paradas por viaje (una jornada no hace infinitas entregas);
# knob de calibración, sobre todo para zonas de pedidos sin peso (EPA).
MAX_PARADAS = 25

_ORDERS = """
SELECT o.id, o.order_number, o.delivery_city, o.delivery_zone,
       o.delivery_latitude::float AS lat, o.delivery_longitude::float AS lng,
       o.total_weight::float AS weight, o.total_volume::float AS volume, o.priority,
       fc.name AS customer_name
FROM orders o
LEFT JOIN final_customers fc ON fc.id = o.final_customer_id
WHERE o.organization_id = %s AND o.warehouse_id = %s
  AND o.eflow_id_expedicion IS NOT NULL
  AND o.wms_status = 'DISP' AND o.wms_situation = 'DISP'
  AND o.delivery_date = %s::date
ORDER BY COALESCE(o.delivery_zone, 'ZZZ'), o.priority NULLS LAST, o.total_weight DESC NULLS LAST
"""

_FLOTA = """
SELECT id, plate, capacity_weight::float AS cw, capacity_volume::float AS cv
FROM vehicles
WHERE organization_id = %s AND status = 'active' AND carrier_id IS NULL
ORDER BY capacity_weight DESC NULLS LAST
"""


def _empacar(pedidos: list[dict], flota: list[dict], vi: int) -> tuple[list[dict], int]:
    """Un viaje por pasada: llena el camión en turno con los pedidos que entren
    (peso+volumen+tope de paradas) y rota de camión. `vi` rota GLOBAL entre zonas
    para no asignar el mismo camión a dos viajes del día."""
    viajes: list[dict] = []
    restantes = list(pedidos)
    while restantes:
        veh = flota[vi % len(flota)]
        max_w, max_v = veh["cw"] * MARGEN_PESO, veh["cv"] * MARGEN_VOLUMEN
        dentro, fuera, w, v = [], [], 0.0, 0.0
        for o in restantes:
            ow, ov = o["weight"] or 0.0, o["volume"] or 0.0
            if len(dentro) < MAX_PARADAS and w + ow <= max_w and v + ov <= max_v:
                dentro.append(o); w += ow; v += ov
            else:
                fuera.append(o)
        if not dentro:  # un pedido solo excede el camión: va igual (la UI avisa)
            dentro, fuera = [restantes[0]], restantes[1:]
            w, v = dentro[0]["weight"] or 0.0, dentro[0]["volume"] or 0.0
        viajes.append({"veh": veh, "pedidos": dentro, "peso": round(w, 2), "volumen": round(v, 2)})
        restantes = fuera
        vi += 1
    return viajes, vi


def _borrar_plan_del_dia(run, org: str, warehouse: str, fecha: str) -> None:
    run("""DELETE FROM plan_stops WHERE trip_id IN (
             SELECT t.id FROM plan_trips t JOIN route_plans p ON p.id = t.plan_id
             WHERE p.organization_id=%s AND p.warehouse_id=%s AND p.plan_date=%s::date)""",
        [org, warehouse, fecha])
    run("""DELETE FROM plan_trips WHERE plan_id IN (
             SELECT id FROM route_plans WHERE organization_id=%s AND warehouse_id=%s AND plan_date=%s::date)""",
        [org, warehouse, fecha])
    run("DELETE FROM route_plans WHERE organization_id=%s AND warehouse_id=%s AND plan_date=%s::date",
        [org, warehouse, fecha])


def _agrupar_por_zona(pedidos: list[dict]) -> dict:
    zonas: dict = {}
    for o in pedidos:
        zonas.setdefault(o["delivery_zone"] or "S/R", []).append(o)
    return zonas


def construir_y_persistir(org: str, country: str, warehouse: str, fecha: str, created_by: str) -> str | None:
    """Planifica el día sobre orders y persiste. Devuelve el id del route_plan, o
    None si no hay pedidos ese día (en tal caso borra el plan previo, no deja uno vacío)."""
    pedidos = pg.query(_ORDERS, [org, warehouse, fecha])
    if not pedidos:
        pg.run_in_transaction(lambda run: _borrar_plan_del_dia(run, org, warehouse, fecha))
        return None
    flota = pg.query(_FLOTA, [org])
    if not flota:
        from tms_common.errors import HttpError
        raise HttpError(409, "No hay flota propia activa para planificar")

    def trabajo(run):
        _borrar_plan_del_dia(run, org, warehouse, fecha)
        plan = run("""INSERT INTO route_plans (organization_id, country_id, warehouse_id, plan_date, status, created_by)
                      VALUES (%s,%s,%s,%s::date,'confirmed',%s) RETURNING id""",
                   [org, country, warehouse, fecha, created_by])
        plan_id = plan[0]["id"]
        seq = 0
        vi = 0
        for zona, ped_zona in sorted(_agrupar_por_zona(pedidos).items()):
            viajes, vi = _empacar(ped_zona, flota, vi)
            for viaje in viajes:
                seq += 1
                veh = viaje["veh"]
                trip = run("""INSERT INTO plan_trips (plan_id, vehicle_id, delivery_zone, sequence_order,
                                 total_weight, total_volume, vehicle_plate, vehicle_capacity_weight,
                                 vehicle_capacity_volume, is_owned, status)
                              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,'pending') RETURNING id""",
                           [plan_id, veh["id"], zona, seq, viaje["peso"], viaje["volumen"],
                            veh["plate"], veh["cw"], veh["cv"]])
                trip_id = trip[0]["id"]
                for i, o in enumerate(viaje["pedidos"], start=1):
                    run("""INSERT INTO plan_stops (trip_id, order_id, stop_order, order_number, customer_name,
                             delivery_city, delivery_zone, latitude, longitude, weight, volume)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        [trip_id, o["id"], i, o["order_number"], o["customer_name"], o["delivery_city"],
                         o["delivery_zone"], o["lat"], o["lng"], o["weight"], o["volume"]])
        return plan_id

    return str(pg.run_in_transaction(trabajo))
