# Tracking · Replay del recorrido

Fecha: 2026-10-17. Origen: blueprint web-admin (Historial / replay, EXT-05), `.test/blueprint/web-admin/modulos-y-pantallas.md`.

## Qué hace
Botón **Reproducir recorrido** en el panel del viaje (visible con ≥2 puntos de rastro). El mapa reemplaza el camión en vivo por uno que recorre el rastro: línea punteada gris = recorrido completo, línea de color = tramo ya hecho, círculos ámbar = paradas detectadas (≥3 min dentro de 100 m). Barra inferior: play/pausa, línea de tiempo, hora del punto, velocidad 1/2/5/10× y salir. Dura 30 s a 1×. Cambiar de viaje cierra el replay.

## Archivos (`src/pages/tracking/`)
`replay-logic.ts` (interpolación y paradas, puro), `hooks/useReplay.ts` (reloj), `components/ReplayControles.tsx`, cambios en `FlotaMapa`, `ViajeDetallePanel`, `page.tsx` e i18n es/en. Pruebas: `__tests__/replay-logic.test.ts` + 1 en `components.test.tsx`.

## Límites
- Usa `detail.trail` (en datos locales máx. 100 puntos). Un rango de fechas arbitrario con `driver_track` (endpoint propio, auditado) queda pendiente para el modo API.
- Sin probar en navegador; `tsc` y ESLint de tracking limpios, 57 pruebas Vitest pasan.
