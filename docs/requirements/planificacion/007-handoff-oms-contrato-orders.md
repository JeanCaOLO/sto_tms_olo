# 007 — Contrato de handoff Planificación → OMS en `orders`

- **Status:** Delivered
- **Plan:** planificacion ([README](README.md))
- **Date:** 2026-10-21
- **Author role:** SYS (Jesús)
- **Branch:** planificacion-2
- **Depends on:** 001

## Context

Planificación y OMS son módulos separados que se comunican por una **superficie de datos
compartida**: la tabla `orders` de Aurora. No hay llamada de código entre ellos; el acoplamiento
es un **contrato de columnas**. Planificación estampa el resultado del plan; el OMS lee esa cola,
calcula prioridad y pasa el pedido a `generada`. (Story funcional:
[008](../../stories/planificacion/008-handoff-al-oms-estampar-pedido.md).)

## Goal

- Al persistir un plan, estampar en cada pedido del plan: `numero_viaje`, `lead_time_days`,
  `dispatch_date`, `planning_run_id`, `delivery_zone`.
- Que el OMS pueda aislar su cola de trabajo con un filtro simple y determinista.
- Que un pedido que se cae del plan al re-planificar quede fuera de esa cola sin intervención.
- Que Planificación **nunca** escriba las columnas que son del OMS.

## Areas to investigate

- (Resuelto) **Reparto de columnas** (quién escribe qué en `orders`):

  | Columna | La escribe | Significado |
  |---|---|---|
  | `numero_viaje` | Planificación | viaje (`AAAAMMDD-seq`) |
  | `lead_time_days` | Planificación | días de tránsito |
  | `dispatch_date` | Planificación | `delivery_date − lead_time_days` (NULL si no hay lead) |
  | `planning_run_id` | Planificación | uuid de la corrida (cliente-día) |
  | `delivery_zone` | Planificación | zona de entrega |
  | `priority`, `oms_score`, `wms_situation`, `oms_processed_at` | OMS | Planificación NO las toca |

- (Resuelto) **Cola del OMS**: `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`.
- (Resuelto) **`dispatch_date` en SQL**: `delivery_date − make_interval(days => lead_time_days)`;
  misma fecha para todo el viaje; NULL si no hay lead.
- (Resuelto) **`lead_time_days`**: `1 + floor(km_max / 70)` por haversine de la parada más
  lejana al depósito CR (9.9281, −84.0907); sin coordenadas → NULL.
- (Resuelto) **Limpieza al re-planificar**: NULL de `numero_viaje`/`lead_time_days`/
  `planning_run_id`/`dispatch_date` para los pedidos del día (org + almacén + compañía +
  `delivery_date`) que ya no quedaron en el plan; los que siguen se re-estampan. **No** toca
  `oms_processed_at`.

## Expected deliverable

- Estampado en `backend/planning/src/plan_builder.py` (frontend) y en el planificador
  hexagonal de `TMS-Backend` (`STAMP_ORDERS_SQL` / `CLEANUP_ORDERS_SQL` en
  `adapters/outbound/aurora/sql.py`, puerto `OrdersHandoffRepo`).
- Migraciones del contrato: `sql/37_planif_oms_contract.sql` + `sql/42_orders_dispatch_date.sql`
  (TMS-Frontend); `sql/008` + `sql/009` (TMS-Backend). Aditivas e idempotentes.
- Aplicadas y verificadas contra Aurora `tms_olo` (las 5 columnas existen; 277 pedidos
  estampados; limpieza al caerse verificada).

## Estimation

| Milestone | Est. hours | Started | Finished | Actual hours | Notes |
|-----------|-----------|---------|----------|--------------|-------|
| Estampado + migración + limpieza | | 2026-10-19 | 2026-10-20 | | contrato sql/37+42, portado a sql/008+009 |

## Changes

- (vacío)
