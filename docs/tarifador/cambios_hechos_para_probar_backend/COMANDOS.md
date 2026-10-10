# Comandos

Desde la raíz del repo.

## Levantar el mock (sin túnel)

1. `.env.local` con `VITE_MOCK_AUTH=true`.
2. `npm run dev` → http://localhost:3000, iniciar sesión con cualquier credencial. Rol de prueba: selector de la esquina inferior izquierda. Volver a la semilla: `__tarifasMockReset()` en la consola del navegador.

**Aviso sobre Tailwind.** El `package.json`/`package-lock.json` sin commitear del usuario piden `tailwindcss ^4.3.3`, que rompe el CSS (`[postcss] It looks like you're trying to use tailwindcss directly as a PostCSS plugin`). Remedios, de menos a más invasivo:
- Solo para probar, sin tocar esos archivos: `npm i --no-save --no-package-lock tailwindcss@3.4.19` (un `npm install` o `npm ci` lo deshace).
- Copia aislada: `git archive HEAD | tar -x -C /tmp/tarifador-copia`, superponer `src/` y `scripts/`, `npm ci` ahí y `VITE_MOCK_AUTH=true npx vite --port 3100`. Es lo que usaron los recorridos de la auditoría.
- Definitivo (descarta los cambios de firebase, mssql y express del usuario): `git diff package.json package-lock.json > ~/wip-deps.patch`, luego `git checkout package.json package-lock.json` y `npm ci`.

## Semilla demo

- Regenerar: `npx jiti scripts/build-demo-seed.ts` (escribe `src/lib/tarifas/data/memory/seed.demo.json`).
- Verificar que sigue calculando: `npx vitest run src/lib/tarifas/__tests__/demoSeed.test.ts src/lib/tarifas/__tests__/demoSeed.http.test.ts`.

## Pruebas, tipos y lint

- Todo: `npx vitest run` (1070 pruebas al 2026-10-10; las 5 suites que exigen Aurora se omiten).
- Backend simulado: `npx vitest run src/lib/tarifas/data/memory`.
- Tipos: `npm run type-check`.
- Lint de lo tocado: `./node_modules/.bin/eslint <rutas>`. `npm run lint` completo falla en `HEAD` por errores previos (ver README).
- Que el mock no llegue al build: `VITE_MOCK_AUTH=true npx vite build --outDir /tmp/dist-check` y `grep -rl "Fletes Orinoco\|createFakeBackend" /tmp/dist-check/assets/*.js` no debe encontrar nada.

## Repetir las escrituras del mock contra el backend real (sin base de datos)

1. En el navegador, tras usar la app en modo mock: `copy(JSON.stringify(window.__tarifasOpLog))` y pegarlo en un archivo `oplog.json`.
2. `python3 -I docs/tarifador/cambios_hechos_para_probar_backend/herramientas/replay_payloads.py oplog.json --required`
   - Usa `tarifas_schema` y `tarifas_sql` de `backend/tarifas/src` (los de la Lambda). Reporta 400 (columna desconocida, tipo inválido), 405 (solo lectura, solo agregar) y NOT NULL faltantes.
   - `--ignore-uuid` si el registro viene de pruebas con ids legibles; `--jsonl` si es una operación por línea.

## Recorridos de navegador (Playwright)

En `herramientas/e2e/`. Requieren el mock levantado (`AUDIT_BASE`, por defecto http://localhost:3100) y Playwright con Chromium (`npx playwright install chromium`). Ajustar en `lib.mjs` la ruta absoluta de `@playwright/test`.

    node docs/tarifador/cambios_hechos_para_probar_backend/herramientas/e2e/fase2-reglas.mjs

Scripts: `fase2-reglas` (reglas: crear, desactivar, reactivar), `fase3-6-config` (tarifarios, margen, país, Probador), `fase4-costos` y `fase4b-primer-componente` (costos, H9), `fase7-liquidar`, `fase7-liquidar-paises Venezuela`, `fase7b-estados` (emitir, estados, anular, re-liquidar), `fase7c-bloqueo` (viaje sin zona), `fase8-roles` (roles y bitácora), `fase9-mejoras` (avisos). Escriben capturas en `herramientas/capturas/` y las escrituras en `herramientas/oplog.json` (ambos ignorados por git).

## Evidencia de H9

Copiar `herramientas/h9-http-tx-id.test.ts` a `src/lib/tarifas/__tests__/` y correr `npx vitest run src/lib/tarifas/__tests__/h9-http-tx-id.test.ts`. Con el arreglo P10a ya aplicado en `saveStructure` esa prueba *documenta el defecto del driver* (el `tx.insert` sin id devuelve `undefined`), no del código de la app; la regresión del arreglo está en `demoSeed.http.test.ts`.
