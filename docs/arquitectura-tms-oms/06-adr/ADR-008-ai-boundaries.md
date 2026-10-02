# ADR-008 — Límites de la capa de IA

**Estado:** Propuesto

## Contexto

El prompt maestro pide IA en la plataforma (predicciones, anomalías, ETA
predictivo, demanda, recomendaciones) pero prohíbe explícitamente que una
decisión crítica dependa exclusivamente de una respuesta no auditable de un
LLM (§25).

## Decisión

Modelo de tres capas: **Reglas** (determinístico, Capa 1) → **Optimización**
(matemático, Capa 2) → **IA** (Capa 3). La IA solo produce
`ai_recommendations` con `confidence` y nunca escribe directamente el estado
final de un pedido/viaje — una recomendación de IA se convierte en decisión
solo si la Capa 1 la valida contra reglas duras, o si un humano la aprueba
explícitamente (human-in-the-loop, ver ADR asociado a §38).

## Consecuencias

- Cualquier feature de IA nueva debe declarar explícitamente en qué capa
  vive y qué reglas de la Capa 1 la acotan.
- No se implementa IA para decisiones donde ya existe una regla o algoritmo
  determinístico suficiente (ej. compatibilidad de licencia — eso es Capa 1,
  no Capa 3, aunque técnicamente un LLM "podría" resolverlo).

## Alternativas rechazadas

- **IA como capa de decisión única** (sin reglas/optimización debajo):
  rechazada explícitamente por el prompt maestro — "no quiero una caja
  negra" (§12) aplica con más fuerza a IA que a cualquier otra capa.
