# Stakeholder Map — Devoluciones/Pickups en la secuencia de paradas

## Stakeholders e intereses

| Stakeholder | Interés principal | Source |
|-------------|-------------------|--------|
| Ana (líder de proyecto) | Que FR16 quede bien definido y trazable, con el alcance acotado al módulo de Planificación | [Q5] |
| Equipo del módulo de Devoluciones / Logística Inversa (Ricardo, sin responsable asignado aún) | Un contrato claro de qué datos y estado necesita una recolección para insertarse como parada en una ruta ya generada | [Q5] [desc] |
| Operaciones / despacho | Que la ruta con recolecciones sea físicamente ejecutable y que el cálculo de capacidad sea realista | [Q5] |
| Planificador de Rutas | Usuario directo de la funcionalidad (ver `intent-statement.md` → Target Customer) | [Q2] |
| Conductor | Actor del caso "al pie de camión" (FR16.4) | [Q2] [desc] |

## Decision-makers vs. influencers

| Rol | Tipo | Source |
|-----|------|--------|
| Ana + Jesús (decisión conjunta sobre alcance y prioridad de FR16) | Decision-maker | [Q6] |
| Equipo del módulo de Devoluciones | Influencer | [Q6] |
| Operaciones | Influencer | [Q6] |

## Requisitos de comunicación

| Requisito | Detalle | Source |
|-----------|---------|--------|
| Revisiones con Ana por hito | Sin cadencia fija; puntuales en cada avance, como la revisión del 2026-08-31 | [Q7] |
| Sync con el equipo de Devoluciones | Pendiente, para cerrar OQ-4 antes del diseño técnico | [Q7] [desc] |
| Cadencia de reporte formal | Unknown (open question) [assumption] | [Q7] |

## Assumptions & Open Questions

- [assumption] Los requisitos de comunicación se derivan de la recomendación aceptada por el usuario, que no confirmó una cadencia formal ni un canal específico. [Q7]
- Open question: quién será el responsable asignado del módulo de Devoluciones y cómo se formaliza el punto de contacto para cerrar OQ-4. [desc]
