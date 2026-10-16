# 002 — Snapshot de pedido/vehículo al guardar el plan

- **Status:** Delivered
- **Plan:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Author role:** DA/SYS (Jesús)
- **Branch:** planificacion-2
- **Depends on:** 001

## Context

Los datos de eflow (pedidos, vehículos) cambian con el tiempo. Un plan ya armado debe conservar los valores con los que se generó (peso, volumen, cliente, zona, placa, capacidad), para que al revisarlo meses después no "mute" por cambios aguas arriba. Esto es lo que se llamó "congelar" el snapshot.

## Goal

- Al guardar un plan, persistir en `plan_stops` y `plan_trips` las columnas snapshot (order_number, customer_name, delivery_city/zone, lat/long, weight, volume; vehicle_plate, capacity, is_owned).
- Las lecturas del plan guardado usan el snapshot, no re-consultan eflow.

## Areas to investigate

- (Resuelto) migración `003_plan_snapshots.sql` (+ `004_plan_trip_status.sql`, `005_route_plan_customer.sql`), aplicadas a Aurora.

## Expected deliverable

- SQL `sql/003_*`, `004_*`, `005_*` en TMS-Backend (aplicadas).
- `domain/models.py` (Parada/Viaje/Plan con campos snapshot), `planificacion_service._congelar(...)`, `adapters/outbound/aurora/sql.py` (INSERT/SELECT con columnas snapshot).

## Estimation

| Milestone | Est. hours | Started | Finished | Actual hours | Notes |
|-----------|-----------|---------|----------|--------------|-------|
| (entregado) | | | | | migraciones aplicadas + poblado al guardar |

## Changes

- (vacío)
