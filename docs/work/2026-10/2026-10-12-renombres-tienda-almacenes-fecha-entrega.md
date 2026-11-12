# 2026-10-12 — Renombres de etiquetas: "Tienda"→"Almacenes" (Pedidos) y "Fecha de despacho"→"Fecha de entrega"

## What changed

Dos cambios de wording visible pedidos por el usuario, todo en frontend (`src/`):

1. **"Tienda" → "Almacenes"**, solo en el módulo **Pedidos**:
   - `src/i18n/local/es/orders.ts`: `orders.colStore` `Tienda` → `Almacenes`.
   - `src/i18n/local/en/orders.ts`: `Store` → `Warehouses`.
   - `src/pages/pedidos/components/OrderDetailModal.tsx`: label hardcoded
     `Tienda` → `Almacenes`.

2. **"Fecha de despacho" → "Fecha de entrega"**, en cualquier lado visible:
   - `src/i18n/local/{es,en}/omsQueue.ts` y `.../omsSimulator.ts`:
     `colDispatchDate` `Fecha Despacho`→`Fecha Entrega` /
     `Dispatch Date`→`Delivery Date`.
   - `src/pages/oms/mockData.ts`: nombres de regla y detalle de auditoría
     (`'Fecha de despacho vencida'`, `'Regla T-1 (fecha de despacho)'`,
     `'Regla: Fecha de despacho vencida'`) → `...entrega...`.
   - `src/pages/oms/engine/priorityEngine.ts` (+ su test): nombre de regla
     `Regla T-1 (fecha de despacho)` → `(fecha de entrega)`.
   - `src/pages/oms/types.ts`: comentario de `dispatchDate`.

## Why

Pedido directo del usuario sobre terminología de la UI.

## How — alcance y límites

- **Base de datos: no requiere cambios.** Revisado `sql/**`: no existe ninguna
  columna "fecha de despacho". La fecha que usan OMS/Planificación ya es
  `orders.delivery_date` / `wms_expediciones.fecha_planificada` (ya es "fecha
  de entrega" en el modelo). Los "despacho" en BD son `dispatch_guides`
  ("guías de despacho", otro concepto) y la ruta `/oms/rutas-despacho` — no
  entran en el pedido, no se tocan.
- **No se renombraron identificadores internos** (`dispatchDate` en el front,
  `fecha_planificada`/`delivery_date` en BD, la key i18n `colDispatchDate`):
  el pedido es de wording visible; renombrar código/columnas sería un cambio
  amplio sin impacto para el usuario y con riesgo de romper integraciones.
- **"Guías de Despacho"** (`menu.guias`) NO se tocó: "Despacho" ahí es parte
  del nombre del módulo, no "Fecha de despacho".
- Avisado a Claude por `.agents/CANAL.md` (su terreno backend/BD) para que
  confirme que no haya una etiqueta visible de "fecha de despacho" en alguna
  respuesta del backend/OMS live.

## Verification

- type-check (`tsc --noEmit`): **0 errores**.
- `vitest run src/pages/oms src/pages/pedidos`: **10/10 verdes** (incluye el
  test de `priorityEngine` ajustado al nuevo nombre de regla).

## Follow-ups

- [ ] Claude: confirmar que no haya un label visible "fecha de despacho" en el
      backend/OMS live; si aparece, cambiarlo a "fecha de entrega".
