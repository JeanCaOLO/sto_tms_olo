# Build Instructions — FR16 (Devoluciones/Pickups)

## Build de producción

```bash
pnpm run build
```

Vite build del frontend completo (no solo el módulo de Planificación — es una
SPA de una sola build). Sin pasos adicionales por FR16.

## Type-check

```bash
pnpm exec tsc --noEmit
```

## Lint (archivos tocados por esta unidad)

```bash
pnpm exec eslint src/pages/planificacion/ e2e/planificacion-flujo.spec.ts
```

## Notas

- El repo usa **pnpm** (no `bun add`/`bun install`) desde que se agregó Vitest
  en code-generation — `bun add` falla al migrar `pnpm-lock.yaml`. CI debe usar
  `pnpm install` + los comandos de arriba.
- Sin migraciones de base de datos ni cambios de infraestructura (ADR-2).
