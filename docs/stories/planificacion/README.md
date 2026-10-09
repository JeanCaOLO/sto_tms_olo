# Planificación — Stories

Módulo que arma el plan de reparto de un día: toma los pedidos planificables, los agrupa por zona, los asigna a vehículos por capacidad, secuencia las paradas (2-opt sobre ruta OSRM) y deja un plan editable, confirmable y con estado por viaje.

Contexto de negocio: la **ruta ya no es fija** — el viaje se dispara por los pedidos del día y su zona; la **fecha de entrega la pone el cliente y no se modifica** (solo se ajusta prioridad/estado). País/almacén/compañía salen del **contexto operativo del headbar**.

## Índice (orden recomendado)

| # | Story | Estado |
|---|-------|--------|
| 001 | Generar el plan del día | Delivered |
| 002 | Regenerar el plan y alerta de pedidos nuevos | Delivered |
| 003 | Editar (mover pedidos) y confirmar el plan | Delivered |
| 004 | Estado por viaje: completar / cancelar / reabrir | Delivered |
| 005 | Ver pedidos, paradas y mapa de la ruta | Delivered |
| 006 | Filtrar planificaciones por estado y por contexto | Delivered |
| 007 | Pedido entregado en varias guías (split por línea) | Draft |

Las 001-006 describen comportamiento **ya entregado** (reflejan el estado actual del módulo); 007 es trabajo pendiente surgido de la reunión 2026-10-05.
