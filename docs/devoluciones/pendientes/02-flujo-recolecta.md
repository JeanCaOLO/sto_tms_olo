# 02 — Flujo «recolecta» (Atención al Cliente → viaje)

**Estado:** pendiente por implementar. Solo está lista la etiqueta `recolecta` en la tabla (`returnTypeLabel`).

## Qué falta
Un rol con permiso `devoluciones:edit` registra una devolución recolecta en la web (hoy no existe endpoint de alta: `backend/admin` solo lista y recibe), y esta se manda sola a Planificación para meterla en un viaje. La parada de recolecta se marca con `dispatch_guides.stop_type = 'collection'` (m05) y la app del chofer ya la maneja (foto del producto + firma).

## Por qué
Es la segunda forma de registrar una devolución del flujo acordado. Esta sesión solo cubrió contracamión.

## Cómo hacerlo
- `backend/admin/src/admin_returns.py`: `create_collection` (POST `/api/v1/devoluciones/recolectas`) que inserta en `tbl_returns` con `return_type='recolecta'`.
- Acordar con Planificación (`plan_stops`) cómo se asigna al viaje y quién fija `stop_type='collection'`.
- UI en `src/pages/devoluciones`: formulario de alta (cliente, pedido/factura, artículos, motivo, dirección).
