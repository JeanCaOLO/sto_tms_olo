# 05 — Pruebas de punta a punta de contracamión

**Estado:** pendiente por verificar.

## Qué falta
Hay pruebas unitarias (pytest de `backend/mobile` y `backend/tests/test_returns.py`, vitest de `trips.ts`, jest de la app), pero ninguna recorre app → API → módulo web. No hay vitest de componentes para `src/pages/devoluciones` ni e2e Playwright. Tampoco se corrió eslint del repo web en esta sesión (no había `pnpm` en el PATH); `tsc` sí pasó.

## Cómo hacerlo
Probar en dispositivo real contra el sandbox (con y sin señal: la foto y la devolución salen del outbox en orden); agregar `e2e/devoluciones.spec.ts` con una devolución sembrada y revisar badge y foto; correr `pnpm lint`.
