# Feasibility & Constraints — Preguntas

Contexto tomado de `../intent-capture/intent-statement.md` y del código existente
del módulo de Planificación (`src/pages/planificacion/`).

## Q1. ¿Con qué sistemas debe integrarse FR16 para obtener las recolecciones conocidas?

- A. El WMS / Iflow (torre de control), igual que hoy llegan los viajes y pedidos — la recolección vendría como una parada más en el viaje.
- B. Un módulo de Devoluciones dedicado — pero ese módulo aún no existe (en levantamiento).
- C. Ambos: a corto plazo desde el WMS/viaje; a futuro desde el módulo de Devoluciones cuando exista.
- D. Not yet defined — depende de cerrar OQ-4.
- X. Other (please specify)

[Answer]: C. Ambos: a corto plazo la recolección conocida llega como una parada más dentro del viaje que ya sincroniza el WMS/Iflow (mismo canal que hoy alimenta `viajes-api.ts`); a futuro, cuando exista el módulo de Devoluciones, ese sería el origen formal. La forma exacta del dato la cierra OQ-4. (Derivado de `intent-statement.md` y del código: `src/pages/planificacion/viajes-api.ts`, `fallback-viajes.ts`.)

## Q2. ¿Hay requisitos regulatorios o de compliance que apliquen? (datos de choferes: nombre, cédula, teléfono)

- A. No — es una herramienta interna; los datos de choferes ya se manejan hoy en el TMS/WMS sin requisitos regulatorios formales.
- B. Sí — hay una política interna de datos personales que habría que revisar.
- C. Not identified — nadie lo ha evaluado.
- X. Other (please specify)

[Answer]: A. No — es una herramienta interna; nombre, cédula y teléfono de choferes ya se manejan hoy en el TMS/WMS (y en la DB de eflow, ver `docs/guides/eflow-qa-data.md`) sin requisitos regulatorios formales. No hay PCI/HIPAA/GDPR aplicable; solo aplica el cuidado interno de no exponer esos datos fuera del entorno interno.
## Q3. ¿El stack y el equipo pueden implementar esto sin capacidades nuevas?

- A. Sí — es una extensión del módulo de Planificación que este mismo equipo construyó (Vite + React + Supabase + TypeScript); toca la secuencia de paradas y el cálculo de capacidad que ya existen.
- B. Parcialmente — el caso "al pie de camión" (recálculo en vivo) puede requerir algo que hoy no está resuelto.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Sí — es una extensión del módulo de Planificación que este mismo equipo construyó. FR16.1–16.3 tocan la secuencia de paradas y el bin-packing de capacidad que ya existen (`optimize-stops.ts`, `capacity-fit.ts`/`distance-matrix.ts`). B para FR16.4: el recálculo en vivo "al pie de camión" no está resuelto hoy (la optimización es previa al despacho, no en tiempo real) — es el trozo con más incertidumbre.
## Q4. ¿Hay restricciones de presupuesto o fecha límite?

- A. No hay fecha límite formal; el ritmo lo marca el cierre de OQ-4 con el equipo de Devoluciones.
- B. Sí, hay una fecha objetivo (especificar en Other).
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. No hay fecha límite formal; el ritmo lo marca el cierre de OQ-4 con el equipo de Devoluciones. FR16.1–16.3 pueden avanzar en paralelo sin esperar ese cierre; FR16.4 sí lo necesita.
## Q5. ¿Qué bloqueadores organizacionales existen hoy?

(select all that apply)

- A. El sync con el equipo de Devoluciones está pendiente y ese módulo no tiene responsable asignado — bloquea OQ-4 y la regla "cabe" de FR16.4.
- B. No hay métrica de éxito comprometida con negocio (viene de la revisión de intent-capture).
- C. La base de datos de Planificación es compartida con el equipo y hoy está mockeada (ver `MOCKING.md`).
- D. Ninguno relevante más allá de los ya listados.
- X. Other (please specify)

[Answer]: A, B, C. (A) Sync con Devoluciones pendiente y sin responsable — bloquea OQ-4 y la regla "cabe" de FR16.4. (B) Sin métrica de éxito comprometida con negocio. (C) La DB de Planificación es compartida y hoy mockeada (`MOCKING.md`); el prototipo ya tiene un snapshot de datos reales de eflow QA en los fallbacks.
## Q6. ¿Este módulo usa infraestructura AWS que haya que considerar?

- A. No — el módulo corre sobre Supabase; el despliegue es el de la app existente (no hay infra AWS propia de Planificación).
- B. Sí (especificar en Other).
- C. Not applicable.
- X. Other (please specify)

[Answer]: A. No — el módulo corre sobre Supabase; el despliegue es el de la app existente. No hay infraestructura AWS propia de Planificación que evaluar en esta iniciativa.

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en los artefactos de feasibility:

- **Viabilidad técnica: ALTA para FR16.1–16.3, MEDIA para FR16.4.** FR16.1–16.3 son extensión directa de la secuencia de paradas y el bin-packing de capacidad que ya existen; FR16.4 (recálculo en vivo "al pie de camión") es lo único no resuelto hoy — la optimización actual es previa al despacho, no en tiempo real.
- **Integración:** la recolección conocida entra como una parada más en el viaje que ya sincroniza el WMS/Iflow; el módulo de Devoluciones sería el origen formal a futuro. La forma del dato la cierra OQ-4.
- **Compliance:** ninguno formal — herramienta interna; datos de choferes (nombre, cédula, teléfono) ya se manejan hoy. Único cuidado: no exponerlos fuera del entorno interno.
- **Equipo/stack:** sin capacidades nuevas — mismo equipo, Vite/React/Supabase/TS.
- **Restricciones:** sin fecha límite formal; el ritmo lo marca el cierre de OQ-4.
- **Bloqueadores:** (1) sync con Devoluciones pendiente y sin responsable → bloquea OQ-4 y la regla "cabe" de FR16.4; (2) sin métrica de éxito comprometida; (3) DB compartida y mockeada.
- **Infra AWS:** no aplica — corre sobre Supabase, despliegue de la app existente.
- **Recomendación:** viable; desdoblar FR16.1–16.3 (avanzables ya) de FR16.4 (espera OQ-4).

- Looks correct
- Request changes

[Answer]: Looks correct
