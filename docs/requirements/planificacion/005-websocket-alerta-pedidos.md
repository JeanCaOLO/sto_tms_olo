# 005 — Alerta de pedidos nuevos por WebSocket (hoy polling)

- **Status:** Draft
- **Plan:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Author role:** FE/SYS (Jesús)
- **Branch:** (pendiente)
- **Depends on:** 002 (story), 003

## Context

La story 002 (regenerar + alerta) ya avisa de pedidos nuevos, pero **por polling** cada 15 s, porque el backend es Lambda/SAM y no sostiene conexiones WebSocket. Un WS real da la alerta en vivo sin sondear.

## Goal

- Reemplazar el polling por una **suscripción WebSocket**: cuando se crea un pedido para un día/contexto, el servidor **empuja** el evento y la UI actualiza el badge sin sondear.
- La UI **no cambia**: la detección vive aislada en `use-nuevos-pedidos.ts`; solo se reemplaza el cuerpo del hook.

## Areas to investigate

- **API Gateway WebSocket API** (connect/disconnect/notify) + una Lambda que publique al crearse un pedido; o alternativa (SSE, AppSync).
- Requiere infra AWS + credenciales que **aún no tenemos** (bloqueante).

## Expected deliverable

- Infra WS (SAM) + cambio interno de `use-nuevos-pedidos.ts` (de polling a suscripción).

## Estimation

| Milestone | Est. hours | Started | Finished | Actual hours | Notes |
|-----------|-----------|---------|----------|--------------|-------|
| | | | | | bloqueado por infra/credenciales AWS |

## Changes

- (vacío)
