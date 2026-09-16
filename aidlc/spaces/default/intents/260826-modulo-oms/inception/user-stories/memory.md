<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-09-15T00:00:00Z — Etapa user-stories corrida tras la re-corrida de requirements (jump). Consume requirements.md v2 (14 FR). Modo mob (product lead + design/developer/quality). El alcance funcional ya está firme en project.md ## Decided y requirements.md; las historias se derivan de los 14 FR sin re-abrir decisiones. Se minimizan preguntas de clarificación a decisiones de granularidad/alcance de las historias.
- 2026-09-15T00:00:00Z — Interpretación: la primera entrega son 2 reglas (fecha + cliente retira/observaciones IA). Las historias marcarán qué es de "primera entrega" vs. futuro (Regla 4 viaje/bajada, Regla 5 inventario), alineado con FR6. Actores = 4 roles de la Adenda + "sistema/motor" como actor no-humano para las reglas automáticas.
- 2026-09-15T00:00:00Z — Generados los 4 artefactos: personas.md (P1-P6, incluye actor no-humano Sistema/Motor OMS y actor externo TMS/Planificación), stories.md (33 historias US1-US33 en 9 épicas, Given/When/Then, etiqueta de entrega, traza a FR), traceability.json (US→FR + fr_coverage de los 14 FR + OQ como dependencias), user-stories-assessment.md. Invariantes firmes explícitos en criterios del motor (US7 no escribe fechas, US9 DISP→GENERADA + solo WMS/EFLOW, US10 prioridad numérica invertida + score). Simulador: US22 una aplicada por compañía, US23 hora de corte del modo mixto. OQ-1..OQ-7 como dependencias, no historias (Q5=A).
