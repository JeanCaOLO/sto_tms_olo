"""Regla §B3: marcar viajes "no rentables" que requieren aprobación.

Regla de negocio (Reunión): un viaje que **no llena el camión** (baja ocupación)
o que lleva **una sola parada** no es rentable por sí solo — el cliente debe
asumir el costo, así que se **marca** para aprobación. El motor NO bloquea la
creación del plan; solo levanta la bandera `Viaje.requiere_aprobacion`.

Regla pura: sin I/O, sin SQL. Recibe carga del viaje + capacidad del camión y
devuelve un bool. El umbral es una constante documentada y ajustable.
"""

from __future__ import annotations

from domain.models import Vehiculo

# Umbral de ocupación por defecto: por debajo del 40% de peso Y de volumen el
# viaje se considera "no rentable". Es el default acordado en el brief; se puede
# subir/bajar sin tocar el motor. Un solo criterio (peso O volumen) alto ya basta
# para NO requerir aprobación: se exige baja ocupación en AMBOS ejes.
OCUPACION_MINIMA_RENTABLE = 0.40


def requiere_aprobacion(
    total_weight: float,
    total_volume: float,
    vehiculo: Vehiculo | None,
    num_paradas: int,
    umbral: float = OCUPACION_MINIMA_RENTABLE,
) -> bool:
    """True si el viaje debe marcarse para aprobación (no rentable).

    Criterios (cualquiera dispara la marca):
      1. Una sola parada (un pedido no llena un viaje).
      2. Baja ocupación: peso < `umbral`·capacidad_peso  Y  volumen <
         `umbral`·capacidad_volumen. Se exigen AMBOS ejes bajos para no penalizar
         un viaje que va lleno de volumen pero liviano (o viceversa).

    Sin vehículo (capacidad desconocida) no se puede juzgar la ocupación: solo
    aplica el criterio de parada única.
    """
    if num_paradas <= 1:
        return True

    if vehiculo is None:
        return False

    ocupacion_peso = (
        total_weight / vehiculo.capacity_weight if vehiculo.capacity_weight else 0.0
    )
    ocupacion_volumen = (
        total_volume / vehiculo.capacity_volume if vehiculo.capacity_volume else 0.0
    )
    return ocupacion_peso < umbral and ocupacion_volumen < umbral
