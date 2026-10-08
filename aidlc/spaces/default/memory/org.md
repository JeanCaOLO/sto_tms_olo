# Org-Level Rules

> Framework defaults. Read with `team.md` + `project.md` from active space.
> Resolver loads all layers. Narrower layers add, no contradict broader.

## Way of Working

Trunk-based dev. All work merge `main` via short feature branches (1-2 days).
Long branches = merge debt. Avoid.

Construction worktrees: base `main`, merge `main`.

Multi-env (staging, prod): one trunk, gate via tags or env configs. Not
long-lived release branches.

Squash-merge Bolt branches → `main`. One commit per Bolt. Name = Bolt slug.
Full history stays on source branch till worktree discarded.

Squash = clean linear `main`, maps 1:1 to delivery-planning Bolt sequence.
Trade-off: lose intermediate commits on `main`. Accept because audit log
keeps full event sequence anyway.

## Walking Skeleton

Scope-dependent. Run walking-skeleton Bolt FIRST only if scope file has
`skeleton: on`. Bolt 1 solo, gated, user approves before rest.

Skip skeleton ceremony if `skeleton: off`. First Bolt runs like any other.
Nothing to bootstrap.

After Bolt 1 ships (when runs), orchestrator fires ladder prompt:
"How should remaining Bolts run?" Options: autonomous, gate every Bolt.
Team picks per project. Persists as `Construction Autonomy Mode` in
`aidlc-state.md`.

## Testing Posture

Tests = first-class deliverable in every Bolt. Specific methodology
(TDD, BDD, ATDD, classic test-after) affirmed at practices-discovery,
recorded in `team.md` with explicit `Methodology` + `Ordering` fields.
Code Generation resolves those independently from coverage, tooling,
scope notes.

No posture affirmed → default per scope:
- **Methodology**: test-after
- **Ordering**: implement each testable layer, then write + run that layer's tests.
- `mvp`, `enterprise`, `feature`, `infra`, `classic`: add 80% line-coverage
  floor + CI execution before merge.
- `bugfix`, `security-patch`: add targeted regression for the specific
  bug/vuln. Existing suite stays green.
- `express`: Minimal strategy. Requirement-driven unit tests (one per
  requirement, happy-path floor per component). Existing tests stay green.
- `poc`, `refactor`, `workshop`: no extra new-test floor. Existing suite
  stays green.

Active `Test Strategy` applies in every scope. Determines volume + types.
Scope floors additive. Never reduce or replace selected strategy.

Build and Test verify coverage floors + quality targets. Never weaken to
make step pass.

Affirm stricter posture in `team.md` if team commits.

## Deployment

Deploy on merge to staging. Prod deploys gate on separate manual approval —
usually tech lead + product owner sign-off in CodePipeline or CD platform
environment protection.

Teams with test coverage + observability sometimes graduate to continuous
deploy to prod (every commit auto-deploys). Team decision, not framework
default.

## Code Style

Defer to project configs:
- Formatter: Prettier (JS/TS), Black (Python), `gofmt` (Go), or language-default.
  Configured in repo root (`.prettierrc`, `pyproject.toml`, etc.).
- Linter: ESLint, Ruff, golangci-lint, etc. Run in CI before merge. Failure
  blocks PR.
- Naming: language idiomatic (camelCase JS/TS, snake_case Python, etc.).
  No project-wide rename unless team affirms one.

Framework makes code-style suggestion → agents read project linter config
first. Suggestion fires only if linter doesn't cover it.

## Forbidden

<!-- Things agents must never do -->
<!-- Example: Do not ask questions about topics already decided in previous stages -->

## Mandated

- **Idioma de conversación**: Todo artefacto + mensaje human-facing usa idioma
  establecido en sesión. Orquestador resuelve desde: (1) brief (autoritativo,
  regenerado cada dispatch), (2) `project.md` → `## Corrections` (última regla),
  (3) `aidlc-state.md` → `## Project Information` → `**Project**` (si tiene
  señal real, no placeholder), (4) artefactos previos del workflow. Ninguno
  responde → PREGUNTA, nunca asumas inglés.

  **Estabilidad**: idioma dura toda sesión. Solo pedido explícito del humano
  lo cambia, aplica inmediatamente. Persistencia requiere ritual §13 learnings
  (human-gated). NUNCA editar memory a mano para registrarlo. Humano declina →
  cambio vive solo en sesión, se re-resuelve en próxima. Nuevo session, primer
  turno → orquestador re-resuelve antes de dispatch. Re-resolver no es switch:
  no se anuncia, no se persiste.

  **Qué localizar**: Todo lo que humano lee o revisa — requirements, user
  stories, plans, specs, reviews, questions, practices, team/project rules,
  evidence, rationale — y output human-facing del agente (chat, status,
  narration). Structured-question `prompt`, `header`, `options[].description`,
  free-text follow-ups = prose human-facing, misma regla. Solo `options[].label`
  literales verbatim = tokens preservados. Regla `ALWAYS …`/`NEVER …`: marker
  = token fijo, oración = localizable. Markdown NO es inglés solo porque
  herramienta parsea parte. Localiza prose alrededor de tokens preservados.
  Input humano verbatim siempre kept as escrito.

  **Tokens preservados** (verbatim, char-per-char, NUNCA traducir):
  - Backtick literals que stage file marca fijos: `[Answer]:`, `X. Other
    (please specify)`, `A. Accept assumptions`, `B. Convert to follow-up
    questions`, `None.`/`None`, `AGREE:`/`OBJECT:`, `**Collaborator:**`.
  - Source-register tags: `[desc]`, `[scope]`, `[assumption]`, `[Q<n>]`,
    `[memory:M<n>]` con prefijos literales.
  - H2 headings verbatim de templates: `## Sources`, `## Assumptions & Open
    Questions`, `## Assumption Confirmation`, `## Review`.
  - Reviewer verdicts: `READY`, `NOT-READY`.
  - YAML keys + enums: `units`, `name`, `kind`, `depends_on`,
    `service | spec | ui | packaging | library`.
  - Field labels, status, checkbox de `aidlc-state.md` + audit shards.
  - Stable IDs (`FR-1`, `ENT-001`, `BR1.1`), enums, classifications.
  - Code, identifiers, file paths, mermaid keywords, cross-refs.

  Gloss al presentar = OK. Escribir en artefacto = literal mismo.

## Corrections

<!-- Self-learning loop appends here. -->
<!-- Use team.md for team-wide. project.md for project-specific. -->
<!-- Loader resolves org → team → project at session start. Retains all applicable. -->