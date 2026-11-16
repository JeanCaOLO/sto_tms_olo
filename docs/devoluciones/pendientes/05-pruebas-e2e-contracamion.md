# 05 — Pruebas de punta a punta de contracamión

> **Reconciliado 2026-11-11:** E2E sigue pendiente; m08 sí está aplicada y el archivo móvil comparado ya está desplegado. La afirmación antigua de foto bloqueada por m08 está superada. El bloqueo confirmado para mostrar fotos en web es bucket/permisos de admin. Pruebas actuales: 54 frontend verdes; 81 backend verdes/1 fallida; TypeScript global falla. Ver [estado actual](../ESTADO_ACTUAL.md).

**Estado:** pendiente por verificar.

## Qué falta
Hay pruebas unitarias (pytest de `backend/mobile` y `backend/tests/test_returns.py`, vitest de `trips.ts`, jest de la app), pero ninguna recorre app → API → módulo web. No hay vitest de componentes para `src/pages/devoluciones` ni e2e Playwright (`e2e/` tiene solo `oms-handoff`, `planificacion` y `rutas-y-guards`). Tampoco se corrió eslint del repo web en esta sesión (no había `pnpm` en el PATH); `tsc` sí pasó.

**Datos de prueba:** la mock compartida (`docs/tarifador/demo-data/MOCK_FLUJO_3_MODULOS.md`) ya cubre en parte esta prueba: devoluciones pendientes, aprobada, recibidas, rechazada, una recolecta y viajes en ruta, con formularios y artículos de pedido para la app. No cubre la foto (no siembra archivos S3 y `photo_url` queda vacío) ni una devolución creada desde la app, porque siembra las devoluciones directamente en BD. m08 ya fue verificada; para abrir la foto en administración faltan bucket y permisos, pendiente 01.

## Cómo hacerlo
Probar en dispositivo real contra el sandbox (con y sin señal: la foto y la devolución salen del outbox en orden); agregar `e2e/devoluciones.spec.ts` con una devolución sembrada y revisar badge y foto; correr `pnpm lint`.
