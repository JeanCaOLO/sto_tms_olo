# 2026-11-05 — EPA: viaje directo por tienda

## What changed

- `plan_builder._agrupar_por_zona`: los pedidos cuyo cliente destino es `TIENDA` (las tiendas
  EPA) se agrupan por tienda, no por zona. Cada tienda arma su propio viaje (o varios si no entra
  en un camión). El mayoreo (Cofersa) sigue consolidándose por zona.
- `ingest_orders._lookups`: el cliente destino se resuelve por `(customer_id, external_code)`.
  Antes era solo por código, y el `008` de EPA (T008 CARTAGO, `TIENDA`) se amarraba al `008` de
  Cofersa (`MAYOREO`).
- `backend/tests/test_plan_builder.py`: prueba del agrupamiento.

## Why

Reunión 2026-11-03: EPA va en viaje directo, camión lleno, a una tienda; la zona no aplica. Las
tiendas EPA no traen `RUTA` en eFlow, así que caían todas en "S/R" y el viaje EPA del 06-nov
mezclaba T005, T006 y T008.

## How

- En eFlow las tiendas EPA son clientes (`IDCLIENTE` `001`–`008`); en Aurora son
  `tbl_final_customers` de EPA con `customer_type = 'TIENDA'`.
- Simulación sobre los pedidos EPA del 06-nov: quedan 3 grupos (T005 ×2, T006, T008) en vez de 1.
- La ingesta en modo `dry_run` contra eFlow leyó 33 pedidos y los resolvió todos.
- `pytest backend/tests`: 545 passed.

## Follow-ups

- **El número de viaje choca entre compañías.** Se calcula como `fecha-secuencia` por plan, y cada
  compañía tiene su propio plan: el 06-nov hay un `20261106-001` de Cofersa y otro de EPA. La acción
  "Procesar a Eflow" del OMS filtra por `numero_viaje`, así que podría liberar los dos.
- Las tiendas EPA no tienen coordenadas en eFlow (`CLIENTES.LATITUD`), por lo que el T-n queda en
  el piso de 1 día.
- Los pedidos que ya están mal amarrados se corrigen en la próxima ingesta, pero solo los que siguen
  en la cola DISP/DISP.
