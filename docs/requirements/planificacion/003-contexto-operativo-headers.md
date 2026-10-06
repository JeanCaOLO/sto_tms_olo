# 003 — Contexto operativo por headers (país/almacén/compañía)

- **Status:** Delivered
- **Plan:** planificacion ([README](README.md))
- **Date:** 2026-10-06
- **Author role:** FE (Jesús)
- **Branch:** planificacion-2
- **Depends on:** None

## Context

El país/almacén/compañía no son un selector de la página de planificación: salen del **contexto operativo del headbar**. El backend filtra por ese contexto; el frontend debe adjuntarlo en cada llamada y re-consultar cuando cambia.

## Goal

- `apiFetch` adjunta `x-warehouse-id` / `x-customer-id` desde el contexto operativo en cada request.
- Al cambiar el contexto, las vistas de planificación (lista de planes y pedidos del día) se **re-consultan en vivo**, sin recargar la página.

## Areas to investigate

- (Resuelto) `useOperationalContext` (React Context), `lib/supabase.ts` (headers), y la dependencia de `usePlanesList` / `usePedidosDia` del contexto en su `useEffect`.

## Expected deliverable

- `hooks/useOperationalContext.tsx`, `lib/supabase.ts`, `pages/planificacion/use-planes-list.ts`, `use-pedidos-dia.ts`.
- Backend: `wiring._warehouse_id()` / `_customer_id()` leen los headers (case-insensitive) vía `event.header`.

## Estimation

| Milestone | Est. hours | Started | Finished | Actual hours | Notes |
|-----------|-----------|---------|----------|--------------|-------|
| headers + filtro backend | | | | | entregado antes |
| re-fetch en vivo al cambiar contexto | | 2026-10-06 | 2026-10-06 | ~0.5 | fix de este día |

## Changes

- (vacío)
