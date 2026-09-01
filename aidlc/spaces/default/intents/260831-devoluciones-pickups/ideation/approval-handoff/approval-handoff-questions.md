# Approval & Handoff — Preguntas

Cierre de Ideación. Contexto de todos los artefactos de
`../intent-capture/`, `../feasibility/`, `../scope-definition/`,
`../rough-mockups/`.

## Q1. ¿Los stakeholders están de acuerdo con el intent y el alcance?

- A. Jesús (responsable de Planificación) de acuerdo. Ana (líder de proyecto) formalizó FR16 en `requirements.md` y comparte la decisión de alcance; su visto bueno explícito sobre el recorte a FR16.1–16.3 se confirma en la próxima revisión por hito. El equipo de Devoluciones aún sin responsable — su acuerdo llega al cerrar OQ-4.
- B. Acuerdo total y formal de todos.
- C. No hay acuerdo.
- X. Other (please specify)

[Answer]: A. Acuerdo de Jesús; Ana alineada (formalizó FR16), pendiente su visto bueno explícito del recorte; equipo de Devoluciones sin responsable, su acuerdo depende de OQ-4.

## Q2. ¿Se reconocieron los riesgos críticos con mitigaciones?

- A. Sí — están en `../feasibility/raid-log.md`: diseño arranca sin OQ-4 (mitigación: agendar sync, avanzar FR16.2/16.3 primero), FR16.4 más grande de lo esperado (mitigación: fuera de este ciclo), sin métrica de éxito (mitigación: cerrarla en requirements-analysis), PII de choferes (mitigación: demos internas).
- B. Faltan riesgos por documentar.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Sí, los 4 riesgos del RAID log tienen mitigación asignada.

## Q3. ¿Hay compromiso de presupuesto/recursos?

- A. Sí — lo implementa el equipo de frontend actual, sin capacidades ni infraestructura nuevas (`../feasibility/feasibility-assessment.md`). Sin presupuesto adicional.
- B. Pendiente de asignar recursos.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. El equipo actual lo absorbe; sin costo adicional.

## Q4. ¿Los rough mockups reflejan la visión compartida?

- A. Sí a nivel concepto — sin pantallas nuevas, devolución distinguible por color+ícono+etiqueta, misma barra de capacidad. La revisora marcó 3 Major (outline de IA, estados vacíos, regla índigo+amber) que refined-mockups recoge; el usuario aprobó el concepto.
- B. No reflejan la visión.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Concepto aprobado; los 3 Major de la revisión pasan a refined-mockups.

## Q5. ¿La recomendación es go / no-go?

- A. **Go**, con condiciones: avanzar FR16.1–16.3 ahora; agendar el sync con Devoluciones para cerrar OQ-4 antes de domain-design; cerrar una métrica de éxito en requirements-analysis.
- B. No-go.
- C. Go sin condiciones.
- X. Other (please specify)

[Answer]: A. Go condicionado — avanzar FR16.1–16.3; cerrar OQ-4 y la métrica antes/durante Concepción.

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en initiative-brief.md, decision-log.md y la verificación de fase:

- **Recomendación: GO condicionado.**
- **Condiciones:** (1) agendar el sync con el equipo de Devoluciones y asignarle responsable para cerrar OQ-4 antes de domain-design; (2) cerrar al menos una métrica de éxito con umbral con Ana/negocio en requirements-analysis.
- **Alcance confirmado:** FR16.1–16.3 en este ciclo; FR16.4 fuera.
- **Riesgos:** los 4 del RAID log con mitigación.
- **Recursos:** equipo de frontend actual, sin costo ni infra nuevos.
- **Stakeholders:** Jesús de acuerdo; Ana alineada (pendiente visto bueno explícito del recorte); Devoluciones sin responsable.
- **Mockups:** concepto aprobado; 3 Major pasan a refined-mockups.
- **Verificación de fase Ideación → Concepción:** intent → scope → backlog consistentes; todos los ítems de alcance tienen respaldo de feasibility.

- Looks correct
- Request changes

[Answer]: Looks correct
