# 2026-09-23 — Reorganización de la documentación suelta en la raíz

## What changed

Se movieron los `.md` sueltos de la raíz del repo a la estructura `docs/` ya existente (la que definen `docs/INDEX.md` y `docs/MAINTAINING.md`). Ningún contenido se reescribió salvo cabeceras de aviso; los movimientos preservan el texto.

Movimientos:

| Origen (raíz) | Destino |
|---|---|
| `Estandares_Desarrollo_AWS_Intelix.md` | `docs/standards/desarrollo-aws-intelix.md` |
| `Estandares_Arquitectura_Datos.md` | `docs/standards/arquitectura-datos.md` |
| `ANALISIS_SISTEMA_TMS.md` | `docs/reference/analisis-sistema-tms.md` |
| `PLAN_MODULO_OMS.md` | `docs/reference/plan-modulo-oms.md` |
| `AGENTES_IA_KIRO.md` | `docs/reference/agentes-ia-kiro.md` |
| `Estructura_Costos_Transporte.md` | `docs/reference/estructura-costos-transporte.md` |
| `MOCKING.md` | `docs/guides/mocking-planificacion.md` |
| `HANDOFF.md` | `docs/work/2026-08/2026-08-12-handoff-planificacion.md` |
| `prueba.md` | **eliminado** (contenido: la palabra "prueba") |

Además:

- Nuevas carpetas `docs/standards/` y `docs/reference/`, cada una con su `README.md` de índice.
- `docs/INDEX.md`: filas nuevas para `reference/` y `standards/` en la tabla de rutas y en el árbol de documentación.
- Referencias cruzadas en prosa y comentarios de código actualizadas a las rutas nuevas (`src/lib/mock-store.ts`, `src/hooks/useAuth.tsx`, `src/__tests__/db-connectivity.test.ts`, `docs/guides/eflow-qa-data.md`, `docs/arquitectura-tms-oms/{README,01-as-is,07,08}.md`, y las referencias internas entre los archivos movidos).
- `estructura-costos-transporte.md` ↔ `sql/04_costeo_base_costa_rica.sql` enlazados en ambos sentidos (son la misma data en formato legible vs. ejecutable).

## Why

Había ~10 `.md` sueltos en la raíz mientras `docs/` ya tenía una estructura definida (decisions, guides, requirements, stories, work, briefs, arquitectura-tms-oms). Contradecía el principio "single source of truth / folder = nature" de `MAINTAINING.md` y dificultaba encontrar cada cosa.

## Decisiones de criterio

- **`standards/code-quality.md` NO se movió.** Es propiedad del plugin crew y su ruta exacta la esperan los hooks (`hooks/kiro-guard-code-quality.js`, `hooks/lib/ceilings.js`) y el steering (`.kiro/steering/crew-baseline.md`). Moverlo rompía enforcement funcional. Se dejó en `standards/` y `docs/standards/README.md` apunta a él.
- **Las entradas previas de `docs/work/` NO se editaron** (convención de inmutabilidad de `MAINTAINING.md`). Siguen citando `MOCKING.md`/`HANDOFF.md` por su nombre viejo — es correcto: son evidencia histórica de cuando el archivo se llamaba así.
- **`HANDOFF.md` y `MOCKING.md` quedaron marcados como obsoletos** con un aviso arriba que apunta a `docs/reference/analisis-sistema-tms.md` (2026-09-21) como fuente de verdad actual: describían el backend como Supabase + pnpm + puerto 3000, pero la arquitectura real es Express + AWS Aurora (`supabase.ts` es un shim) y el dev server levanta con npm.

## Promoted knowledge

- `docs/INDEX.md`, `docs/standards/README.md` y `docs/reference/README.md` son ahora los índices vivos de esas dos ramas.
- La contradicción de arquitectura (agosto Supabase vs. septiembre Aurora) quedó resuelta apuntando todo a `analisis-sistema-tms.md` como verdad vigente.

## Corrección (tras revisión de Claude en `.agents/CANAL.md`)

En la primera pasada asumí erróneamente (por un `file_search` que no lo encontró) que `CONTEXTO_PROYECTO_TMS.md` no existía, y lo traté como enlace roto. **Sí existía en `HEAD`.** Corregido: recuperado con `git show HEAD:CONTEXTO_PROYECTO_TMS.md` y ubicado en `docs/reference/contexto-proyecto-tms.md`; las citas en `plan-modulo-oms.md`, `agentes-ia-kiro.md` y `analisis-sistema-tms.md` apuntan ahora a ese archivo; se quitaron las notas de "enlace roto" de `docs/INDEX.md` y `docs/reference/README.md`.

Además, `ASIGNACION DE VIAJES.xlsx` y `Rutas cofersa - costa rica.csv` aparecían borrados en el working tree (no fueron parte de esta reorganización) — restaurados con `git checkout HEAD -- <archivo>`.

## Follow-ups
- **Dos frameworks de proceso conviven** (AI-DLC en `.kiro/`+`aidlc/` con hooks de `bun`, y crew en `crew.json`+`standards/`+`docs/`). El ruido `"bun" no se reconoce` viene de los hooks de AI-DLC (bun no está en PATH). Decidir en otra sesión si se consolidan o cuál es el canónico.
- `npm run type-check` reporta errores **preexistentes** en `rutas/`, `seed/`, `transportistas/`, `vehiculos/` (archivos no tocados en este cambio) — ajenos a esta reorganización.
