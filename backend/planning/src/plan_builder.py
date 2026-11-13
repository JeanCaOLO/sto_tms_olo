"""Planificador: arma viajes sobre `orders` (eFlow ya ingestado) por CAPACIDAD
real del camión y los PERSISTE en route_plans/plan_trips/plan_stops.

Reemplaza el agrupamiento fijo de la demo: los pedidos de una zona se consolidan
en la flota propia (vehicles) por peso/volumen con margen legal CR, no por un
número fijo de paradas. Idempotente: re-planificar un día borra lo no liberado y lo
reconstruye con la cola vigente (replan); lo ya liberado a eFlow no se toca.

Qué pedido va en qué camión y en qué orden lo decide `motor_ruteo`; aquí solo se
leen los pedidos y la flota, y se persiste lo que el motor devuelve.
"""

import uuid

import motor_ruteo
import recolectas
import viajes_liberados
from ruta_geo import sede_de
from tms_common import pg

# Coordenadas del punto de entrega por defecto del cliente destino (tbl_delivery_points →
# tbl_addresses). Respaldo cuando eFlow no trae lat/lng en el pedido: Venezuela carga sus
# ~20 mil puntos geocodificados por CSV (backend/local/ingest_delivery_points.py).
PUNTO_ENTREGA = """
LEFT JOIN LATERAL (
  SELECT a.latitude, a.longitude FROM tbl_delivery_points dp JOIN tbl_addresses a ON a.id = dp.address_id
  WHERE dp.final_customer_id = o.final_customer_id AND dp.active AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
  ORDER BY dp.is_default DESC, dp.created_at LIMIT 1) pe ON true
"""

_ORDERS = """
SELECT o.id, o.order_number, o.delivery_city, o.delivery_zone,
       COALESCE(o.delivery_latitude, pe.latitude)::float AS lat,
       COALESCE(o.delivery_longitude, pe.longitude)::float AS lng,
       o.total_weight::float AS weight, o.total_volume::float AS volume, o.priority,
       o.final_customer_id, fc.name AS customer_name, fc.customer_type, o.es_cliente_retira,
       o.eflow_id_compania, o.eflow_id_almacen, o.eflow_id_sucursal, o.eflow_id_expedicion
FROM tbl_orders o
LEFT JOIN tbl_final_customers fc ON fc.id = o.final_customer_id
""" + PUNTO_ENTREGA + """
WHERE o.organization_id = %s AND o.warehouse_id = %s AND o.customer_id = %s
  AND o.eflow_id_expedicion IS NOT NULL
  AND o.wms_status = 'DISP' AND o.wms_situation = 'DISP'
  AND o.delivery_date = %s::date AND """ + viajes_liberados.fuera_de_congelados("o.id") + """
ORDER BY COALESCE(o.delivery_zone, 'ZZZ'), o.priority NULLS LAST, o.total_weight DESC NULLS LAST
"""

# Flota propia DEL PAÍS del almacén: un plan de Venezuela no usa camiones de Costa Rica.
# Propia = sin transportista, o de un transportista marcado como flota propia
# (tbl_carriers.is_flota_propia, sql/08): la pantalla de vehículos siempre pide
# transportista. País = el del vehículo (sql/66) o, si no lo tiene, el del transportista.
_FLOTA = """
SELECT v.id, v.plate, v.capacity_weight::float AS cw, v.capacity_volume::float AS cv
FROM tbl_vehicles v
LEFT JOIN tbl_carriers ca ON ca.id = v.carrier_id
WHERE v.organization_id = %s AND v.status = 'active'
  AND (v.carrier_id IS NULL OR ca.is_flota_propia)
  AND v.capacity_weight IS NOT NULL AND v.capacity_volume IS NOT NULL
  AND COALESCE(v.country_id, ca.country_id) = (SELECT w.country_id FROM tbl_warehouses w WHERE w.id = %s)
ORDER BY v.capacity_weight DESC, v.plate
"""

# Sede del almacén: de dónde salen los camiones y con qué mapa se miden (ruta_geo.sede_de).
_ALMACEN = """
SELECT w.latitude::float AS lat, w.longitude::float AS lng, c.code AS pais
FROM tbl_warehouses w JOIN tbl_countries c ON c.id = w.country_id
WHERE w.id = %s
"""


def sede_del_almacen(warehouse: str, pedidos: list[dict]):
    filas = pg.query(_ALMACEN, [warehouse])
    a = filas[0] if filas else {"lat": None, "lng": None, "pais": None}
    return sede_de(a["pais"], a["lat"], a["lng"], pedidos)


# dispatch_date = salida = delivery_date - lead_time_days; lead nunca es NULL, siempre hay salida.
_UPD_ORDER = "UPDATE tbl_orders SET numero_viaje=%s, lead_time_days=%s, dispatch_date=(delivery_date - make_interval(days => %s))::date, planning_run_id=%s, updated_at=now() WHERE id=%s"
# Write-back del nº de viaje a la tabla espejo de eFlow. UPDATE (no insert): solo sobre
# la fila ya espejada (no crea parciales). NUMEROVIAJEWMH es bigint (nº de viaje sin guion).
_UPD_SIM = """
UPDATE sim_expedicionescabecera SET "NUMEROVIAJEWMH"=%s, planning_run_id=%s, escrito_en=now()
WHERE "IDALMACEN"=%s AND "IDCOMPANIA"=%s AND "IDSUCURSAL"=%s AND "IDEXPEDICION"=%s"""
_INS_TRIP = """
INSERT INTO tbl_plan_trips (plan_id, vehicle_id, delivery_zone, sequence_order, total_weight, total_volume,
  vehicle_plate, vehicle_capacity_weight, vehicle_capacity_volume, is_owned, status, numero_viaje, lead_time_days)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending',%s,%s) RETURNING id"""
# Zona especial: los pedidos "cliente retira" no van a viaje con camión.
ZONA_RETIRA = "RETIRA"
_INS_STOP = """
INSERT INTO tbl_plan_stops (trip_id, order_id, stop_order, order_number, customer_name, delivery_city,
  delivery_zone, latitude, longitude, weight, volume, es_cliente_retira)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""


def _persistir_viaje(run, plan_id: str, seq: int, viaje: dict, run_id: str, numero: str) -> None:
    """Inserta un viaje del motor (paradas ya en orden de visita) y estampa el
    resultado en orders + eFlow sim."""
    veh = viaje["veh"]  # None = viaje de cliente-retira (sin camión)
    zona, lead = viaje["zona"], viaje["lead"]
    wmh = int(numero.replace("-", ""))  # NUMEROVIAJEWMH es bigint (nº de viaje sin guion)
    trip_id = run(_INS_TRIP, [plan_id, veh["id"] if veh else None, zona, seq, viaje["peso"], viaje["volumen"],
                              veh["plate"] if veh else None, veh["cw"] if veh else None,
                              veh["cv"] if veh else None, veh is not None, numero, lead])[0]["id"]
    for i, o in enumerate(viaje["pedidos"], start=1):
        run(_INS_STOP, [trip_id, o["id"], i, o["order_number"], o["customer_name"], o["delivery_city"],
                        o["delivery_zone"], o["lat"], o["lng"], o["weight"], o["volume"], o["es_cliente_retira"]])
        run(_UPD_ORDER, [numero, lead, lead, run_id, o["id"]])  # denormaliza al pedido para el OMS (lead dos veces: col + intervalo)
        if o["eflow_id_expedicion"]:  # write-back simulado del nº de viaje a eFlow
            run(_UPD_SIM, [wmh, run_id, o["eflow_id_almacen"], o["eflow_id_compania"],
                           o["eflow_id_sucursal"], o["eflow_id_expedicion"]])


def _viaje_retira(pedidos: list[dict], sede) -> dict:
    """Pseudo-viaje de cliente-retira: sin camión, sin capacidad; solo la lista."""
    peso = round(sum(o["weight"] or 0.0 for o in pedidos), 2)
    vol = round(sum(o["volume"] or 0.0 for o in pedidos), 2)
    return motor_ruteo.cerrar_viaje(ZONA_RETIRA, None, pedidos, peso, vol, sede)


def construir_y_persistir(org: str, country: str, warehouse: str, customer: str, fecha: str, created_by: str) -> str | None:
    """Planifica un día de UN cliente (compañía) sobre orders y persiste. Devuelve el
    id del route_plan, o None si no hay pedidos (borra el plan previo, no deja vacío).
    Los pedidos 'cliente retira' NO se rutean: van a una zona RETIRA sin camión."""
    pedidos = pg.query(_ORDERS, [org, warehouse, customer, fecha])
    if not pedidos:
        pg.run_in_transaction(lambda run: (viajes_liberados.borrar_no_liberado(run, org, warehouse, customer, fecha),
                                           recolectas.agendar(run, org, warehouse, customer, fecha, motor_ruteo.clave)))  # viajes congelados
        return None
    retira = [o for o in pedidos if o["es_cliente_retira"]]
    normales = [o for o in pedidos if not o["es_cliente_retira"]]
    flota = pg.query(_FLOTA, [org, warehouse])
    if not flota and normales:
        from tms_common.errors import HttpError
        raise HttpError(409, "No hay flota propia activa del país del almacén para planificar")
    sede = sede_del_almacen(warehouse, pedidos)

    run_id = str(uuid.uuid4())
    # Nº de viaje = fecha-compañía-secuencia: cada compañía numera su plan desde 001, y sin la
    # compañía Cofersa y EPA repetían el mismo nº el mismo día (el OMS libera por nº de viaje).
    cia = pg.query("SELECT external_code FROM tbl_customers WHERE id = %s", [customer])[0]["external_code"]
    prefijo = f"{fecha.replace('-', '')}-{cia or '0000'}"  # ponytail: '0000' si la compañía no tiene código eFlow (VE aún no)

    def trabajo(run):
        viajes_liberados.borrar_no_liberado(run, org, warehouse, customer, fecha)
        plan_id, seq = viajes_liberados.plan_vigente(run, org, warehouse, customer, fecha)  # seq sigue tras los congelados
        if plan_id is None:
            plan_id = run("""INSERT INTO tbl_route_plans (organization_id, country_id, warehouse_id, customer_id, plan_date, status, created_by)
                             VALUES (%s,%s,%s,%s,%s::date,'confirmed',%s) RETURNING id""",
                          [org, country, warehouse, customer, fecha, created_by])[0]["id"]
        for viaje in motor_ruteo.asignar_y_ordenar(normales, flota, sede):
            seq += 1
            _persistir_viaje(run, plan_id, seq, viaje, run_id, f"{prefijo}-{seq:03d}")
        recolectas.agendar(run, org, warehouse, customer, fecha, motor_ruteo.clave)  # devoluciones → paradas collection
        if retira:  # grupo de cliente-retira: zona RETIRA, sin camión
            seq += 1
            _persistir_viaje(run, plan_id, seq, _viaje_retira(retira, sede), run_id, f"{prefijo}-{seq:03d}")
        return plan_id

    return str(pg.run_in_transaction(trabajo))
