"""Datos mock para cuando el schema de WT-1 aún no está aplicado.

Explícitos y pequeños: sirven para probar el motor end-to-end (zona + capacidad
+ 2-opt) sin Aurora. NO son datos de negocio; se reemplazan por las lecturas
reales en cuanto las tablas existan.
"""

from __future__ import annotations

from domain.models import Pedido, Vehiculo

MOCK_PEDIDOS: list[Pedido] = [
    Pedido("m-1", "ORD-1", "c-1", "Cliente 1", "ZONA-A", "San José", 9.93, -84.08, 300.0, 1.2, 1),
    Pedido("m-2", "ORD-2", "c-2", "Cliente 2", "ZONA-A", "San José", 9.94, -84.10, 250.0, 0.9, 2),
    Pedido("m-3", "ORD-3", "c-3", "Cliente 3", "ZONA-A", "San José", 9.90, -84.05, 400.0, 1.5, 1),
    Pedido("m-4", "ORD-4", "c-4", "Cliente 4", "ZONA-B", "Heredia", 10.00, -84.12, 500.0, 2.0, 1),
    Pedido("m-5", "ORD-5", "c-5", "Cliente 5", "ZONA-B", "Heredia", 10.02, -84.15, 350.0, 1.1, 3),
]

MOCK_VEHICULOS: list[Vehiculo] = [
    Vehiculo("v-1", capacity_weight=1500.0, capacity_volume=8.0, is_owned=True, driver_id="d-1", label="Propio 1"),
    Vehiculo("v-2", capacity_weight=1200.0, capacity_volume=6.0, is_owned=False, driver_id="d-2", label="Tercero 1"),
]

MOCK_ZONAS: list[str] = ["ZONA-A", "ZONA-B"]
