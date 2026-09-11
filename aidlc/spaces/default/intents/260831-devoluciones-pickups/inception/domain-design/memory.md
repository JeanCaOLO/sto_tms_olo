# Domain Design — memoria

## Interpretations
- 2026-09-01T14:37:09Z — pase minimo: FR16 solo modifica bloques existentes. Se documenta la descomposicion del codigo actual (ViajesAdapter, SecuenciaParadas, CapacidadVehiculo, PlanificacionUI) + TipoParadaBadge nuevo. Devolucion = atributo tipo en Parada, no entidad nueva (ADR-1).

## Deviations

## Tradeoffs

## Open questions
- 2026-09-01T14:37:09Z — OQ-4 puede revisar ADR-1 si Devoluciones necesita estado propio.

## Deviations
- 2026-09-01T14:45:21Z — rev2 tras Request Changes: grafo reconstruido contra imports reales (capacity-fit importa optimize-stops+time-windows; route-geometry aislado como GeometriaRuta; use-pedidos-ruta es orquestador de UI). Viaje+Pedido owned by ViajesAdapter. FR16.3.2 -> Deferred. FR16.2.2 -> GeometriaRuta.
