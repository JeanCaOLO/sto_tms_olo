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

## Deployment

<!-- Project-specific specialisation. -->

## Code Style

<!-- Project-specific specialisation. -->

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->

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
- Los hooks de AI-DLC están instalados pero NO conectados en .claude/settings.json (decisión de equipo, ver docs/work/2026-08/2026-08-24-install-aidlc-workflows.md). Consecuencia: HUMAN_TURN no se registra y los checkpoints/gates quedan irresolubles. Correr los comandos aidlc con AIDLC_SKIP_HUMAN_PRESENCE_GUARD=1 (ya en settings.local.json env), y compilar runtime-graph.json a mano con `bun .claude/tools/aidlc-runtime.ts compile` cuando un comando lo reclame. (learned 2026-08-31) <!-- cid:260831-devoluciones-pickups:intent-capture:f48547392b69b5ac03c094513d7a5a5b9fe9c2f889afb8e0cbd972993178f4c7 -->
- En domain-design sobre código existente (brownfield), verificar la dirección real de los imports/llamadas en el código antes de declarar `depends_on`/`dependents` — no asumirla por el nombre del componente. Ej. FR16: `capacity-fit.ts` orquesta `optimize-stops.ts`, no al revés. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:domain-design:c516f4c13967d19234429c9ff8e31d05493d3e04473901ff066c6b9e1594f5fc -->
- En units-generation, cuando la etapa User Stories está saltada, el sensor `traceability` reporta `invalid_targets`/`gaps` porque su chequeo de story-map solo casa IDs `US`, no `FR`. Es un falso positivo y el sensor es advisory (no bloquea). Poblar el story-map y `traceability.json` con IDs `FR` y continuar. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:units-generation:bc57cc91c53c698c4b79da352ab696edc28d7043cd70f642b0413fbce7d69a4d -->
- En functional-design de una unidad `kind: ui`: aunque `produces_kinds` no lista `rules` para ui, crear igualmente `rules.md` con el bloque `yaml` de reglas `BRx.y` — el sensor `traceability` busca los BR IDs en `rules.md` y falla (`invalid_targets: target BRx.y is absent from rules.md`) si el archivo no existe. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:functional-design:a02023d7d6ef6f5ebe2eadbfde596d10f21ef8eed8fe0018449e0a3992c1700f -->
- Si `aidlc-orchestrate.ts next` falla con "The directive could not be published", correr `bun .claude/tools/aidlc-utility.ts doctor` — puede haber un active-directive lock trabado (dead-owner). Si doctor lo reporta "not cleared — the lock owner changed during diagnosis" repetidamente (carrera en el auto-reparador), borrarlo a mano: `rm -rf <record>/.aidlc-active-directive.lock/` (confirmar antes que el pid del owner.json esté muerto), luego reintentar `next`. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:code-generation:a996fbc6f52ec3ffbb2998b05a6c6980d4b400cf84ebb26fa302a9da670909db -->
- En code-generation, antes de dispatchear la revisión, escribir `<record>/construction/<unit>/code-generation/source-manifest.json` (`{stage, unit, version:1, writes:[{path},...]}` con cada archivo de código de aplicación tocado) — el reviewer lo exige y el developer-agent no lo genera solo. (learned 2026-09-01) <!-- cid:260831-devoluciones-pickups:code-generation:39dc1a14c36d1dfd5ee6b6391ca65bac96b30c70718b2d7c8bd61acbc05a020e -->
