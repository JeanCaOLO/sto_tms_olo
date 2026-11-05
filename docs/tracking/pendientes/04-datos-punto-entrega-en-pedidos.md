# 04 — Datos del punto de entrega en los pedidos

**Estado:** pendiente por verificar / implementar. Origen: el 2026-11-05 se reportó que en el detalle del viaje las paradas seguían saliendo con el nombre de la compañía ("Cofersa, Cofersa, Cofersa").

## Qué se hizo
El nombre de la parada ahora es `COALESCE(dp.name, fc.name)` (punto de entrega, o cliente destino) y la empresa va aparte como nota (`company_name`, "Pedido P-1 de Cofersa"). Ya no se cae al nombre de la compañía: sin punto ni cliente destino, la parada muestra su dirección.

## Verificado en el navegador (2026-11-05, BD de desarrollo)
Viaje `VJ-DEMO-REC-20261102-W12`: las paradas salen como **CENTRAL DE GUADALUPE / FERRETERIA VENECIA / FERRETERIA VENECIA** (cliente destino) con la nota "Pedido PL… de Cofersa", y el encabezado dice "Rumbo a 3. FERRETERIA VENECIA". Antes salía "Cofersa" ×3. Para verlo hubo que **reiniciar el servidor local** (`python backend/local/serve.py`): carga el código solo al arrancar.

## Qué falta comprobar
1. **Despliegue:** el sandbox puede seguir con el código anterior (`build/sandbox/mobile/` es una copia vieja). El cambio no se ve hasta que Intelix despliegue `backend/tracking` y `backend/mobile`.
2. **Datos:** `backend/planning/src/ingest_orders.py` solo guarda `orders.final_customer_id` (resuelto por `final_customers.external_code = IDCLIENTE`) y **nunca** `orders.delivery_point_id`. Si los clientes de EFLOW no están cargados en `final_customers` (`scripts/cargar-clientes-eflow.py`), el pedido queda sin cliente destino y la parada muestra la dirección. Verificar en Aurora cuántos pedidos activos tienen `final_customer_id` y `delivery_point_id` nulos, y si `final_customers.name` de Cofersa trae el nombre del cliente y no el de la compañía.
3. Poblar `orders.delivery_point_id` en la ingesta de pedidos (módulo Planificación, fuera de Tracking): coordinar con ese equipo.
