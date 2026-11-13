"""Motor de ruteo con OR-Tools (ADR-005). Mismo contrato que `motor_ruteo`:
`asignar_y_ordenar(pedidos, flota) -> viajes`.

Qué decide el solver y qué no:
- El GRUPO se respeta (regla de negocio, igual que la heurística): mayoreo por zona,
  una tienda EPA en viaje directo. Dentro de cada grupo el solver decide qué pedidos
  comparten camión y en qué orden se visitan, minimizando viajes y kilómetros de
  carretera (ida y vuelta al depósito) con la matriz de `matriz_distancias`.
- Capacidad: peso y volumen con los márgenes de `motor_ruteo`, y el tope de paradas.
- Flota: toda la flota está disponible en cada grupo, pero cada viaje que un camión
  ya hizo en el día encarece volver a usarlo (`COSTO_REUSO_KM`): las vueltas se
  reparten entre camiones y un camión solo repite cuando no queda otro que sirva.
- Un pedido que no cabe en ningún camión va solo en el más grande (la UI avisa).

Determinismo (el replan horario no debe reordenar lo que no cambió): búsqueda local
hasta el óptimo local, SIN metaheurística con reloj. El tiempo límite es solo una
red de seguridad: si se alcanza, la corrida se descarta y `motor_ruteo` usa la
heurística. Se detecta midiendo el reloj, no por el status: OR-Tools devuelve
"óptimo local no alcanzado" también en problemas triviales que cerró al instante.
ponytail: mejor calidad = GUIDED_LOCAL_SEARCH, pero su corte por tiempo da resultados
distintos según la máquina; activarlo exige no re-resolver días sin cambios.
"""

import logging
import math
import time

import matriz_distancias
import motor_ruteo
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from ruta_geo import SEDE_CR, Sede

# Costo de abrir un viaje, en km equivalentes: un camión más solo se justifica si
# ahorra más que esto en recorrido. ponytail: valor de arranque; calibrar con el
# costo real por tipo de camión (tablas de costeo) en la fase 6.
COSTO_FIJO_VIAJE_KM = 300
# Recargo por cada viaje que el camión ya hizo en el día: muy por encima de cualquier
# ahorro de recorrido, para que repetir camión sea el último recurso (sin jornada del
# chofer en el modelo, dos vueltas largas podrían no caber en un día).
COSTO_REUSO_KM = 5000
PENALIZACION_SIN_ASIGNAR_M = 10**9  # dejar un pedido fuera cuesta más que cualquier ruta
TIEMPO_LIMITE_S = 10
ESCALA = 100  # peso (kg) y volumen (m³) a enteros de centésimas

_CON_SOLUCION = (routing_enums_pb2.RoutingSearchStatus.ROUTING_SUCCESS,
                 routing_enums_pb2.RoutingSearchStatus.ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED,
                 routing_enums_pb2.RoutingSearchStatus.ROUTING_OPTIMAL)

log = logging.getLogger(__name__)


def _tiene_coords(o: dict) -> bool:
    return o["lat"] is not None and o["lng"] is not None


def _resolver(pedidos: list[dict], camiones: list[dict], usos: list[int],
              sede: Sede = SEDE_CR) -> tuple[list[tuple[int, list[dict]]], list[dict], dict]:
    """Un VRP: reparte `pedidos` entre `camiones` (un viaje cada uno, como mucho);
    `usos[v]` = viajes que el camión v ya hizo en el día (encarece repetirlo).
    Devuelve (rutas, sin_asignar, datos): rutas = [(índice del camión, pedidos en orden)]."""
    # Nodo 0 = depósito. Un pedido sin coordenadas se ubica en el depósito: ocupa
    # capacidad pero no mueve la ruta (luego va al final del viaje).
    puntos = [sede.deposito] + [(o["lat"], o["lng"]) if _tiene_coords(o) else sede.deposito for o in pedidos]
    matriz = matriz_distancias.construir(puntos, region=sede.region)
    metros = [[round(km * 1000) for km in fila] for fila in matriz["km"]]

    manager = pywrapcp.RoutingIndexManager(len(puntos), len(camiones), 0)
    routing = pywrapcp.RoutingModel(manager)
    routing.SetArcCostEvaluatorOfAllVehicles(routing.RegisterTransitMatrix(metros))

    def dimension(nombre: str, demanda: list[int], capacidad: list[int]) -> None:
        routing.AddDimensionWithVehicleCapacity(routing.RegisterUnaryTransitVector(demanda), 0, capacidad, True, nombre)

    dimension("peso", [0] + [math.ceil((o["weight"] or 0.0) * ESCALA) for o in pedidos],
              [math.floor(c["cw"] * motor_ruteo.MARGEN_PESO * ESCALA) for c in camiones])
    dimension("volumen", [0] + [math.ceil((o["volume"] or 0.0) * ESCALA) for o in pedidos],
              [math.floor(c["cv"] * motor_ruteo.MARGEN_VOLUMEN * ESCALA) for c in camiones])
    dimension("paradas", [0] + [1] * len(pedidos), [motor_ruteo.MAX_PARADAS] * len(camiones))

    for v, c in enumerate(camiones):  # + capacidad en metros: a igual recorrido, el camión más chico que alcance
        routing.SetFixedCostOfVehicle((COSTO_FIJO_VIAJE_KM + usos[v] * COSTO_REUSO_KM) * 1000 + round(c["cw"]), v)
    for nodo in range(1, len(puntos)):
        routing.AddDisjunction([manager.NodeToIndex(nodo)], PENALIZACION_SIN_ASIGNAR_M)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GREEDY_DESCENT
    params.time_limit.FromSeconds(TIEMPO_LIMITE_S)
    inicio = time.monotonic()
    solucion = routing.SolveWithParameters(params)
    segundos = time.monotonic() - inicio
    if solucion is None or routing.status() not in _CON_SOLUCION or segundos >= TIEMPO_LIMITE_S:
        raise RuntimeError(f"OR-Tools no cerró la búsqueda (status={routing.status()}, "
                           f"{segundos:.1f} s, pedidos={len(pedidos)})")

    rutas, asignados, total_m = [], set(), 0
    for v in range(len(camiones)):
        nodos, i = [], solucion.Value(routing.NextVar(routing.Start(v)))
        while not routing.IsEnd(i):
            nodos.append(manager.IndexToNode(i))
            i = solucion.Value(routing.NextVar(i))
        if not nodos:
            continue
        # Las paradas se numeran desde la más cercana al depósito, pero la matriz de
        # carretera no es simétrica: solo se invierte si el recorrido no se alarga.
        if metros[0][nodos[-1]] < metros[0][nodos[0]] and _largo(metros, nodos[::-1]) <= _largo(metros, nodos):
            nodos.reverse()
        total_m += _largo(metros, nodos)
        asignados.update(nodos)
        en_ruta = [pedidos[n - 1] for n in nodos]
        rutas.append((v, [o for o in en_ruta if _tiene_coords(o)] + [o for o in en_ruta if not _tiene_coords(o)]))
    sin_asignar = [o for n, o in enumerate(pedidos, start=1) if n not in asignados]
    return rutas, sin_asignar, {"km": total_m / 1000, "fuente": matriz["fuente"]}


def _largo(metros: list[list[int]], nodos: list[int]) -> int:
    """Metros de depósito → nodos (en ese orden) → depósito."""
    return metros[0][nodos[0]] + sum(metros[a][b] for a, b in zip(nodos, nodos[1:])) + metros[nodos[-1]][0]


def _viaje(zona: str, camion: dict, pedidos: list[dict], sede: Sede) -> dict:
    return motor_ruteo.viaje(zona, camion, pedidos,
                             round(sum(o["weight"] or 0.0 for o in pedidos), 2),
                             round(sum(o["volume"] or 0.0 for o in pedidos), 2), sede)


def asignar_y_ordenar(pedidos: list[dict], flota: list[dict], sede: Sede = SEDE_CR) -> list[dict]:
    viajes: list[dict] = []
    usos = [0] * len(flota)  # viajes de cada camión en el día (compartido entre grupos)
    km, fuentes = 0.0, set()
    for zona, grupo in sorted(motor_ruteo.agrupar_por_zona(pedidos).items()):
        pendientes = grupo
        while pendientes:  # más de una pasada solo si el grupo necesita más viajes que camiones hay
            rutas, resto, datos = _resolver(pendientes, flota, usos, sede)
            if not rutas:  # ningún camión puede con lo que queda: el primero va solo en el más grande
                mayor = max(range(len(flota)), key=lambda i: (flota[i]["cw"], -usos[i]))
                rutas, resto = [(mayor, [pendientes[0]])], pendientes[1:]
            else:
                km += datos["km"]
                fuentes.add(datos["fuente"])
            viajes += [_viaje(zona, flota[v], peds, sede) for v, peds in rutas]
            for v, _ in rutas:
                usos[v] += 1
            pendientes = resto
    log.info("motor ortools: %s pedidos → %s viajes, %.1f km (matriz: %s)",
             len(pedidos), len(viajes), km, ",".join(sorted(fuentes)) or "-")
    return viajes
