"""Comparación en sombra de los motores de ruteo (fase 4).

Para cada (compañía, día) que el replan rearmaría hoy, arma los viajes con la
heurística y con OR-Tools sobre los MISMOS pedidos y la MISMA flota, y los mide con
la MISMA matriz (OSRM si responde). SOLO LEE: no persiste nada, no toca eFlow ni el
plan vigente. Se invoca a mano: `{"accion": "comparar_motores"}` en la Lambda.

Con `"dias_atras": N` compara además los días YA planificados de las últimas N
fechas (hasta hoy): toma los pedidos de entrega que quedaron en esos planes, con su
peso, volumen y coordenadas de hoy. Sirve para tener más de un día de evidencia.

Qué se mide por motor: viajes, camiones distintos, km de carretera (depósito →
paradas → depósito; los pedidos sin coordenadas no suman km), paradas por viaje,
ocupación de peso y si el plan respeta capacidad y tope.
"""

import logging
import time

import matriz_distancias
import motor_ruteo
import plan_builder
import replan
import tiempo_salida
from plan_builder import PUNTO_ENTREGA
from ruta_geo import SEDE_CR, Sede
from tms_common import pg

# Mismos días que replanifica el replan (ventana desde mañana), por almacén y compañía.
_DIAS = """
SELECT DISTINCT o.organization_id::text AS org, o.warehouse_id::text AS wh, o.customer_id::text AS cust,
       c.name AS compania, o.delivery_date::text AS d
FROM tbl_orders o JOIN tbl_customers c ON c.id = o.customer_id
WHERE o.eflow_id_expedicion IS NOT NULL AND o.wms_status = 'DISP' AND o.wms_situation = 'DISP'
  AND o.delivery_date >  (now() AT TIME ZONE 'America/Costa_Rica')::date
  AND o.delivery_date <= (now() AT TIME ZONE 'America/Costa_Rica')::date + %s::int
ORDER BY d, compania"""

_DIAS_HISTORICOS = """
SELECT DISTINCT p.organization_id::text AS org, p.warehouse_id::text AS wh, p.customer_id::text AS cust,
       c.name AS compania, p.plan_date::text AS d
FROM tbl_route_plans p JOIN tbl_customers c ON c.id = p.customer_id
WHERE p.plan_date >  (now() AT TIME ZONE 'America/Costa_Rica')::date - %s::int
  AND p.plan_date <= (now() AT TIME ZONE 'America/Costa_Rica')::date
ORDER BY d, compania"""

# Mismas columnas que plan_builder._ORDERS, pero de los pedidos de entrega de un plan ya armado.
_PEDIDOS_HISTORICOS = """
SELECT o.id, o.order_number, o.delivery_city, o.delivery_zone,
       COALESCE(o.delivery_latitude, pe.latitude)::float AS lat,
       COALESCE(o.delivery_longitude, pe.longitude)::float AS lng,
       o.total_weight::float AS weight, o.total_volume::float AS volume, o.priority,
       o.final_customer_id, fc.name AS customer_name, fc.customer_type, o.es_cliente_retira,
       o.eflow_id_compania, o.eflow_id_almacen, o.eflow_id_sucursal, o.eflow_id_expedicion
FROM tbl_orders o
LEFT JOIN tbl_final_customers fc ON fc.id = o.final_customer_id
""" + PUNTO_ENTREGA + """
WHERE o.id IN (SELECT s.order_id FROM tbl_plan_stops s
               JOIN tbl_plan_trips t ON t.id = s.trip_id JOIN tbl_route_plans p ON p.id = t.plan_id
               WHERE p.organization_id = %s AND p.warehouse_id = %s AND p.customer_id = %s
                 AND p.plan_date = %s::date AND COALESCE(s.stop_type, 'delivery') = 'delivery')
ORDER BY COALESCE(o.delivery_zone, 'ZZZ'), o.priority NULLS LAST, o.total_weight DESC NULLS LAST
"""

log = logging.getLogger(__name__)


def _con_coords(o: dict) -> bool:
    return o["lat"] is not None and o["lng"] is not None


def medir(viajes: list[dict], km_entre) -> dict:
    """Métricas de un plan. `km_entre(a, b)` da los km de carretera entre dos ids (None = depósito)."""
    km = 0.0
    for v in viajes:
        ids = [None] + [o["id"] for o in v["pedidos"] if _con_coords(o)] + [None]
        km += sum(km_entre(a, b) for a, b in zip(ids, ids[1:]))
    paradas = [len(v["pedidos"]) for v in viajes]
    ocupacion = [v["peso"] / v["veh"]["cw"] for v in viajes if v["veh"] and v["veh"]["cw"]]
    excedidos = sum(1 for v in viajes if len(v["pedidos"]) > 1 and (
        len(v["pedidos"]) > motor_ruteo.MAX_PARADAS
        or v["peso"] > v["veh"]["cw"] * motor_ruteo.MARGEN_PESO + 1e-6
        or v["volumen"] > v["veh"]["cv"] * motor_ruteo.MARGEN_VOLUMEN + 1e-6))
    return {"viajes": len(viajes), "camiones": len({v["veh"]["id"] for v in viajes if v["veh"]}),
            "km": round(km, 1), "paradas_prom": round(sum(paradas) / len(paradas), 1) if paradas else 0,
            "paradas_max": max(paradas, default=0),
            "ocupacion_peso_prom": round(sum(ocupacion) / len(ocupacion), 2) if ocupacion else None,
            "viajes_fuera_de_capacidad": excedidos}


def comparar_dia(pedidos: list[dict], flota: list[dict], sede: Sede = SEDE_CR) -> dict:
    """Corre los dos motores sobre los mismos pedidos (sin cliente retira) y los mide igual."""
    normales = [o for o in pedidos if not o["es_cliente_retira"]]
    con = [o for o in normales if _con_coords(o)]
    matriz = matriz_distancias.construir([sede.deposito] + [(o["lat"], o["lng"]) for o in con], region=sede.region)
    indice = {None: 0, **{o["id"]: i for i, o in enumerate(con, start=1)}}

    def km_entre(a, b):
        return matriz["km"][indice[a]][indice[b]]

    res = {"pedidos": len(normales), "cliente_retira": len(pedidos) - len(normales),
           "sin_coordenadas": len(normales) - len(con),
           "sin_peso": sum(1 for o in normales if not o["weight"]),
           "sin_volumen": sum(1 for o in normales if not o["volume"]),
           "camiones_flota": len(flota), "matriz": matriz["fuente"],
           "region": sede.region, "deposito": sede.origen}
    if not normales or not flota:
        return res
    t = time.perf_counter()
    res["heuristico"] = medir(motor_ruteo.heuristico(normales, flota, sede), km_entre)
    res["heuristico"]["segundos"] = round(time.perf_counter() - t, 2)
    t = time.perf_counter()
    viajes_o = None
    try:
        import motor_ortools
        viajes_o = motor_ortools.asignar_y_ordenar(normales, flota, sede)
        res["ortools"] = medir(viajes_o, km_entre)
    except Exception as e:  # noqa: BLE001 — la comparación reporta el fallo, no lo esconde ni lo lanza
        log.exception("comparación: OR-Tools falló con %s pedidos", len(normales))
        res["ortools"] = {"error": f"{type(e).__name__}: {e}"}
    res["ortools"]["segundos"] = round(time.perf_counter() - t, 2)
    h, o = res["heuristico"], res["ortools"]
    if "km" in o and h["km"]:
        res["ahorro_km_pct"] = round((1 - o["km"] / h["km"]) * 100, 1)
    if viajes_o and matriz["fuente"] == "osrm":
        res["tn"] = sombra_tn(viajes_o, lambda pid: matriz["min"][0][indice[pid]])
    return res


def sombra_tn(viajes: list[dict], minutos_desde_deposito) -> dict:
    """Fase 5 en sombra: por viaje, T-n actual (línea recta) vs T-n por carretera con
    `TN_MIN_POR_DIA`, y los minutos de manejo a la parada más lejana (para calibrar)."""
    por_dia = tiempo_salida.min_por_dia()
    detalle, cambian, pedidos_cambian = [], 0, 0
    for v in viajes:
        mins = [minutos_desde_deposito(o["id"]) for o in v["pedidos"] if _con_coords(o)]
        if not mins:
            continue
        maximo = max(mins)
        carretera = tiempo_salida.lead_por_minutos(maximo, por_dia)
        detalle.append([v["lead"], round(maximo, 1), carretera])
        if carretera != v["lead"]:
            cambian += 1
            pedidos_cambian += len(v["pedidos"])
    return {"min_por_dia": por_dia, "viajes": len(detalle), "viajes_cambian": cambian,
            "pedidos_cambian": pedidos_cambian, "detalle": detalle}


def _sumar(dias: list[dict], motor: str) -> dict:
    medidos = [d[motor] for d in dias if "km" in d.get(motor, {})]
    return {"dias": len(medidos), "viajes": sum(m["viajes"] for m in medidos),
            "km": round(sum(m["km"] for m in medidos), 1),
            "viajes_fuera_de_capacidad": sum(m["viajes_fuera_de_capacidad"] for m in medidos),
            "segundos": round(sum(m["segundos"] for m in medidos), 2)}


def comparar_todo(dias_atras: int = 0) -> dict:
    """Los (compañía, día) de la ventana del replan y, con `dias_atras`, los ya
    planificados de esas fechas. Devuelve el detalle y los totales."""
    dias = []
    flotas: dict = {}
    fuentes = [("ventana", _DIAS, [replan.HORIZONTE_DIAS], plan_builder._ORDERS)]
    if dias_atras > 0:
        fuentes.append(("historico", _DIAS_HISTORICOS, [dias_atras], _PEDIDOS_HISTORICOS))
    for origen, sql_dias, params, sql_pedidos in fuentes:
        for r in pg.query(sql_dias, params):
            if (r["org"], r["wh"]) not in flotas:
                flotas[(r["org"], r["wh"])] = pg.query(plan_builder._FLOTA, [r["org"], r["wh"]])
            pedidos = pg.query(sql_pedidos, [r["org"], r["wh"], r["cust"], r["d"]])
            if not pedidos:
                continue
            sede = plan_builder.sede_del_almacen(r["wh"], pedidos)
            dias.append({"origen": origen, "dia": r["d"], "compania": r["compania"], "almacen": r["wh"],
                         **comparar_dia(pedidos, flotas[(r["org"], r["wh"])], sede)})
    comparables = [d for d in dias if "km" in d.get("heuristico", {}) and "km" in d.get("ortools", {})]
    h, o = _sumar(comparables, "heuristico"), _sumar(comparables, "ortools")
    tn = [d["tn"] for d in dias if "tn" in d]
    total = {"dias_comparados": len(comparables), "heuristico": h, "ortools": o,
             "ahorro_km_pct": round((1 - o["km"] / h["km"]) * 100, 1) if h["km"] else None,
             "dias_con_error_ortools": sum(1 for d in dias if "error" in d.get("ortools", {})),
             "tn_carretera": {"min_por_dia": tiempo_salida.min_por_dia(),
                              "viajes": sum(t["viajes"] for t in tn),
                              "viajes_cambian": sum(t["viajes_cambian"] for t in tn),
                              "pedidos_cambian": sum(t["pedidos_cambian"] for t in tn)}}
    log.info("comparación de motores: %s", total)
    return {"total": total, "dias": dias}
