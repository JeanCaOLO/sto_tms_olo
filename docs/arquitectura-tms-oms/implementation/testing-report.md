# Testing Report — Fase 0/1

Ejecutado 2026-09-21, con el túnel SSM a Aurora activo.

```
npx vitest run
 Test Files  15 passed (15)
      Tests  151 passed (151)   (tras confirmar que la única falla intermitente
                                  observada en una corrida anterior era flaky —
                                  ver abajo — y no una regresión)
```

## Desglose relevante a esta fase

| Suite | Tests | Resultado |
|---|---|---|
| `src/__tests__/db-connectivity.test.ts` | 60 | ✅ Verde (actualizada con tablas de Fase 1) |
| `src/__tests__/multi-tenant-isolation.test.ts` (nueva) | 7 | ✅ Verde |
| Resto (Planificación, Tarifas — sin cambios de código) | 84 | ✅ Verde |

## Falla intermitente investigada (no es una regresión)

`src/pages/planificacion/eflow-api.test.ts` falló una vez por una
comparación de timestamp con 1ms de diferencia entre dos llamadas a
`new Date().toISOString()` en el propio test (no en código de Fase 1).
Reproducida en aislamiento inmediatamente después: **17/17 verde**. Es un
test preexistente frágil, no relacionado con este trabajo — se deja igual,
no se "arregla" fuera del alcance de esta fase.

## `npm run type-check`

Mismos errores preexistentes reportados en sesiones anteriores de este
proyecto (`CsvField`, `StatCard` color union, `Badge` variant `outline`) —
**cero errores nuevos** introducidos por el trabajo de esta fase.

## Cobertura pendiente (documentada, no oculta)

Los Casos 2 y 3 de aislamiento (§20 del prompt de implementación — pedidos
de un cliente no visibles para otro; CR↔VE) no tienen todavía datos reales
de `orders`/`routes` contra los que probarse (esas tablas están vacías
desde la limpieza de datos de ejemplo de una sesión anterior, y el seed de
Costa Rica de esta fase no se ha ejecutado). Quedan como TODO explícito en
`fase-01-multi-country.md`, no como "hecho" implícito.
