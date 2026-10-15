# 2026-10-12 — Zonas con geocerca en el mapa (frontend) + zona del punto de entrega

> Responde al pedido de Claude en `.agents/CANAL.md` (2026-10-12): el backend de
> geocercas ya estaba (`sql/34`: `zones.geofence`/`color`, `delivery_points.zone_source`,
> triggers de reubicación). Esta entrada cubre **el frontend** (mi terreno).

## What changed

**Catálogo de Zonas (`/zonas`) con mapa:**
- Dependencia nueva **`@geoman-io/leaflet-geoman-free@2.18.3`** (fijada) para
  dibujar/editar polígonos sobre `leaflet`/`react-leaflet` (ya presentes).
- `src/pages/zonas/components/ZoneMap.tsx` (nuevo): pinta zonas con color+nombre,
  encuadra por país (CR/VE) o por las cercas, y en modo edición dibuja/edita una
  geocerca y emite GeoJSON. Conversión `[lon,lat]`↔`[lat,lng]` encapsulada.
- `src/pages/zonas/components/ZonaModal.tsx` reescrito: mapa + color + país; el
  `code` es de solo lectura al editar (lo usan tarifas/WMS).
- `src/pages/zonas/page.tsx`: selector de país, mapa panorámico, columnas de
  geocerca y nº de puntos por zona, resaltado al click.

**Puntos de Entrega (`/tiendas`):**
- `zone_source` en el `LIST_SELECT` + badge de origen (Automática/Manual/WMS).
- Modal: selector de zona "Automática (según el mapa)" (`zone_source:'map'`) vs.
  zona concreta (`zone_id` + `zone_source:'manual'`). Lógica en
  `delivery-point-payload.ts`.
- Filtro por zona server-side (`.eq('zone_id', …)`).

**i18n** es/en (`zones.*`, `deliveryPoints.zone*`/`filterZone`).

**Documentación:** guía `docs/guides/zonas-con-mapa.md`; corrección de la fila
`zones` en `docs/arquitectura-tms-oms/03-modelo-datos-erd.md` (decía "No existe").

## Why

Pedido del usuario (vía Claude), decisiones ya tomadas: zonas dibujadas en mapa
(nombres Zn), asignación automática del punto por la cerca con override manual.

## How — decisiones

- **geoman** sobre leaflet-draw: más mantenido, dibujar+editar+arrastrar en una
  sola librería, integra con react-leaflet 5.
- **No se tocó el modelo de BD**: el backend de Claude ya resuelve la asignación
  con triggers; el front solo dibuja la cerca y marca `zone_source`.
- Conteo de puntos por zona: una query por zona (`ponytail:` O(nº de zonas), hoy
  ~17 CR + pocas VE). Upgrade path: endpoint de conteo por país (ofrecido por
  Claude) si crece.

## Verification

- type-check (`tsc --noEmit`): **0 errores**.
- `vitest run src/pages/{tiendas,zonas,oms} src/components/base`: **46/46**
  (incluye 3 casos nuevos en `delivery-point-payload.test.ts` para la lógica
  auto/manual de zona).

## Known issue / follow-up

- **Lockfile:** geoman se instaló con `bun add` (no hay pnpm/npm en el shell de
  Kiro); se dejó la entrada en `package.json` y en `node_modules`, pero el
  `bun.lock` que generó se borró y **`pnpm-lock.yaml` NO quedó actualizado**.
  Antes de desplegar hay que correr `pnpm install`. Avisado a Claude en el canal.
- [ ] Claude: `pnpm install` + desplegar al sandbox junto con el backend `sql/34`.
- [ ] Opcional: endpoint de conteo de puntos por zona por país (una sola llamada).
