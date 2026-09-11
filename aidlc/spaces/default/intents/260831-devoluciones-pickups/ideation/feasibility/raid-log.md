# RAID Log — Devoluciones/Pickups (FR16)

Risks, Assumptions, Issues, Dependencies. Inicializado en feasibility a partir
de `../intent-capture/intent-statement.md` y `feasibility-assessment.md`.

## Risks

| ID | Riesgo | Prob. | Impacto | Tratamiento |
|----|--------|-------|---------|-------------|
| R-1 | El diseño de FR16.1 y FR16.4 arranca sin cerrar OQ-4 y se rehace. | Media | Alto | Mitigar: agendar el sync con Devoluciones antes de `domain-design`; mientras tanto avanzar solo FR16.2–16.3. |
| R-2 | FR16.4 (recálculo en vivo) resulta más grande de lo esperado al no existir un flujo en tiempo real hoy. | Media | Medio | Mitigar: desdoblar FR16.4 como incremento separado; validar el enfoque en `functional-design`. |
| R-3 | Sin métrica de éxito, no se puede evaluar objetivamente si FR16 cumplió. | Alta | Medio | Mitigar: `requirements-analysis` debe cerrar al menos una métrica con umbral con Ana/negocio. |
| R-4 | Datos personales de choferes se filtran fuera del entorno interno (snapshot QA, demos). | Baja | Medio | Mitigar: mantener demos internas; no publicar el dataset. |

## Assumptions

| ID | Supuesto | A validar en |
|----|----------|--------------|
| A-1 | La recolección conocida llega por el canal WMS/Iflow que ya sincroniza viajes, hasta que exista el módulo de Devoluciones. | requirements-analysis |
| A-2 | Una devolución se modela como "una parada más con tipo = devolución, peso y volumen". | requirements-analysis / domain-design |
| A-3 | El equipo de frontend actual implementa FR16 sin capacidades nuevas. | — (confirmado en feasibility) |

## Issues

| ID | Issue | Estado |
|----|-------|--------|
| I-1 | El módulo de Devoluciones no tiene responsable asignado; no hay con quién cerrar OQ-4. | Abierto — escalado a Ana. |
| I-2 | `trips`/`trip_orders` reales no existen en Supabase; el módulo trabaja con mocks. | Abierto — fuera del alcance de FR16, condiciona la implementación. |

## Dependencies

| ID | Dependencia | De quién |
|----|-------------|----------|
| D-1 | Definición de OQ-4 (contrato de datos de la recolección). | Equipo de Devoluciones / Ricardo. |
| D-2 | Regla formal de "cabe" para FR16.4 (ventana, capacidad, % de costo). | Equipo de Devoluciones + negocio (Cofersa). |
| D-3 | Métrica de éxito con umbral. | Ana / negocio. |

## Assumptions & Open Questions

- Open question: fecha del sync con el equipo de Devoluciones y nombre de su
  responsable.
- Open question: ver también las de `feasibility-assessment.md` y
  `constraint-register.md`.
