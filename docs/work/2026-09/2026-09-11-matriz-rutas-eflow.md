# 2026-09-11 — Matriz de días de ruta desde EFLOW (en vivo)

## What changed

Nuevo sistema en la pestaña **Matriz de Rutas**: **"Días de ruta (EFLOW)"**, que
lee los días de despacho por ruta **en vivo del backend** (`/api/catalogos/
rutas-dias`) en lugar del Excel estático de COFERSA. Cambia con el país.

- `eflow-api.ts`: `fetchRutasDias()` + `RutaDiaRow`.
- `route-systems/eflow-dias.ts`: mapea la respuesta a filas de la matriz; día
  activo → estado `'ambos'` (EFLOW no distingue carga/entrega).
- `route-systems/registry.ts`: `RouteSystem.loader?` + nuevo sistema `eflow-dias`
  (primero en la lista). COFERSA (Excel) se queda como segundo.
- `route-systems/use-route-system.ts`: soporta `loader` y **cachea/recarga por
  país** (clave `id:pais`).
- `MatrizRutasTab.tsx` recibe `pais`; `page.tsx` se lo pasa.

## Why

La matriz salía de un Excel (`cofersa.json`) que hay que regenerar a mano y solo
cubre COFERSA. EFLOW ya tiene los días por ruta y **por empresa** — leerlo en vivo
la mantiene al día y sirve para CR y VE con el switch de país.

## How

Verificado: type-check limpio en los archivos tocados; endpoint responde CR/VE;
deploy a Amplify (job 6). El día activo se pinta con el cuadro verde/rojo ("la
ruta corre ese día").

## Follow-ups

- EFLOW no trae carga/entrega/cita por separado (el Excel sí). Evaluar si hace
  falta ese detalle o basta con "corre ese día".
- Test flaky preexistente `fetchPedidosDeViaje ... cae al mock` (race de 1 ms en
  `order_date` de `getFallbackPedidos`) — estabilizar con fake timers aparte.
