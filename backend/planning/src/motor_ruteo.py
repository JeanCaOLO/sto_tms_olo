"""Motor de ruteo del planificador: decide qué pedidos van en qué camión y en qué
orden. Módulo PURO (sin base de datos): recibe pedidos y flota, devuelve viajes.

Es la costura para cambiar de motor (ADR-005): `plan_builder` solo conoce
`asignar_y_ordenar`. Hay dos motores con el mismo contrato y la variable de entorno
`MOTOR_RUTEO` elige:
- `heuristico` (por defecto): agrupar por zona, empaque voraz por capacidad y
  vecino más cercano en línea recta. Es además el RESPALDO del otro.
- `ortools`: solver de `motor_ortools` sobre distancias de carretera. Si falla por
  lo que sea (librería ausente, tiempo límite, error), ese día se arma con la
  heurística: el planificador nunca se queda sin plan.

Contrato:
- pedido: dict con `weight`, `volume`, `lat`, `lng`, `delivery_zone`,
  `customer_name`, `customer_type` (los demás campos pasan intactos).
- vehículo: dict con `id`, `plate`, `cw` (kg) y `cv` (m³).
- sede (`ruta_geo.Sede`): depósito del almacén y región del mapa (CR, VN). Por
  defecto, Costa Rica (San José).
- viaje devuelto: `{"zona", "veh", "pedidos", "peso", "volumen", "lead"}`, con
  `pedidos` YA en orden de visita y `lead` = días de anticipación de la salida.
- Los viajes salen en el orden en que se numeran. Mismo input → mismo output
  (el replan horario depende de eso).
"""

import logging
import os

from ruta_geo import SEDE_CR, Sede, lead_time_dias, ordenar_por_ruta

MOTOR_HEURISTICO = "heuristico"
MOTOR_ORTOOLS = "ortools"
log = logging.getLogger(__name__)

# Márgenes de seguridad (ver capacity-fit.ts / Decreto 31363-MOPT): el peso es
# límite legal, el volumen solo geometría de carga.
MARGEN_PESO = 0.85
MARGEN_VOLUMEN = 0.95
# Tope de pedidos por viaje: ~16/camión (reunión 2026-10-13 Ana/Eduardo: "~16
# pedidos y ~80% capacidad; al superar → nuevo viaje"). Antes 25 → salían de 24.
MAX_PARADAS = 16


def clave(o: dict) -> str:
    """Mayoreo (Cofersa) se consolida por zona; una TIENDA (EPA) va en viaje directo,
    camión lleno a una sola tienda, así que su grupo es la tienda (reunión 2026-11-03)."""
    return o["customer_name"] if o.get("customer_type") == "TIENDA" else (o["delivery_zone"] or "S/R")


def agrupar_por_zona(pedidos: list[dict]) -> dict:
    zonas: dict = {}
    for o in pedidos:
        zonas.setdefault(clave(o), []).append(o)
    return zonas


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


def viaje(zona: str, veh: dict | None, pedidos: list[dict], peso: float, volumen: float,
          sede: Sede = SEDE_CR) -> dict:
    """El viaje del contrato, con `pedidos` YA en orden de visita."""
    return {"zona": zona, "veh": veh, "pedidos": pedidos, "peso": peso, "volumen": volumen,
            "lead": lead_time_dias(pedidos, sede.deposito)}


def cerrar_viaje(zona: str, veh: dict | None, pedidos: list[dict], peso: float, volumen: float,
                 sede: Sede = SEDE_CR) -> dict:
    """Viaje con las paradas ordenadas por vecino más cercano (heurística y cliente retira)."""
    return viaje(zona, veh, ordenar_por_ruta(pedidos, sede.deposito), peso, volumen, sede)


def motor_activo() -> str:
    return MOTOR_ORTOOLS if os.environ.get("MOTOR_RUTEO", "").strip().lower() == MOTOR_ORTOOLS else MOTOR_HEURISTICO


def asignar_y_ordenar(pedidos: list[dict], flota: list[dict], sede: Sede = SEDE_CR,
                      usos_previos: dict | None = None, informe: dict | None = None,
                      costos: dict | None = None) -> list[dict]:
    """Reparte los pedidos de UN día en viajes con camión y ordena sus paradas.
    Requiere flota si hay pedidos; los 'cliente retira' no entran aquí (no se rutean).
    `usos_previos` = {vehicle_id: viajes que ese camión ya tiene el día} (congelados u otras
    compañías del almacén): se usan primero los camiones libres. `informe`, si se pasa, recibe
    qué motor corrió de verdad (`motor`), la fuente de la matriz, los km y el error del solver.
    `costos` (fase 6) solo lo usa el solver. La heurística no usa terceros: solo flota propia."""
    informe = {} if informe is None else informe
    informe.update({"motor_solicitado": motor_activo(), "motor": MOTOR_HEURISTICO, "error": None})
    if pedidos and motor_activo() == MOTOR_ORTOOLS:
        try:
            import motor_ortools  # tardío: la librería pesa y solo se carga si el motor está activo
            viajes = motor_ortools.asignar_y_ordenar(pedidos, flota, sede, usos_previos, informe, costos)
            informe["motor"] = MOTOR_ORTOOLS
            return viajes
        except Exception as e:  # noqa: BLE001 — cualquier fallo del solver cae al respaldo, con rastro en el log
            log.exception("motor ortools falló con %s pedidos: se usa la heurística", len(pedidos))
            informe["error"] = f"{type(e).__name__}: {e}"[:500]
    propios = [c for c in flota if c.get("propio", True)]  # la heurística no usa terceros
    return heuristico(pedidos, propios or flota, sede, usos_previos)


def heuristico(pedidos: list[dict], flota: list[dict], sede: Sede = SEDE_CR,
               usos_previos: dict | None = None) -> list[dict]:
    """Motor de siempre: agrupar por zona, empaque voraz y vecino más cercano. Con
    `usos_previos`, la rotación empieza por los camiones que todavía no tienen viaje."""
    if usos_previos:
        previos = {str(k): n for k, n in usos_previos.items()}  # UUID de la base o texto: se comparan como texto
        flota = sorted(flota, key=lambda c: previos.get(str(c["id"]), 0))  # estable: respeta el orden de capacidad
    viajes: list[dict] = []
    vi = 0
    for zona, ped_zona in sorted(agrupar_por_zona(pedidos).items()):
        empacados, vi = _empacar(ped_zona, flota, vi)
        viajes += [cerrar_viaje(zona, e["veh"], e["pedidos"], e["peso"], e["volumen"], sede) for e in empacados]
    return viajes


def estado() -> dict:
    """Diagnóstico (acción `estado_ruteo` de la Lambda): qué motor está activo y si el
    solver carga y resuelve en este entorno (aunque el interruptor esté apagado)."""
    try:
        import motor_ortools
        import ortools
        prueba = motor_ortools.asignar_y_ordenar(
            [{"id": i, "delivery_zone": "PRUEBA", "customer_name": "prueba", "customer_type": "MAYOREO",
              "weight": 10.0, "volume": 0.1, "lat": 9.9 + i * 0.01, "lng": -84.0} for i in range(3)],
            [{"id": "prueba", "plate": "PRUEBA", "cw": 1000.0, "cv": 10.0}])
        solver = {"ok": True, "version": ortools.__version__, "viajes": len(prueba)}
    except Exception as e:  # noqa: BLE001 — es un diagnóstico: el error se devuelve, no se lanza
        solver = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    return {"motor": motor_activo(), "ortools": solver}
