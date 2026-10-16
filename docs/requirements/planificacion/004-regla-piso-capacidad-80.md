# 004 — Regla de piso de capacidad mínima (80%) para que salga el viaje

- **Status:** Draft
- **Plan:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Author role:** FE/SYS (Jesús)
- **Branch:** (pendiente)
- **Depends on:** 001

## Context

En la reunión 2026-10-05 se confirmó que un camión **no debería salir si no va al menos al ~80% de su capacidad** (si no, el costo del viaje pierde). Hoy el motor solo valida el **techo** (no pasarse del 85% peso / 95% volumen); falta el **piso**.

## Goal

- El motor marca (o separa) los viajes que quedan **por debajo del umbral mínimo** de llenado, para que el planificador decida: esperar más pedidos, consolidar o liberar igual.
- El umbral debe ser **parametrizable** (no hardcodeado) y poder diferir por país/compañía.
- No bloquear a ciegas: hay excepciones (fecha de entrega del cliente manda → puede salir subóptimo, pero el cliente paga el costo).

## Areas to investigate

- Dónde vive el umbral (config vs tabla); cómo se muestra en la UI (aviso en el viaje "bajo mínimo").
- Interacción con la regla de fecha de entrega (un viaje puede tener que salir aunque esté bajo mínimo).
- Confirmar el % exacto con Ricardo/negocio (se dijo 80%).

## Expected deliverable

- Lógica en `domain/planificacion` (umbral configurable) + señal en el modelo de viaje.
- UI: aviso en `PlanTripCard` cuando el viaje está bajo el mínimo.

## Estimation

| Milestone | Est. hours | Started | Finished | Actual hours | Notes |
|-----------|-----------|---------|----------|--------------|-------|
| | | | | | |

## Changes

- (vacío)
