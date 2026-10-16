# 2026-10-08 — Retiro de orders.wms_trip_number y corrección del marco del ADR-0004

## What changed

- Migración `sql/20_drop_wms_trip_number.sql` (aplicada en Aurora): `DROP COLUMN orders.wms_trip_number`. `order_items.guia_fiscal` se mantiene.
- Loader `agregar_pedidos_reales.py`: deja de escribir `wms_trip_number`.
- **ADR-0004 reescrito**: acotado a `guia_fiscal`; documenta que `wms_trip_number` se agregó (sql/19) y se retiró (sql/20), y **corrige el marco**.

## Why

`wms_trip_number` (el viaje del WMH legado, `NUMEROVIAJEWMH`) era especulativo: nadie lo lee, el viaje nuevo lo arma el planificador en `plan_trips`/`plan_stops` (no en `orders`), y el nombre confundía. Y sobre todo: **no hay migración masiva del WMH a Aurora** — EFLOW/WMS sigue siendo la fuente y a Aurora solo llegan los pedidos operativos que el OMS ingiere. El ADR-0004 exageraba al hablar de "migración WMS/WMH → Aurora".

## How

Migración idempotente de `DROP COLUMN IF EXISTS` (con ROLLBACK documentado en la versión backend `sql/007`). Decisión y marco corregidos en `docs/decisions/0004-*` + índice.

## Promoted knowledge

- ADR-0004 queda como la fuente de la decisión (solo `guia_fiscal`) y del marco correcto (EFLOW es la fuente; Aurora recibe lo operativo vía OMS; no es migración del WMH).

## Follow-ups

- [ ] Si llega el corte del WMH y se necesita conciliación viaje-legado↔viaje-nuevo, re-agregar una referencia entonces (migración trivial).
