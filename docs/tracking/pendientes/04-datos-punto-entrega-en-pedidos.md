# 04 — Datos del punto de entrega en los pedidos

**Estado:** pendiente por verificar / implementar. Origen: el 2026-11-05 se reportó que en el detalle del viaje las paradas seguían saliendo con el nombre de la compañía ("Cofersa, Cofersa, Cofersa").

## Qué se hizo
El nombre de la parada ahora es `COALESCE(dp.name, fc.name)` (punto de entrega, o cliente destino) y la empresa va aparte como nota (`company_name`, "Pedido P-1 de Cofersa"). Ya no se cae al nombre de la compañía: sin punto ni cliente destino, la parada muestra su dirección.

## Verificado en el navegador (2026-11-05, BD de desarrollo)
Viaje `VJ-DEMO-REC-20261102-W12`: las paradas salen como **CENTRAL DE GUADALUPE / FERRETERIA VENECIA / FERRETERIA VENECIA** (cliente destino) con la nota "Pedido PL… de Cofersa", y el encabezado dice "Rumbo a 3. FERRETERIA VENECIA". Antes salía "Cofersa" ×3. Para verlo hubo que **reiniciar el servidor local** (`python backend/local/serve.py`): carga el código solo al arrancar.

## Datos reales (consulta de solo lectura, BD de desarrollo, 2026-11-05)
887 pedidos: **todos** tienen `final_customer_id` y **ninguno** tiene `delivery_point_id` (Cofersa 843, EPA 41, Febeca 3; 32 871 filas en `final_customers`). Por eso el nombre de la parada sale de `final_customers.name` y el punto de entrega (`delivery_points`) aún no interviene.

## Qué falta comprobar
1. **Despliegue:** el sandbox puede seguir con el código anterior (`build/sandbox/mobile/` es una copia vieja). El cambio no se ve hasta que Intelix despliegue `backend/tracking` y `backend/mobile`.
2. **`delivery_point_id` vacío:** `backend/planning/src/ingest_orders.py` solo guarda `orders.final_customer_id` (resuelto por `final_customers.external_code = IDCLIENTE`) y **nunca** `orders.delivery_point_id`. En desarrollo no hay pedidos sin cliente destino, pero en otros ambientes un pedido sin `final_customer_id` mostrará la dirección en vez de un nombre (revisar la carga con `scripts/cargar-clientes-eflow.py`).
3. Poblar `orders.delivery_point_id` en la ingesta de pedidos (módulo Planificación, fuera de Tracking): coordinar con ese equipo.
