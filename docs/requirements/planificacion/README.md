# Planificación — Requirements

Trabajo técnico que sostiene el módulo de planificación (ver [stories](../../stories/planificacion/README.md) para el comportamiento funcional). El backend hexagonal vive en el repo `TMS-Backend` (y su copia local `backend-planif/`); el frontend React consume sus endpoints vía `/api`.

## Índice (orden recomendado)

| # | Requirement | Estado |
|---|-------------|--------|
| 001 | Motor de planificación: zona → capacidad → secuencia | Delivered |
| 002 | Snapshot de pedido/vehículo al guardar el plan | Delivered |
| 003 | Contexto operativo por headers (país/almacén/compañía) | Delivered |
| 004 | Regla de piso de capacidad mínima (80%) para que salga el viaje | Draft |
| 005 | Alerta de pedidos nuevos por WebSocket (hoy polling) | Draft |
| 006 | Geocodificación de direcciones (coordenadas de clientes) | Draft |
