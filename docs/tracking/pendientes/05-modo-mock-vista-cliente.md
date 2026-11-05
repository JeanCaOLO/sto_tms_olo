# 05 — Modo mock para la vista del cliente

**Estado:** pendiente por implementar. El backend simulado (`src/pages/tracking/mock/fakeTrackingBackend.ts`) no responde `GET /v1/tracking/mis-entregas`, así que en modo mock el rol Cliente no tendría datos.

## Cómo hacerlo
- Agregar la ruta al `fakeTrackingBackend` devolviendo `{ view: 'client', items }` a partir de `sim.ts` (una parada de un viaje en curso: `listo`, `en_camino` con ETA y camión, `entregado` sin camión).
- Cubrir los tres estados en `modo-mock.md` y en `__tests__/mock-backend.test.ts`.
