# 02 — Pedidos vencidos en bandeja

**Estado:** pendiente por implementar

## Qué falta

Decidir qué pasa con los pedidos que siguen DISP/DISP **en eFlow** con fecha de entrega pasada
(2026-11-10: 7). El replan solo arma (hoy, hoy+3], así que nunca se planifican y el OMS (que solo lee
planificados) tampoco los libera; quedan en bandeja hasta que alguien les cambie la fecha.

Los que salieron de la cola de eFlow (despachados, cerrados, con viaje) ya no son problema: la
ingesta les copia el estado de eFlow (`salientes.py`) y dejan la bandeja.

## Por qué

Son los más urgentes (Eduardo, 2026-11-10): no deben quedar colgados.

## Cómo hacerlo

Opciones (decisión de negocio):
- Planificación los mete en el plan de mañana (en `replan._PENDIENTES`, tratar `delivery_date < hoy`
  como mañana) y el OMS los libera por ventana como a los demás.
- O el OMS los libera directo sin plan.
Mientras tanto, desde la bandeja se les puede cambiar la fecha a mano (`cambio_fecha`).
