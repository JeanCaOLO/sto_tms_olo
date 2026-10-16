# 001 — Motor de planificación: zona → capacidad → secuencia

- **Status:** Delivered
- **Plan:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Author role:** FE/SYS (Jesús)
- **Branch:** planificacion-2
- **Depends on:** None

## Context

El plan de un día debe armarse de forma determinista a partir de los pedidos planificables y la flota. La ruta ya no es fija: se construye por los pedidos del día y su zona, optimizando el viaje (no una ruta estática).

## Goal

- Dado un conjunto de pedidos y vehículos, producir un plan `draft` con viajes por zona, cada viaje asignado a un vehículo que respeta su capacidad, y con las paradas en orden de entrega optimizado.
- La flota propia se agota antes de usar terceros.
- Los pedidos que no caben quedan listados como sin asignar (no se pierden ni rompen el plan).

## Areas to investigate

- (Resuelto) agrupación por zona (`agrupar_por_zona`), bin-packing first-fit-decreasing con márgenes 85% peso / 95% volumen (`ajustar_capacidad`), secuencia 2-opt sobre matriz de distancias OSRM (`optimize-stops` / `route-geometry`).

## Expected deliverable

- `src/domain/planificacion/` (motor: `motor.py`, `agrupar_por_zona.py`, `ajustar_capacidad.py`) en TMS-Backend.
- Endpoint `POST /v1/planificacion/planes` que persiste el draft; `GET`/`PUT` para listar/editar.
- Frontend: `use-planes`, `planes-api`, `PlanEditor`, `PlanTripCard`, `TripMapa`.

## Estimation

| Milestone | Est. hours | Started | Finished | Actual hours | Notes |
|-----------|-----------|---------|----------|--------------|-------|
| (entregado antes de esta bitácora) | | | | | motor + persistencia + UI |

## Changes

- (vacío)
