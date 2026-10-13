# Catálogo de Zonas con mapa y zona del punto de entrega

Guía de uso de la funcionalidad de **zonas dibujadas sobre el mapa** (geocercas)
y de cómo se asigna la zona a cada punto de entrega.

## Qué es

Una **zona** es un área de entrega que pertenece a un país y tiene una
**geocerca**: un polígono dibujado sobre el mapa. Los **puntos de entrega**
caen automáticamente en la zona cuya geocerca los contiene; el usuario puede
fijar la zona a mano cuando haga falta.

Backend: `zones.geofence` (GeoJSON Polygon/MultiPolygon, WGS84) y `zones.color`
(sql/34). La asignación automática y la reubicación la resuelven **triggers de
la base de datos** (no hay endpoint nuevo). `delivery_points.zone_source`
guarda de dónde salió la zona del punto.

## Catálogo de Zonas (`/zonas`)

1. **Elegí el país** en el selector sobre el mapa. El mapa se encuadra en ese
   país y pinta todas sus zonas activas con su color y nombre.
2. **Nueva Zona** / editar abre el modal con mapa:
   - Elegí el **país** (obligatorio) → se carga el mapa.
   - Dibujá la **geocerca** con las herramientas de dibujo (polígono o
     rectángulo) arriba a la derecha del mapa. Podés arrastrar los vértices
     para ajustarla. Solo se guarda **una** geocerca por zona.
   - Poné **nombre** (ej. `Z1 · Casco Central`), **color** y, al **crear**, el
     **código**. Al **editar**, el código es **de solo lectura**: lo usan las
     reglas de tarifa y la ingesta del WMS, cambiarlo rompería esos cruces.
   - Guardá. Los puntos del país que caen dentro de la nueva/editada cerca se
     reubican solos (los que estén en modo automático).
3. **Desactivar** una zona (estado inactivo) suelta sus puntos automáticos, que
   se reasignan a otra cerca que los contenga, si hay.
4. La tabla muestra, por zona: color, código, país, si tiene geocerca y el
   **número de puntos** que contiene.

Nota: las zonas de agrupación de tarifa sin área (ej. `GAM`, `RURAL`) no tienen
geocerca y no se dibujan.

## Zona del punto de entrega (`/tiendas`)

En el modal del punto, el campo **Zona** tiene dos modos:

- **Automática (según el mapa)**: la zona la calcula la geocerca que contiene
  al punto. Es el modo por defecto. En la BD queda `zone_source = 'map'`.
- **Una zona concreta**: la fija el usuario; el mapa ya no la cambia. Queda
  `zone_source = 'manual'`.

Los puntos que vinieron de la ruta del WMS (Cofersa) conservan su zona del WMS
(`zone_source = 'wms'`) hasta que alguien los cambie.

En la lista, la columna **Zona** muestra un badge con el origen
(Automática / Manual / WMS) y hay un **filtro por zona** (server-side).

## Límites conocidos

- El conteo de puntos por zona en `/zonas` hace una consulta por zona
  (`ponytail:` O(nº de zonas), hoy ~17 CR + pocas VE). Si crece mucho, pedir a
  Claude un endpoint de conteo por país.
- La geocerca se guarda como GeoJSON `[lon, lat]`; Leaflet usa `[lat, lng]`.
  La conversión vive solo en `ZoneMap.tsx` (`toLatLngs` / `toGeoJSONGeometry`).
