# Project-Level Rules

> Project-specific specialisation and corrections. Loaded after `org.md` and
> `team.md` as strict-additive guidance; contradictions with broader policy
> are rejected. Populated by practices-discovery and the self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project needs stable, durable guidance beyond the
> team practice (for example, package-specific release checks or an additional
> regression suite for a legacy component).

## Way of Working

<!-- Project-specific specialisation. Example: -->
<!-- This monorepo requires package-scoped branch names and a package owner -->
<!-- review in addition to the team's normal merge policy. -->

## Walking Skeleton

<!-- Project-specific specialisation. Example: -->
<!-- The walking skeleton must exercise the legacy service adapter as well -->
<!-- as the new service boundary. -->

## Testing Posture

<!-- Project-specific specialisation. -->
- La lógica de negocio (en especial el cálculo de prioridad del OMS) debe extraerse a módulos `.ts` puros, fuera de los componentes `.tsx` de página, para que sea probable sin montar React (learned 2026-08-28)

## Deployment

<!-- Project-specific specialisation. -->

## Code Style

<!-- Project-specific specialisation. -->
- ALWAYS endurecer el tipado en el subárbol del OMS antes de tocar el cálculo de prioridad: activar `strictNullChecks` localmente para ese código, aunque el `tsconfig.app.json` global tenga `strict: false` (learned 2026-08-28)

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->
- DECIDED: El cálculo de prioridad del OMS es 100 % automático (motor de reglas). La única intervención humana permitida es que el rol Responsable del OMS altere la prioridad de un pedido puntual. NO existe ningún paso de aprobación humana (ni de Jefe de Almacén ni de ningún otro rol) antes del alistamiento, porque detendría el flujo automático. Fuente vigente: Adenda del 2026-08-26 (`knowledge/documents/2026-08-26-reunion-oms-roles.md`). (Stage reverse-engineering, 2026-08-28)

## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: NEVER [behavior] (affirmed [date]) -->
<!-- Example: NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->

## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->

## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
- NEVER tratar como vigente el paso de aprobación humana de la propuesta de priorización del OMS: `CONTEXTO_PROYECTO_TMS.md` §2.4 y `PLAN_MODULO_OMS.md` §7.0 están DESACTUALIZADOS en ese punto y quedan superados por la Adenda del 2026-08-26 (cálculo 100 % automático, sin aprobación). No reintroducir ese requisito ni preguntarlo de nuevo (learned 2026-08-28)
- ALWAYS al reescribir requerimientos a partir de una matriz previa (p. ej. la generada con Kiro), tratarla como base a CORREGIR, no a repetir: verificar cada aparición del concepto eliminado o corregido en TODOS los FR/NFR/roles/glosario/triggers, no solo en el requerimiento más obvio (learned 2026-08-28)
- ALWAYS al maquetar un módulo nuevo sobre un sistema existente, mapear cada componente al design system real del repo (`src/components/base/*`, `src/components/feature/*`) antes de inventar; lo que falte se construye como wrapper en `shared/`, nunca como kit de UI nuevo (learned 2026-08-28)
