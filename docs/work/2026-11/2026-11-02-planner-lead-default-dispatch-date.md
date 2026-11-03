# 2026-11-02 — Planificador: fecha de salida (dispatch_date) nunca NULL

## What changed

- `backend/planning/src/plan_builder.py`: `_lead_time_dias()` ya no devuelve `None`
  cuando el viaje no tiene coordenadas; devuelve un piso de **1 día**. Así
  `dispatch_date = delivery_date − lead_time_days` siempre queda poblado en un
  pedido planificado (antes quedaba NULL si ningún pedido del viaje tenía `lat/lng`).

## Why

El dev del OMS reportó pedidos CON zona y SIN fecha de salida. Verificado en Aurora:
de 727 pedidos, 42 sin coordenadas; 36 planificados sin `dispatch_date` (1 con zona,
35 sin zona). Causa raíz: `_lead_time_dias` calculaba el T-n SOLO por distancia
haversine de las coordenadas; sin coords en todo el viaje → `lead = None` →
`dispatch_date = NULL`. La zona (`delivery_zone`, de eFlow `RUTA`) no participa en el
cálculo, por eso un pedido podía tener zona y quedar sin salida. El OMS caía a
`delivery_date` como ancla (handoff_pedidos.py), pero dejaba pedidos planificados sin
salida, que es lo que se veía.

## How

Piso `else 1` en el fallback sin coordenadas (mínimo T-1). Verificación:
`pytest backend/` → 504 passed; planning + guard 18 passed. El efecto se ve al
(re)planificar: los viajes sin coords estampan `dispatch_date = delivery_date − 1`.

## Promoted knowledge

- `orders.delivery_latitude/longitude` se pueblan DIRECTO de eFlow (`LATITUD`/`LONGITUD`,
  con `0 → NULL`); `delivery_zone` de eFlow `RUTA`. No hay geocodificación en el ingest.
- Los 42 sin coords tienen dirección a nivel cantón pero eFlow no trae lat/lng
  (40 EPA, 2 Cofersa). Gap de datos de eFlow, no del ingest.

## Follow-ups

- Geocodificación (dirección → lat/lng) en el ingest, o exigir coords a eFlow,
  para que esos pedidos entren a la optimización de ruta con ubicación real (hoy
  van al final del orden de paradas). Decisión de producto/datos, no hecha aquí.
- Desplegar `planning` a OLO para que el fix aplique en el ambiente desplegado.
