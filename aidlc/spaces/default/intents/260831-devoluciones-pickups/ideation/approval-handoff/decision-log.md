# Decision Log — Ideación (FR16 Devoluciones/Pickups)

Decisiones tomadas durante la fase de Ideación. Fuentes entre paréntesis.

| # | Decisión | Etapa | Base |
|---|----------|-------|------|
| D-1 | El problema y el intent son incorporar FR16 al módulo de Planificación ya construido, sin reconstruirlo. | intent-capture | `../intent-capture/intent-statement.md` |
| D-2 | Métricas de éxito quedan como supuestos (no comprometidas); se cierran en requirements-analysis. | intent-capture | `../intent-capture/intent-statement.md`, revisión advisory |
| D-3 | Market Research se salta — herramienta interna sin posicionamiento de mercado. | market-research | condición de la etapa |
| D-4 | Viabilidad ALTA para FR16.1–16.3, MEDIA para FR16.4; recomendación de desdoblar. | feasibility | `../feasibility/feasibility-assessment.md` |
| D-5 | El plan de 33 etapas se recorta a 16 (in-flight compose): sin fase de Operación, sin NFR/contract/delivery-planning, sin reverse-engineering/practices-discovery/user-stories. | (compose in-flight) | propuesta del composer, aprobada por el usuario |
| D-6 | Alcance de este ciclo = FR16.1–16.3. FR16.4 fuera (depende de OQ-4). | scope-definition | `../scope-definition/scope-document.md` |
| D-7 | Secuenciación dependency-first: FR16.2 → FR16.3 → FR16.1. | scope-definition | `../scope-definition/intent-backlog.md` |
| D-8 | Sin pantallas nuevas; devolución distinguible por color+ícono+etiqueta (acento índigo tentativo); misma barra de capacidad. | rough-mockups | `../rough-mockups/wireframes.md` |
| D-9 | Los 3 Major de la revisión de rough-mockups (outline IA, estados vacíos, regla índigo+amber) se difieren a refined-mockups. | rough-mockups | revisión advisory, aprobación del usuario |
| D-10 | Recomendación de cierre de Ideación: GO condicionado (cerrar OQ-4 y una métrica antes de domain-design). | approval-handoff | este brief |

## Assumptions & Open Questions

- Open question: confirmación explícita de Ana sobre D-6 y D-5 en la próxima
  revisión por hito.
