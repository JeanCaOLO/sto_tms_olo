# Integration Test Instructions — FR16

FR16 es un cambio de frontend sin backend nuevo (ADR-2); "integración" aquí es
la suite e2e Playwright, que ejercita el flujo completo contra los mismos
fallbacks/Supabase que usa la app real.

```bash
pnpm exec playwright test
```

Cubre: selección de viaje, optimización con capacidad, generación de ruta,
excepción sin coordenadas, y el caso FR16 (badge "Devolución" + subtotal de
capacidad) — `e2e/planificacion-flujo.spec.ts`. Ver `test-results.md` para el
resultado real de esta corrida.
