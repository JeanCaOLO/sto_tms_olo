# Intent Statement — Devoluciones/Pickups en la secuencia de paradas

## Problem Statement

Hoy las devoluciones/recolecciones ("pickups") no forman parte del módulo de Planificación de Rutas: se coordinan por fuera como visitas adicionales, el reacomodo de carga y el impacto en capacidad se manejan manualmente, y no existe forma de responder a una recolección que surge en vivo sin rehacer la ruta a mano. [desc] [Q1]

Esta iniciativa incorpora FR16 al módulo: incluir las recolecciones ya conocidas en la secuencia de paradas junto con las entregas, distinguirlas visualmente, sumarlas al cálculo de capacidad del vehículo, y soportar el caso "al pie de camión" (recolección no planificada que obliga a recalcular secuencia y capacidad). [desc]

Es una iniciativa nueva sobre un módulo ya construido y en construcción activa; no implica reconstruir Planificación, solo agregar esta funcionalidad. [desc]

## Target Customer

| Actor | Beneficio | Source |
|-------|-----------|--------|
| Planificador de Rutas (interno) | Deja de cruzar a mano entregas y recolecciones; la secuencia y la capacidad ya las contemplan | [Q2] [desc] |
| Conductor (interno) | En el caso "al pie de camión" recibe apoyo del sistema para insertar la parada y reordenar, en vez de improvisar | [Q2] [desc] |
| Equipo del módulo de Devoluciones / Logística Inversa (interno, parte interesada) | Sus recolecciones planificadas entran en la ruta sin un flujo separado | [Q2] |

## Success Metrics

El negocio aún no ha fijado métricas formales para FR16; no aparecen en `requirements.md` ni en las reuniones de levantamiento. [Q3]

Candidatos a validar con Ana/negocio (registrados como supuestos, no como compromisos): ver `## Assumptions & Open Questions`. [Q3]

## Initiative Trigger

El disparador es el levantamiento del módulo de Devoluciones / Logística Inversa (Reunión 2026-08-24 con Ricardo, documentada en Notion), cuya sección "Relevancia para Planificación de Rutas" conecta explícitamente el escenario de recolección planificada con este módulo. [Q4] [desc]

La revisión con Ana del 2026-08-31 formalizó FR16 en `requirements.md`, dejándolo listo para diseño. [desc]

## Initial Scope Signal

- **Alcance seleccionado por el flujo (workflow-selected):** `feature` — ciclo completo (requisitos → diseño → mockups → construcción → operación) a profundidad estándar. [scope]
- **Límite de producto confirmado por el usuario:** solo FR16 (FR16.1–FR16.4) sobre el módulo de Planificación ya construido, sin reconstruirlo, incluyendo la fase de mockups/diseño. [Q8]
- **Fuera de alcance** (del módulo, más allá de FR16): la creación de la solicitud de devolución, la recepción física en el CD, la cita/orden de recepción en andén, y las reglas de negocio de cuándo se acepta un pickup al pie de camión (ventana, % de costo). Eso vive en el futuro módulo de Devoluciones. [desc]

## Assumptions & Open Questions

- [assumption] Métrica candidata: % de recolecciones conocidas incluidas automáticamente en la secuencia (meta cercana al 100%). [Q3]
- [assumption] Métrica candidata: reducción del tiempo del planificador para armar una ruta con entregas + recolecciones. [Q3]
- [assumption] Métrica candidata: reducción de recolecciones no atendidas o re-agendadas por falta de capacidad o de planificación. [Q3]
- [assumption] Métrica candidata: tiempo para insertar y recalcular una recolección "al pie de camión" (objetivo en segundos, sin rehacer la ruta). [Q3]
- [assumption] La comunicación de la iniciativa serían revisiones puntuales con Ana por hito (sin cadencia fija) más un sync pendiente con el equipo de Devoluciones. El usuario no confirmó una cadencia formal. [Q7]
- Open question: OQ-4 de `requirements.md` — alcance exacto de la integración con Devoluciones (qué campos/estado necesita una recolección para insertarse en una ruta ya generada; recálculo automático vs. asistido). Requiere una sesión de levantamiento formal aún no agendada. [desc]
- Open question: definición formal de la regla de "cabe" para el caso FR16.4 (recolección al pie de camión). [desc]

## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-08-31T19:54:30Z
**Iteration:** 2

### Findings

| # | Severidad | Ubicación | Hallazgo | Recomendación |
|---|-----------|-----------|----------|---------------|
| 1 | Major | intent-statement.md → Success Metrics | El negocio no ha fijado métricas de éxito; los cuatro candidatos figuran solo como `[assumption]` (Q3=E, confirmado con "A. Accept assumptions"). No hay un resultado medible comprometido para FR16. | Antes de cerrar Inception, validar con Ana/negocio al menos una métrica objetivo con umbral (p. ej. % de recolecciones incluidas automáticamente o tiempo de recálculo "al pie de camión"). Para Ideation advisory no bloquea; el gate de requisitos sí debería exigirlo. |
| 2 | Major | Assumptions & Open Questions (OQ-4, regla "cabe" FR16.4) | El diseño depende de OQ-4 de `requirements.md` (contrato de datos de la recolección, recálculo automático vs. asistido) y de la regla formal de capacidad para FR16.4, ambos pendientes del sync con el equipo de Devoluciones aún no agendado. | Agendar el sync con Devoluciones y asignar responsable antes de entrar a domain-design/contract-design. Está correctamente registrado como open question; se traslada como riesgo al planificar Inception. |
| 3 | Minor | stakeholder-map.md → "Cadencia de reporte formal: Unknown" | Campo marcado `Unknown (open question) [assumption]` conforme al contrato de stage; sin acción salvo confirmarlo con Ana en el primer hito. | Confirmar o descartar cadencia formal en la próxima revisión con Ana. |
| 4 | Minor | intent-statement.md → Target Customer (fila "Equipo de Devoluciones") | La fila cita solo `[Q2]`; el rol de "parte interesada" también se apoya en `[desc]` y en Q5. Trazabilidad suficiente pero podría reforzarse. | Añadir `[Q5]` a la fila para alinear con stakeholder-map.md. |
| 5 | Minor | stakeholder-map.md → Open question (responsable de Devoluciones) | Falta punto de contacto formalizado para cerrar OQ-4; ya registrado. | Nombrar responsable al agendar el sync. |

### Summary

Re-verificación advisory tras un re-guardado de bookkeeping: el contenido no cambió de forma sustantiva desde la iteración 1. Todo reclamo sustantivo traza a una fuente permitida (`[desc]`, `[Q<n>]`, `[scope]`), ambos artefactos tienen `## Assumptions & Open Questions`, y los supuestos retenidos coinciden con una confirmación humana completada ("A. Accept assumptions"). Los dos hallazgos Major (métrica de éxito sin comprometer, diseño dependiente de OQ-4 y la regla "cabe") persisten pero son inherentes a un intent-capture temprano y están correctamente registrados como supuestos/open questions; no bloquean el gate de Ideation. Se recomienda al humano exigir el cierre de ambos antes de avanzar a diseño técnico. Verdicto: READY.

