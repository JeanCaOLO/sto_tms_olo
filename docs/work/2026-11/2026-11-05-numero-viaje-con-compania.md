# 2026-11-05 — Nº de viaje con la compañía

## What changed

- `plan_builder.construir_y_persistir`: el número de viaje pasa de `YYYYMMDD-NNN` a
  `YYYYMMDD-CCCC-NNN`, donde `CCCC` es el código de compañía de eFlow
  (`tbl_customers.external_code`: Cofersa `0109`, EPA `0029`). Si la compañía no tiene código
  (VE todavía no), se usa `0000`.
- `viajes_liberados._ULTIMO`: el replan lee la secuencia del último tramo del número
  (`split_part(..., '-', -1)`), así que funciona con los dos formatos. Los viajes ya liberados
  conservan su número viejo y los nuevos del día siguen la secuencia desde ahí.
- `NUMEROVIAJEWMH` (bigint) recibe el número sin guiones; por ejemplo, `202611060029001` tiene
  15 dígitos y entra en bigint.

## Why

Cada compañía tiene su propio plan por día y numeraba desde 001, así que el 06-nov existían
dos `20261106-001`, uno de Cofersa y otro de EPA. La acción "Procesar a Eflow" del OMS
(`POST /api/v1/oms/viajes/{numero_viaje}/procesar`) filtra por número de viaje y podía liberar
los pedidos de las dos compañías juntos.

## How

- En Aurora, `split_part` con índice negativo devuelve 1 para `20261106-001` y 7 para
  `20261106-0029-007`, y `202611060029001` cabe en int8.
- `pytest backend/tests`: 545 passed.

## Follow-ups

- Falta confirmar con el equipo de eFlow que `NUMEROVIAJEWMH` en el eFlow real admite 15 dígitos.
  Hoy solo se escribe en la tabla de simulación.
- Los viajes ya armados con el formato viejo (y sin liberar) toman el número nuevo en el
  próximo replan.
