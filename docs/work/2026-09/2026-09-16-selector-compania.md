# 2026-09-16 — Selector de compañía (filtra viajes y pedidos)

## What changed

- **Selector de Compañía** junto al de País (arriba a la derecha). Al elegir una
  compañía, se filtran **viajes y pedidos** en todo el módulo.
  - `CompaniaSelector.tsx` + `PlanificacionHeader.tsx` (se extrajo el header de
    `page.tsx` para hacer sitio y quedar bajo el tope de líneas).
  - `use-companias.ts` + `fallback-companias.ts` (CR: COFERSA; VE: FEBECA,
    SILLACA) y `fetchCompanias` en `eflow-api`.
  - `eflow-api.conPais` ahora agrega `&company=` cuando hay compañía activa →
    `/api/viajes` y `/api/viajes/{id}/pedidos` quedan filtrados en un solo lugar.
  - `use-viajes` recarga al cambiar `company`; cambiar de país **resetea** la
    compañía (los IDCOMPANIA son por país).
- **Rutas derivadas (opción B):** con compañía elegida, los dropdowns de ruta
  (Asignar Viajes, Reparto de Flota) muestran solo las rutas con viajes de esa
  compañía (`rutasVisibles`). Sin compañía, todas.

## Why

Pedido de la reunión: tras elegir país, elegir compañía y que filtre todo.
`distribution_routes`/flota no tienen compañía en EFLOW, así que las rutas se
derivan de los viajes y la flota queda global (compartida).

## How

`tsc` limpio; `vitest run` → 74/74. Verificado en el build que el selector queda
incluido en el chunk. Backend: `/api/catalogos/companias` + `/api/viajes?company=`
(ver TMS-Backend). Deploy a Amplify (job 10).

## Follow-ups

- Si se necesita flota/rutas fijas por compañía, sería tabla propia del TMS.
- Persistir la compañía elegida por país (hoy se resetea al cambiar de país).
