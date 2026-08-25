# Initiative Brief — Planificación de Rutas: Levantamiento Formal

## Intent y Problema

El módulo de Planificación de Rutas del TMS OLO fue construido iterativamente (2026-08-11 a 2026-08-24) sin un levantamiento formal de requerimientos. Funciona en producción (modo mock) pero carece de documentación que permita gobernanza, onboarding y coordinación inter-módulo. Este levantamiento retroactivo produce una matriz de requerimientos y un documento de roles sin modificar código.

## Alcance

- **In scope**: Análisis del código en `src/pages/planificacion/` y `src/lib/routePlanning/`; decisiones documentadas en `docs/decisions/0001-*.md`; bitácoras en `docs/work/2026-08/*.md`; información de equipo en `HANDOFF.md`.
- **Out of scope**: Cualquier cambio al código, nuevas funcionalidades, despliegues, o refactors.
- **Entregables**: (1) Matriz de requerimientos funcionales y no funcionales con criterios de aceptación; (2) Documento de roles y responsabilidades.

## Riesgo

Riesgo mínimo — es un ejercicio de documentación pura. No se altera ningún sistema en ejecución.

## Equipo

- **Owner técnico**: Jesús Araujo (autor del módulo)
- **Líder del proyecto**: Jean Carlo (Intelix)
- **Módulos relacionados**: Eduardo (OMS — proveedor de viajes/pedidos), Dylan (Liquidación/Tarifas), Andrey (SRO)

## Recomendación

**Go** — proceder inmediatamente al reverse-engineering del código seguido del análisis de requerimientos. La inversión es baja (tiempo del owner + AI), el riesgo es nulo, y el valor es alto para la gobernanza del módulo.

## Assumptions & Open Questions

None.

