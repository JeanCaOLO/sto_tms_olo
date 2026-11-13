"""Motor de ruteo del planificador: decide qué pedidos van en qué camión y en qué
orden. Módulo PURO (sin base de datos): recibe pedidos y flota, devuelve viajes.

Es la costura para cambiar de motor (ADR-005): `plan_builder` solo conoce
`asignar_y_ordenar`. Hoy la implementa la heurística de siempre (agrupar por zona,
empaque voraz por capacidad, vecino más cercano en línea recta); un solver
(OR-Tools/PyVRP) entra aquí respetando el mismo contrato, sin tocar la
persistencia ni el replan.

Contrato:
- pedido: dict con `weight`, `volume`, `lat`, `lng`, `delivery_zone`,
  `customer_name`, `customer_type` (los demás campos pasan intactos).
- vehículo: dict con `id`, `plate`, `cw` (kg) y `cv` (m³).
- viaje devuelto: `{"zona", "veh", "pedidos", "peso", "volumen", "lead"}`, con
  `pedidos` YA en orden de visita y `lead` = días de anticipación de la salida.
- Los viajes salen en el orden en que se numeran. Mismo input → mismo output
  (el replan horario depende de eso).
"""

from ruta_geo import lead_time_dias, ordenar_por_ruta

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


def cerrar_viaje(zona: str, veh: dict | None, pedidos: list[dict], peso: float, volumen: float) -> dict:
    """Arma el viaje del contrato: paradas en orden de visita y días de anticipación."""
    return {"zona": zona, "veh": veh, "pedidos": ordenar_por_ruta(pedidos), "peso": peso,
            "volumen": volumen, "lead": lead_time_dias(pedidos)}


def asignar_y_ordenar(pedidos: list[dict], flota: list[dict]) -> list[dict]:
    """Reparte los pedidos de UN día en viajes con camión y ordena sus paradas.
    Requiere flota si hay pedidos; los 'cliente retira' no entran aquí (no se rutean)."""
    viajes: list[dict] = []
    vi = 0
    for zona, ped_zona in sorted(agrupar_por_zona(pedidos).items()):
        empacados, vi = _empacar(ped_zona, flota, vi)
        viajes += [cerrar_viaje(zona, e["veh"], e["pedidos"], e["peso"], e["volumen"]) for e in empacados]
    return viajes
