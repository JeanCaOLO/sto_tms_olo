"""Regla §3.3: asignar camión por capacidad (bin-packing first-fit-decreasing).

Portado de `capacity-fit.ts` (dev). Márgenes: 85% peso, 95% volumen. El peso es
una restricción legal/seguridad (CR: Decreto 31363-MOPT + práctica de flota
80-85% de payload); el volumen ("cube out") solo geometría → margen más holgado.

Diferencia con el front: aquí NO hay "anclados" ni devoluciones en vivo; el
motor arma el plan `draft` desde cero. El front editará después vía PUT.

Flota propia primero (§3): se ordenan los vehículos con `is_owned=True` al frente
antes de llenar bins, así se agota la flota propia antes de tocar terceros.
"""

from __future__ import annotations

from dataclasses import dataclass

from domain.models import Pedido, Vehiculo

WEIGHT_SAFETY_MARGIN = 0.85
VOLUME_SAFETY_MARGIN = 0.95


@dataclass(frozen=True)
class AsignacionZona:
    """Resultado de ajustar la capacidad de una zona: bins llenos + sobrantes."""

    bins: list["Bin"]
    sin_asignar: list[Pedido]


@dataclass
class Bin:
    """Un vehículo con los pedidos que se le asignaron y su carga acumulada."""

    vehiculo: Vehiculo
    pedidos: list[Pedido]
    peso: float = 0.0
    volumen: float = 0.0


def _peso(pedido: Pedido) -> float:
    return pedido.total_weight or 0.0


def _volumen(pedido: Pedido) -> float:
    return pedido.total_volume or 0.0


def _carga_relativa(pedido: Pedido, vehiculo: Vehiculo) -> float:
    """Fracción de capacidad que consume el pedido (el máximo de peso/volumen)."""
    return max(
        _peso(pedido) / vehiculo.capacity_weight if vehiculo.capacity_weight else 0.0,
        _volumen(pedido) / vehiculo.capacity_volume if vehiculo.capacity_volume else 0.0,
    )


def _flota_ordenada(vehiculos: list[Vehiculo]) -> list[Vehiculo]:
    # Flota propia primero (§3); dentro de cada grupo, mayor capacidad primero
    # para que los bins grandes absorban los pedidos pesados.
    return sorted(vehiculos, key=lambda v: (not v.is_owned, -v.capacity_weight))


def _cabe(bin_: Bin, pedido: Pedido) -> bool:
    max_weight = bin_.vehiculo.capacity_weight * WEIGHT_SAFETY_MARGIN
    max_volume = bin_.vehiculo.capacity_volume * VOLUME_SAFETY_MARGIN
    return bin_.peso + _peso(pedido) <= max_weight and bin_.volumen + _volumen(pedido) <= max_volume


def ajustar_capacidad(pedidos: list[Pedido], vehiculos: list[Vehiculo]) -> AsignacionZona:
    """First-fit-decreasing: pedidos de mayor carga relativa primero, cada uno al
    primer camión (flota propia antes que terceros) donde quepa con márgenes.

    Un pedido sin peso ni volumen conocidos consume 0 y siempre cabe: se asigna,
    pero el caller sabe que su capacidad es desconocida (Pedido.total_* is None).
    """
    if not vehiculos:
        return AsignacionZona(bins=[], sin_asignar=list(pedidos))

    flota = _flota_ordenada(vehiculos)
    ref = flota[0]  # referencia para ordenar por carga relativa (mayor primero)
    ordenados = sorted(pedidos, key=lambda p: _carga_relativa(p, ref), reverse=True)

    bins: list[Bin] = [Bin(vehiculo=v, pedidos=[]) for v in flota]
    sin_asignar: list[Pedido] = []
    for pedido in ordenados:
        destino = next((b for b in bins if _cabe(b, pedido)), None)
        if destino is None:
            sin_asignar.append(pedido)
            continue
        destino.pedidos.append(pedido)
        destino.peso += _peso(pedido)
        destino.volumen += _volumen(pedido)

    return AsignacionZona(bins=[b for b in bins if b.pedidos], sin_asignar=sin_asignar)
