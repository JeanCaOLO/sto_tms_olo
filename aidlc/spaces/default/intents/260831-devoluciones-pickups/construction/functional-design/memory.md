<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->


- 2026-09-01T15:03:53Z — unidad ui: sin entities.md/rules.md requeridos, pero se crea rules.md (BR1.1-1.4) para el sensor traceability. Modelo = Pedido.tipo opcional. Geometria por leg via OSRM steps=true.
<!-- aidlc-wave-memory:u1-devoluciones-en-secuencia:b5ac0664024b4a8231a505d862b2f11792505d993ff1e301fe0d653b09151f17 -->
## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->


- 2026-09-01T15:03:53Z — se agrego rules.md aunque produces_kinds no lo pide para ui, porque el sensor traceability lo exige (busca BR IDs en rules.md).
<!-- aidlc-wave-memory:u1-devoluciones-en-secuencia:3fa227a08c7d9d81ccc08dfb52bf0c282ac9170d7928fbac3ecb366678b4ea81 -->
## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->

- 2026-09-01T15:03:53Z — steps=true en OSRM para ~20 paradas: medir en build-and-test.
<!-- aidlc-wave-memory:u1-devoluciones-en-secuencia:f0b136dc74f7113f09f90765d74bb76aef54f709702f2e929a388e3beea001ec -->
