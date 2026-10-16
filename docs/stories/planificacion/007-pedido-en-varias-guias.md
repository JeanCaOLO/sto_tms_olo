# 007 — Pedido entregado en varias guías (split por línea)

- **Status:** Draft
- **Feature:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Branch:** (pendiente)
- **Depends on:** 001

## Narrative

Como planificador, quiero que un pedido pueda despacharse en **varios viajes/guías** (parte de sus líneas en un viaje y el resto en otro), para reflejar casos reales (p. ej. EPA, o cuando no cabe todo en un camión), sin perder el control de qué línea va en cuál guía.

## Acceptance criteria

1. Un pedido puede repartirse entre **más de un viaje**, a nivel de **línea** (no solo cabecera).
2. Cada guía (viaje) sabe exactamente **qué líneas** del pedido lleva; la suma de líneas entre guías = el pedido completo.
3. La vista del viaje muestra, para un pedido partido, **qué parte** lleva (líneas/peso), no el pedido entero duplicado.
4. Un pedido parcialmente despachado no se marca como entregado hasta que todas sus líneas lo estén.

## Edge cases

- COFERSA normalmente va completo; el split es común en EPA o cuando no cabe por capacidad.
- Backorder: líneas faltantes se liberan después como otro pedido de la misma orden de compra (planificación desde antes de facturar).

## Test scenarios

- **(pendiente — definir con Ricardo/negocio los datos reales de un pedido partido)**

## Out of scope

- Liquidación de guías (OMS/tarifas).

## Open questions

- ¿El modelo actual (`plan_stops` por pedido) debe pasar a **nivel de línea**? Afecta el snapshot. Owner: Jesús + Ricardo.
- ¿Regla exacta para partir (por capacidad, por decisión del cliente)? Owner: Ricardo.

## Changes

- (vacío)

## Validation

- (pendiente)
