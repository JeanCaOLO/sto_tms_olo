# 2026-10-12 — Fix UI de modales (mapa/scroll), monto de tarifa fija y geocercas no superpuestas

## What changed (frontend)

- **Bug del mapa en el modal de Zona** (franja azul al scrollear): `ZoneMap.tsx`
  montaba el mapa Leaflet antes de que el contenedor tuviera tamaño → tiles
  fuera de lugar. Fix: `invalidateSize()` tras montar (rAF) + `ResizeObserver`.
- **Modales reestructurados** (`ZonaModal`, `CarrierModal`) al layout de 3 zonas:
  header fijo / contenido con scroll propio / **footer de botones fijo**. Antes
  el modal entero scrolleaba y campos como el PDF del contrato quedaban perdidos
  ("no se veía dónde agregar el contrato").
- **Monto de tarifa fija por transportista** (`CarrierModal`): cuando
  `rate_type='FIXED'` aparece un campo de monto; se manda como
  `carriers.flat_rate_amount` (numeric, defensivo hasta que exista la columna).
- **Geocercas no superpuestas** (`geofence-overlap.ts` + `ZonaModal`): al guardar
  una zona, si su geocerca pisa otra zona del país, se avisa (`confirm`, no
  bloqueo duro). Heurística vértice-dentro + cruce de bordes con los `@turf/*`
  que ya trae geoman (sin dependencia nueva).

## Why

Pedido del usuario: (1) el modal de Zona se rompía al scrollear; (2) no veía
dónde agregar el contrato en Transportista; (3) la tarifa fija debe permitir
indicar el monto, que cambia por transportista; (4) eliminar GAM/RURAL y evitar
geocercas superpuestas.

## Verification

- type-check (`tsc --noEmit`): **0 errores**.
- `vitest run src/pages/zonas src/pages/transportistas src/hooks/use-notifications.test.ts`:
  **verdes** (incluye `geofence-overlap.test.ts` 5 casos, `carrier-contract` 4,
  `use-notifications` 5).

## Follow-ups (Claude — BD/cálculo)

- [ ] Crear `carriers.flat_rate_amount` (numeric, nullable; CHECK >= 0 a decidir).
- [ ] Cablear el monto por transportista en el cálculo FIXED: hoy el
      `BaseOverride` solo lleva `method`, no un importe. Definir si el monto entra
      por `tripSettlement`/`baseOverride` (Kiro, con tests de regresión) o si el
      `BaseOverride` lleva un `amount` opcional (ajuste de kernel). Coordinado por
      canal.
- [ ] Eliminar/desactivar zonas GAM y RURAL en Aurora (verificar si reglas de
      tarifa las referencian por `code` antes de borrar).
