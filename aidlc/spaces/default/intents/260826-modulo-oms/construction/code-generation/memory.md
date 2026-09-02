<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-08-28T00:00:00Z — Deviación (autorizada por el usuario): se corrió code-generation en aislamiento (`--single`) SIN los insumos previos (units-generation, domain/functional/nfr/infrastructure-design). El prompt autorizó explícitamente "si faltan insumos de etapas previas, procede solo con el frontend". Se usó un unit sintético `oms-frontend-prototype` para la ruta de artefactos.
- 2026-08-28T00:00:00Z — Interpretación: "mockup funcional" = prototipo React navegable con datos mock (sin backend/Supabase/Lambdas). Se estructuró Page→Controller→omsApi(mock) por §11 y se reutilizó el design system del repo (Card/Button/Badge/Input/Select/StatCard, teal/slate, Remix) sin kits nuevos, según la regla de proyecto afirmada.
- 2026-08-28T00:00:00Z — Deviación de entorno: hubo que importar `useState`/`useEffect` explícitamente en los controllers `.ts` y en algunas pages; el `unplugin-auto-import` cubre el runtime pero su `auto-imports.d.ts` no se regeneró para los archivos nuevos, y `tsc --noEmit` los marcaba como no encontrados. Import explícito es idempotente con el auto-import.
- 2026-08-28T00:00:00Z — Tradeoff: no se generaron pruebas automatizadas — el repo no tiene runner ni script test (codekb), y es un mockup visual sin lógica real. Documentado en unit-test-instructions.md; la regla de extraer lógica a `.ts` puro y probarla aplica cuando entre lógica real.
- 2026-08-28T00:00:00Z — FR8 (inserción al lago) y FR10 (permisos/RLS) marcados Deferred en traceability.json: dependen de backend/seguridad fuera del alcance del prototipo. Verificación: build Vite OK, type-check limpio en pages/oms, eslint exit 0.
