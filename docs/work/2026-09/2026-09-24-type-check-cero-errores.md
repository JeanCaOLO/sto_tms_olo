# 2026-09-24 — Type-check del frontend a cero errores

## What changed
Se corrigieron los 20 errores de TypeScript que arrastraba el frontend como baseline.
`npm run type-check` pasa de 20 errores a **0**. Todos eran errores de tipos reales
(props desalineadas, valores fuera de union types, un campo inexistente en el modelo
de auth, una parameter property no permitida), no falsos positivos.

## Why
El baseline de 20 errores hacía ruido en cada verificación y escondía posibles
regresiones nuevas (había que distinguir "mis errores" de "los de siempre"). Con el
type-check en cero, cualquier error futuro es señal real.

## How
- **CsvImportModal (3 pantallas):** Conductores llamaba con `name:` en vez de `key:`
  en `fields`, `onSuccess` en vez de `onImportComplete`, y sin `organizationId`;
  Vehículos con `onSuccess`. Se corrigieron las props y se hizo `organizationId`
  opcional en el modal (cuando hay `transformRow`, esa función resuelve el
  `organization_id`, así que el prop no siempre aplica). `dataToInsert` tipado como
  `Record<string, any>` para el reasignado tras `transformRow`.
- **Contratos:** colores inválidos en `StatCard` (`green`→`emerald`, `yellow`→`amber`).
- **Devoluciones/ReturnModal:** `variant="outline"` inexistente → `secondary`.
- **Seed:** usaba `session.user.user_metadata.organization_id` (campo de Supabase que
  este proyecto no tiene) → `appUser.organization_id` vía `useAuth`.
- **useAuth:** el cleanup de `useEffect` devolvía un `boolean` (por `Set.delete()`);
  envuelto en bloque para retornar `void`.
- **lib/supabase.ts:** `constructor(private table)` (parameter property) no permitido
  con `erasableSyntaxOnly` → campo declarado explícito.

## Promoted knowledge
El proyecto compila limpio; conviene mantenerlo así (un error nuevo = señal real).
La regla "no props desalineadas / usar los union types del componente" es implícita
ahora que no hay baseline que las tape.

## Follow-ups
- [ ] None. type-check en 0; vitest 149/149.
