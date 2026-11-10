# 05 — Retirar rutas de chofer duplicadas en `backend/tracking`

**Estado:** pendiente por implementar.

## Qué falta

`backend/tracking/src/app.py` (tabla `ROUTES`, ~línea 940) conserva rutas del chofer (`mi-viaje`, `consentimiento-gps`, `posiciones`, `paradas/*`) que duplican a `backend/mobile`, con login del TMS. La app ya no las usa.

## Por qué

Dos implementaciones de la misma regla (geocerca, evidencias, cierre del viaje) divergen: es la causa de la contradicción de [01](./01-contratos-y-docs-desactualizados.md). Un cambio en una no llega a la otra.

## Cómo hacerlo

1. Confirmar con `scripts/tracking-contract-check.mjs` y `simular-posiciones.mjs` que nada del monitor ni de los scripts llama a esas rutas.
2. Quitarlas de `ROUTES`, sus handlers de `app.py` y sus pruebas en `backend/tests/test_tracking.py`; actualizar `contrato-api-v2.md`.
3. `scripts/simular-posiciones.mjs` debe pasar a usar `/api/mobile/v1/posiciones` (o `backend/mobile/scripts/simular_recorrido.py`).
4. Decidir antes si se mantiene alguna como compatibilidad con la versión vieja de la app.
