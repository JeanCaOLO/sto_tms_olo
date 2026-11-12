# 01 — Correo de aviso a la siguiente parada

**Estado:** pendiente por implementar. Hoy el aviso es solo en pantalla: la vista del cliente (`GET /api/v1/tracking/mis-entregas`) muestra "Tu pedido llega en ~X min" con el ETA en vivo de `tracking_logic.stop_metrics`.

## Qué falta
Mandar un correo al punto de entrega de la siguiente parada cuando el camión sale de la parada anterior, con el tiempo aproximado de llegada.

## Por qué no está
- No existe catálogo de correos de los puntos de entrega. Para empezar se pensó dejar correos fijos de ejemplo.
- La Lambda móvil (`backend/mobile`) está dentro de la VPC de Aurora y **no tiene salida a SES** (sin NAT ni endpoint).

## Cómo hacerlo
1. Disparador: al registrar la salida de una parada (`record_visits` en `backend/mobile/src/mobile_api/positions.py`, cuando `departed_at` pasa a tener valor) o al cerrar una parada (`stops.transition_stop`), lo que ocurra primero. Calcular el ETA a la siguiente parada pendiente con `logic.stop_metrics`.
2. Guardar un evento `next_stop_notice` en `tracking_events` (una vez por parada) para no duplicar. **No** leerlo desde el detalle del viaje: una prueba (`test_detail_has_contract_fields_and_no_event_or_trail_queries`) exige que el detalle no consulte `tracking_events`.
3. Envío: patrón de `backend/alerts` (Lambda `digest` en la VPC + Lambda `mailer` fuera de la VPC que usa `sesv2.send_email`). Crear un `mailer` propio dentro del stack de tracking/mobile; **no modificar** `backend/alerts`.
4. Destinatarios: tabla o columna con el correo del punto de entrega (ver [03](./03-vinculo-cliente-punto-entrega.md)); mientras tanto, lista fija por parámetro.
5. SES en sandbox solo entrega a direcciones verificadas.

## Verificación
Simular un recorrido (`backend/mobile/scripts/simular_recorrido.py`), comprobar un solo correo por parada y que el ETA coincida con el de la pantalla.
