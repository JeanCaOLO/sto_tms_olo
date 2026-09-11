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
- 2026-08-28T00:00:00Z — Interpretación: scope classic saltó rough-mockups (ideación no corrida) y User Stories se saltó por decisión del usuario; el stage file autoriza diseñar los mockups refinados directamente desde requirements.md sin inventar wireframes/user-flow ausentes (consumes_absent expected:true). Fuente de pantallas: FR1–FR10 + PLAN_MODULO_OMS §5 (6 submódulos) + design system del codekb.
- 2026-08-28T00:00:00Z — Interpretación: se minimizan las preguntas de clarificación a decisiones de diseño reales con defaults, alineado con la preferencia del usuario de avanzar; el resto se deriva del design system existente (teal/slate, Card/Button/Badge 5 estados, Remix Icon) y de los NFR/estados ya fijados en requirements.md.
- 2026-08-28T00:00:00Z — Tradeoff: la revisión advisory del product-lead devolvió READY con 5 hallazgos Menores (todos huecos de completitud, ninguno bloqueante). Se aplicaron los 5 en mockups.md (tipos de alerta FR8/FR9.6 en el Panel, FR4.8, score ant/nuevo en Auditoría, suma de pesos y caso score 0 en el panel de la Cola) por mejorar la trazabilidad FR→maqueta antes del gate, sin cambiar las decisiones de diseño Q1-Q5.
- 2026-08-28T00:00:00Z — Deviación (solicitada por el usuario en el gate, Request Changes): se incorporó el calendario real de Cofersa Costa Rica (34 zonas, `Rutas cofersa - costa rica.csv`) como datos de muestra de la Pantalla 5, en vez de relleno. Mapeo: Zona #→ruta, Días de Carga→días de salida (insumo Regla 1), Días de entrega→días de entrega. La segunda columna del CSV (Rural/GAM) se refleja como "Tipo". Casos de borde reales aprovechados: zonas GAM del casco sin días definidos y zona 44 REY "Cita previa" → ilustran FR2.6 (ruta sin días). Sin cambios en Q1–Q5. Data ilustrativa; el sembrado real es de Construcción.
- 2026-08-28T00:00:00Z — Corrección de datos (corrida aislada `--single`): el usuario reportó que el CSV `Rutas cofersa - costa rica.csv` tenía un error de conversión xlsx→csv que dejó sin días a las zonas GAM del casco; ya está corregido (todas traen "Lunes a Viernes"). Se relee el CSV y se actualiza la Pantalla 5: las 12 zonas GAM del casco (2,3,4,17,5,6,7,21,22,23,25,26) más 1 Casco pasan a "Lun–Vie". Se ELIMINA el falso caso FR2.6 (esas zonas no eran ruta-sin-días, era el bug). FR2.6 queda ilustrado solo con la zona 44 REY "Cita previa" (sin calendario fijo) y con una nota de que una ruta totalmente sin días sería ejemplo hipotético. Sin cambios en Q1–Q5. Corrida aislada: no toca Current Stage (Domain Design), gate:false, el runner aislado hace el report de finalización.
