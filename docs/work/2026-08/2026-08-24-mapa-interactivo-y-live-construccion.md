# 2026-08-24 — Mapa interactivo (trayecto real, clicks, zoom) y mapa en vivo en "Ruta en Construcción"

## What changed
Segunda y tercera ronda sobre `RutaMapaPreview.tsx` (el componente de mapa introducido antes hoy), todas pedidas por el usuario tras probar la primera versión:

**Ronda 2 — interactividad del mapa en "Rutas Generadas":**
- La polyline ahora sigue calles reales, no línea recta: nuevo `route-geometry.ts` (`obtenerGeometriaRuta`) pide `/route/v1/driving/{coords}?overview=full&geometries=geojson` a OSRM (reusa `osrm-config.ts`), con fallback silencioso a línea recta si falla.
- "+N paradas más" en `StopMiniPreview.tsx` es clickeable, abre `SecuenciaRutaModal.tsx` nuevo (mapa grande de 420px + lista completa de paradas).
- Click en un marcador del mapa abre `ParadaDetalleModal.tsx` nuevo con el detalle del pedido de esa parada.
- Zoom con scroll solo cuando el mouse está encima del mapa (`scrollWheelZoom` se activa/desactiva en `onMouseEnter`/`onMouseLeave`).
- **Bug real arreglado:** al abrir el modal de editar ruta, todos los mapas Leaflet de las demás cards se dibujaban por encima — Leaflet usa `z-index:1000` en sus controles internos, los modales estaban en `z-50`. Se subieron todos los modales del módulo a `z-[2000]`.

**Ronda 3 — mapa en vivo mientras se arma la ruta:**
- `RutaMapaPreview` ahora también se usa en `RutaEnConstruccion.tsx` (pestaña "Nueva Ruta"), debajo de la lista de paradas — se actualiza solo mientras el usuario agrega/quita/reordena pedidos, sin código nuevo de sincronización (el componente ya era reactivo a su prop `pedidos`).
- Doble-click en una parada de la lista (`ParadaCard.tsx`) hace que el mapa haga `flyTo` a esa ubicación (prop nueva `paradaEnfocadaId` en `RutaMapaPreview`, patrón igual al de `AjustarBounds`).
- Debounce de 400ms antes de pedir geometría a OSRM (`GEOMETRY_DEBOUNCE_MS`), para no golpear el servicio en cada paso de un arrastre rápido.

## Why
El usuario probó la primera versión del mapa en vivo y pidió estas mejoras concretas: que la ruta se vea por calles reales (no línea recta) "para darle más flow", ver el detalle de una parada con un click, que el mapa no quede tapado por otros al editar, zoom con scroll, y —lo más importante— tener el mismo mapa *mientras se arma* la ruta (no solo después de generarla), con doble-click para ubicar una parada específica.

## How
Todo el trabajo de mapas se delegó a `crew:frontend-architect` en background, en 2 rondas de `SendMessage` sobre el mismo agente (mantiene contexto del componente entre rondas). Yo verifiqué cada entrega en el navegador antes de darla por buena:
- Ronda 2: confirmé que la polyline tiene muchos más puntos que paradas (14 puntos para 4 paradas → sigue calle real, no recta), que el click en un marcador abre el modal correcto, y — el hallazgo más útil — que en el centro de la pantalla con el modal de editar abierto, `document.elementFromPoint()` devuelve el modal y no el mapa (`closest('.leaflet-container')` = false), confirmando el fix de z-index de forma verificable sin necesitar captura visual.
- Ronda 3: el agente no pudo verificar mecánicamente el doble-click ni el drag (su sesión de navegador corre sin superficie visual — mismo problema que yo encontré después). Lo verifiqué yo mismo interceptando `L.Map.prototype.flyTo` en la consola del navegador antes de disparar un `dblclick` nativo real sobre una `ParadaCard`: confirmé que se llama con las coordenadas exactas de la parada correcta. No pude confirmar visualmente que la animación de paneo se vea suave en pantalla — esta sesión de navegador tampoco composita frames (mismo motivo por el que `screenshot` falla acá), así que ese último paso queda pendiente de que el usuario lo confirme con su propio mouse.

## Promoted knowledge
Ninguna nueva — el patrón de verificar features de Leaflet sin captura visual (interceptar métodos del prototipo, revisar `elementFromPoint`, contar puntos de un `<path>` SVG) puede ser útil para quien retome este módulo en un entorno de pruebas sin superficie visual.

## Follow-ups
- [ ] Confirmar visualmente (mouse real) que el `flyTo` del doble-click y el scroll-zoom-al-hover se sienten bien — ninguno de los dos se pudo verificar con captura de pantalla en esta sesión.
- [ ] El drag-and-drop nativo (HTML5 `draggable`) tampoco se pudo simular mecánicamente (limitación conocida de automatización de navegador, no del código) — confirmar que el mapa se redibuja fluido durante un arrastre real, no solo al soltar.
