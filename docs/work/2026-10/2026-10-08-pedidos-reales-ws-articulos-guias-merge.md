# 2026-10-08 — Pedidos reales EFLOW, WS en vivo, artículos, Guías de Despacho y merge de main

## What changed

- Carga de **pedidos reales de COFERSA** desde EFLOW (read-only) a Aurora como "mock pero real" (loader `agregar_pedidos_reales.py`): nombres, coordenadas, rutas y artículos reales, con cliente-paraguas COFERSA.
- **WebSocket local** (`ws-local.mjs`) que avisa en vivo cuando entran pedidos nuevos a un plan en borrador; el hook `use-nuevos-pedidos` se suscribe y cae a polling si el WS no está.
- **Artículos del pedido**: endpoint `GET /planificacion/pedidos/{id}/articulos` + tabla en `ParadaModal`. **Sin-asignar**: bloque movido arriba y con detalle (cliente/pedido/zona/peso).
- **Guías de Despacho** reescrito del prototipo Supabase al plan real (1 guía = 1 viaje de plan confirmado/completado; filtro Todas/Confirmadas/Completadas; detalle con paradas + artículos; impresión).
- Migración **19** (`order_items.guia_fiscal`, `orders.wms_trip_number`).
- **Merge de `github/main`** (31 commits: tarifas, compañías, liquidaciones) a `planificacion-2`, sin conflictos.

## Why

Dailies 2026-10-07/08: el negocio pidió usar data real con la nomenclatura real (para que salgan las "pulguillas"), probar en vivo el aviso de pedidos nuevos, ver el detalle de artículos y el de los pedidos sin asignar, y tener Guías de Despacho como resultado del plan. Y mantener `planificacion-2` al día con main.

## How

- EFLOW SQL Server vía `pytds`; los `varchar` son **cp1252** → leer con `CONVERT(VARBINARY)` + `decode('cp1252')`. Maestro de artículos `ARTICULOSGESTION`; coordenadas en WMS `CLIENTES`. Carga a `orders`/`order_items`.
- WS **zero-dep** (handshake RFC6455 con `http`/`crypto`), `GET /trigger` para simular; el hook refetchea el conteo real al recibir el push.
- Backend hexagonal: endpoint de artículos por capas (SQL outbound, port, adapter Aurora, service, inbound). Portado también a TMS-Backend (ver su work del día).
- Guías: deriva de `/planes` (sin backend nuevo); `guia-model.ts` separa el modelo (tope 200 líneas de crew); `GuideDetailModal` con `@media print`.

## Promoted knowledge

- **ADR-0004** (`docs/decisions/0004-guia-fiscal-y-viaje-wms-en-pedidos.md`): las columnas de trazabilidad WMS como 1ª fase de migración WMS/WMH → Aurora (EFLOW read-only en coexistencia).
- Memoria `eflow-pull-gotchas` (encoding cp1252, ARTICULOSGESTION, coords WMS, journey_orders).
- Notion: "🔎 Descubrimientos EFLOW…" y la página de credenciales restringida.
- `docs/planificacion/estimacion-desarrollo.md` (estimación del módulo en marco AIDLC).

## Follow-ups

- [ ] Pushear `planificacion-2` a `github` (y GitLab por FF) cuando se decida.
- [ ] `guia_fiscal` / `invoice_number` llegan NULL en pre-despacho (se llenan al despachar/facturar) — la UI no debe asumirlos presentes.
- [ ] Acotar tipo + índice de `wms_trip_number` si Planificación llega a filtrar/juntar por viaje.
- [ ] Cablear `/tracking` al plan real (pendiente, igual que se hizo con Guías).
- [ ] Pedidos con `RUTA` de mayoreo (fuera de 01–17) quedan con `delivery_zone` NULL.
