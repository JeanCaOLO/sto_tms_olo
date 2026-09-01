# Initiative Brief — Devoluciones/Pickups en la secuencia de paradas (FR16)

One-pager de cierre de Ideación. Compila `../intent-capture/intent-statement.md`,
`../intent-capture/stakeholder-map.md`, `../feasibility/feasibility-assessment.md`,
`../feasibility/constraint-register.md`, `../scope-definition/scope-document.md`,
`../scope-definition/intent-backlog.md` y `../rough-mockups/wireframes.md`.

## Problema e intent

Hoy las recolecciones/devoluciones conocidas no forman parte del módulo de
Planificación de Rutas: se coordinan por fuera, el reacomodo y la capacidad se
manejan a mano, y no hay respuesta para una recolección que surge en vivo. Esta
iniciativa incorpora FR16 al módulo (ver `../intent-capture/intent-statement.md`).

## Alcance

**Dentro (este ciclo):** FR16.1 (recolecciones conocidas como paradas en la
secuencia), FR16.2 (distinción visual entregas vs. devoluciones), FR16.3
(devolución en el cálculo de capacidad). **Fuera:** FR16.4 "al pie de camión"
(ciclo posterior, depende de OQ-4) y todo el ciclo de devolución que vive en el
futuro módulo de Devoluciones (`../scope-definition/scope-document.md`).

## Viabilidad y riesgos

De `../feasibility/feasibility-assessment.md`: viabilidad **ALTA** para
FR16.1–16.3 (extienden la secuencia de paradas y el bin-packing existentes),
**MEDIA** para FR16.4. Riesgos clave (`../feasibility/constraint-register.md` +
RAID log): (1) diseño depende de OQ-4 con el equipo de Devoluciones — sin
responsable asignado; (2) sin métrica de éxito comprometida; (3) DB compartida y
mockeada.

## Visual (concepto)

Sin pantallas nuevas. Las paradas de devolución se distinguen por color de
acento propio (índigo tentativo) + ícono + etiqueta, en lista, mapa y card; la
barra de capacidad cuenta la devolución igual que un pedido de entrega
(`../rough-mockups/wireframes.md`). 3 hallazgos Major de la revisión pasan a
refined-mockups.

## Equipo

El equipo de frontend actual implementa FR16 sin capacidades ni infraestructura
nuevas. Decisión de alcance/prioridad conjunta Ana + Jesús
(`../intent-capture/stakeholder-map.md`).

## Recomendación: GO condicionado

Avanzar FR16.1–16.3 a Concepción. Condiciones antes de `domain-design`:
1. Agendar el sync con el equipo de Devoluciones y asignarle responsable para
   cerrar OQ-4 (contrato de datos de la recolección).
2. Cerrar al menos una métrica de éxito con umbral con Ana/negocio en
   `requirements-analysis`.

## Assumptions & Open Questions

- [assumption] Ana dará visto bueno explícito del recorte a FR16.1–16.3 en la
  próxima revisión por hito.
- Open question: OQ-4 y la regla de "cabe" de FR16.4 (fuera de este ciclo pero
  bloquean el ciclo siguiente).
