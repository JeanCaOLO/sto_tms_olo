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
- 2026-08-28T00:00:00Z — Interpretación: el usuario pidió explícitamente "genera los requerimientos actualizados, no como preguntas abiertas". Se minimizan las preguntas de clarificación a decisiones de ALCANCE de este ciclo (qué requerimientos entran ahora vs. se aplazan), no a re-preguntar hechos ya cerrados en la Adenda ni datos que dependen de terceros (niveles de prioridad, tablas del lago). Esos últimos van a "Open questions" del artefacto, no al fichero de preguntas.
- 2026-08-28T00:00:00Z — Deviación: se parte de los 11 requerimientos del `kiro-oms-requirements.md` como base a CORREGIR. Cambio estructural mayor: se elimina el antiguo REQ 4 (Aprobación Humana) por estar superado por la Adenda; el flujo pasa a ser automático. Se re-numeran los FR resultantes con IDs FR nuevos y estables (no se conservan los "Requerimiento N" del doc de Kiro, que no eran IDs de trazabilidad AI-DLC).
- 2026-08-28T00:00:00Z — Tradeoff: la revisión advisory del product-lead devolvió READY con 5 hallazgos Menores. Aunque advisory no obliga, se aplicaron 5 refinamientos baratos (tier ilustrativo, BDD Caracas/Valencia en FR2, mapeo rol↔acceso en FR10.1, enlace FR4.4→RLS, aclaración OQ-3) por mejorar la testabilidad y claridad antes del gate, sin cambiar el alcance acordado (Q1=A).
- 2026-09-14T00:00:00Z — Re-corrida (jump backward desde domain-design por drift). Se reescribió requirements.md completo tratando el previo como base a corregir. Correcciones estructurales: (1) posicionamiento WMS/EFLOW (lee y escribe estado/situación DISP→GENERADA + prioridad; eliminado el "lago de datos" y la inserción; no toca WMH ni intermedias; termina en "alistado"); (2) prioridad numérica invertida + score ponderado desde 1ª entrega (eliminado priority_tier nombrado); (3) el OMS no escribe fechas (eliminada "fecha de alisto"); (4) fuente = expedición_cabecera fecha_de_cierre IS NULL + DISP; (5) 5 macro-reglas con 2 en 1ª entrega + IA Bedrock; (6) Motor = catálogo semi-configurable; (7) Simulador = configurador de simulaciones (entidad persistida); (8) multi-compañía Lambda-por-compañía + selector; (9) BD logistica_olo esquemas OMS/TMS. Fuentes: project.md ## Decided + 4 docs (Antonio 09-08, Calzadilla 09-14, diseño 09-14, simulador 09-15).
- 2026-09-14T00:00:00Z — Q1-Q5=A con precisiones del humano: score desde 1ª entrega (OQ solo score-vs-filtro-estricto); Regla 4 fuera de 1ª entrega con nota de propiedad (viaje = Planificación/TMS, OMS solo consume). NFR viejos (60s/5s/lago) reemplazados por reales (motor ≥1/día+cortes, IA <$1/mes, volumen ~400-500/día, capacidad ~80). Open Questions: BD no oficial, réplica EFLOW_OLO por solicitar, Cofersa sin fecha de entrega, tabla de prioridades del cliente, score-vs-filtro, umbral inyección, cortes/duración rutas, viaje cliente retira.
