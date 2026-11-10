# 05 — Pruebas de punta a punta de contracamión

**Estado:** pendiente por verificar.

## Qué falta
Hay pruebas unitarias (pytest de `backend/mobile` y `backend/tests/test_returns.py`, vitest de `trips.ts`, jest de la app), pero ninguna recorre app → API → módulo web. No hay vitest de componentes para `src/pages/devoluciones` ni e2e Playwright (`e2e/` tiene solo `oms-handoff`, `planificacion` y `rutas-y-guards`). Tampoco se corrió eslint del repo web en esta sesión (no había `pnpm` en el PATH); `tsc` sí pasó.

**Datos de prueba:** la mock compartida (`docs/tarifador/demo-data/MOCK_FLUJO_3_MODULOS.md`) ya cubre en parte esta prueba: devoluciones pendientes, aprobada, recibidas, rechazada, una recolecta y viajes en ruta, con formularios y artículos de pedido para la app. No cubre: la foto (no hay archivos en S3, `photo_url` queda vacío y la foto desde la app está bloqueada hasta aplicar m08, pendiente 01), ni una devolución creada desde la app, porque la mock siembra las devoluciones directo en la BD.

## Cómo hacerlo
Probar en dispositivo real contra el sandbox (con y sin señal: la foto y la devolución salen del outbox en orden); agregar `e2e/devoluciones.spec.ts` con una devolución sembrada y revisar badge y foto; correr `pnpm lint`.
