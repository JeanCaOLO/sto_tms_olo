# 03 — Validar cantidad devuelta contra el pedido

> Reconciliado 2026-11-11: sigue pendiente en servidor móvil y solicitudes web. Ver F03 de [estado actual](../ESTADO_ACTUAL.md).

**Estado:** pendiente por implementar.

## Qué falta
La app limita cada artículo elegido del pedido a la cantidad pedida, pero el servidor (`stops.return_items`) solo exige entero 1..100000 y acepta artículos escritos a mano. Tampoco se descuenta lo ya devuelto antes del mismo pedido.

## Por qué
Un cliente modificado, o dos devoluciones sucesivas, pueden devolver más de lo entregado.

## Cómo hacerlo
En `add_return`, para ítems con `product_code` que existan en `tbl_order_items` del pedido, comparar `quantity` contra `quantity - sum(tbl_returns.quantity)` y responder 400. Decidir con Devoluciones si los artículos manuales fuera del pedido se permiten (hoy sí, a propósito: el chofer a veces recibe algo que no figura).
