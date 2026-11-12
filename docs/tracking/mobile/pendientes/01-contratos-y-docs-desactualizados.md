# 01 — Contratos y docs desactualizados

**Estado:** pendiente por implementar (solo edición de documentos).

## Qué falta

Al documentar la app móvil se encontraron contradicciones entre docs previos y el código vigente. La verdad es el código; estos docs deben corregirse o apuntar a `docs/tracking/mobile/`.

| # | Doc | Dice | El código hace |
|---|---|---|---|
| 1 | `docs/tracking/contrato-api-v2.md:74-82` y `decisiones.md` | Tracking no termina viajes; lo termina Planificación | `backend/mobile/.../stops.py` cierra el viaje y el `plan_trip` al registrar la última parada (`route_closed`, evento `route_completed`) |
| 2 | `contrato-api-v2.md` y `.test/blueprint/mobile-tracking-tms/01-contrato-api.md` | El chofer usa `/api/v1/tracking/*` con el login del TMS y rol con solo `view` | La app usa `/api/mobile/v1` con login y JWT propios |
| 3 | `.test/blueprint/.../02-flujo-del-chofer.md` | La app solo ejecuta paradas y no inicia viaje | `start.py`: el chofer inicia su viaje |
| 4 | `docs/tracking/decisiones.md`, `TRACKING_TMS/DEPLOY.md` | Lotes «20 puntos o 60 s»; «108 passed / 2 skipped»; «jest 78 passed» | `policy.ts`: 150 s o 20 puntos; ~151 pruebas de backend; 18 archivos Jest |
| 5 | `backend/mobile/README.md`, `DEPLOY.md` | Ruta `mobile\backend` | Vigente: `sto_tms_olo/backend/mobile` |
| 6 | `docs/tracking/README.md:13` | 97 pruebas con fakes (`backend/tests/test_tracking.py`) | El archivo tiene 107 funciones `test_*` (conteo 2026-11-05) |

La diferencia de precisión GPS (100 m en la app, 200 m en el servidor) **es intencional**; no corregir, solo documentada.

## Por qué

Quien lea el contrato v2 pensará que el viaje lo cierra Planificación y que la app usa el API web; ambos son falsos para el chofer.

## Cómo hacerlo

1. En `contrato-api-v2.md` y `decisiones.md` añadir una nota: «el chofer cierra el viaje al registrar la última parada; ver `mobile/viaje-y-paradas.md`», y reconciliar la decisión «el viaje lo termina Planificación» con esa regla (decisión de producto: ¿se mantiene el cierre automático?).
2. Reemplazar las cifras de `TRACKING_TMS/DEPLOY.md` y `decisiones.md`.
3. Corregir la ruta en `backend/mobile/README.md`.
4. Marcar los blueprints de `.test/blueprint/mobile-tracking-tms/` como históricos o actualizarlos.
