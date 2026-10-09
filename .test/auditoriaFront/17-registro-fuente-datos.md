# Registro — Ronda 2, Fase B (fuente de datos fija, sin JSON de prueba ni variable de entorno)

Fecha: 2026-10-08.

- `src/lib/tarifas/data/index.ts`: `db()` construye siempre `HttpDataSource`. Se eliminó `VITE_TARIFAS_DATASOURCE`, la rama `json` y el alias `postgres`. `DataSource.kind` es solo `'http'`. `setDataSource` se mantiene como gancho de inyección (pruebas Aurora e2e y almacén en memoria). `VITE_TARIFAS_API_URL` sigue siendo opcional.
- Movido a pruebas (no existe en el código de la app): el driver (`data/json/*`) → `__tests__/helpers/memory/{driver,filtering,integrity}.ts` como `MemoryDataSource` (sin `localStorage`); el store → `memory/store.ts` (estado en memoria); `localData/seed.json` → `__tests__/fixtures/seed.json`; `json-datasource.test.ts` (32 pruebas del contrato FK/unicidad/append-only) → `memory/memoryDataSource.test.ts`.
- Nuevo `src/test/setupTarifas.ts` (en `setupFiles` de `vitest.config.ts`): cada prueba arranca con un `MemoryDataSource` limpio. Por eso ~340 pruebas que usaban la semilla no se reescribieron.
- Borrado de la app: `data/json-datasource.ts`, `localData/`, `components/tarifas/DataModeBanner.tsx` y sus 3 usos (ya no existe «modo demo»).
- `vitest.config.ts`: fuera el `define` de la variable. `eslint.config.ts`: fuera la exclusión de `localData`; nueva regla `no-restricted-imports` que impide que el código de la app (no pruebas) importe de `__tests__`.
- `.env.local`: eliminada la línea `VITE_TARIFAS_DATASOURCE`.
- Docs: `GUIA_TARIFADOR.md` (§6 con dos modos, diagrama y tabla de problemas). `ROADMAP.md`, `.agents/CANAL.md` y `docs/work/…` conservan la mención como histórico.
- **Consecuencia:** el módulo ya no funciona sin backend (túnel + `api:local` o API desplegada).
- Verificación: tsc 0 · vitest (sin `src/__tests__`) 906 pasadas / 0 fallidas (bajó de 917 por las 11 pruebas del selector retirado) · eslint 0 errores.
