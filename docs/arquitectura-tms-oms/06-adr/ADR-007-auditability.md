# ADR-007 — Auditabilidad de decisiones automáticas

**Estado:** Propuesto

## Contexto

Ninguna decisión automática hoy (ni las del OMS mock, ni las del kernel de
tarifas) persiste su razonamiento en una tabla consultable — el kernel de
tarifas genera `TraceLine` pero solo se conserva si se emite una `Proforma`.
El prompt maestro exige (§12) que toda decisión automática sea explicable:
qué regla, qué versión, sobre qué pedido, qué condición, qué decisión, cuándo
y por qué.

## Decisión

`decision_logs` + `decision_factors` (una fila por razón/factor, con peso) +
`rule_execution_logs` (qué versión de qué regla se ejecutó) +
`optimization_runs`/`optimization_results` para las decisiones que vienen
del motor de ruteo. IDs de correlación (`correlation_id`, `order_id`,
`planning_run_id`, `optimization_run_id`, `trip_id`, `rule_execution_id`,
`decision_id`) propagados como columnas, no solo como texto en logs.

## Consecuencias

- Cada nueva decisión automática (priorización, asignación de ruta,
  asignación de recurso) debe escribir su propia fila de auditoría como
  parte de la misma transacción que produce el efecto — no como paso
  posterior opcional.
- El ejemplo del prompt maestro ("Pedido #123 asignado a Ruta #55, 8
  razones") se sirve directamente uniendo `decision_logs` +
  `decision_factors` por `decision_id`.

## Alternativas rechazadas

- **Solo logs de texto (no estructurados)**: rechazado — no permite
  reconstruir "qué regla, qué versión, qué condición" de forma consultable,
  solo narrativa.
- **Auditoría solo en el frontend (estado de React)**: rechazado — se
  pierde al recargar la página y no es multi-usuario.
