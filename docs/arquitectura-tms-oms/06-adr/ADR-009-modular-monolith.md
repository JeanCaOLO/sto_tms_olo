# ADR-009 — Modular Monolith (no microservicios)

**Estado:** Superado por [`../../decisions/0002-backend-lambdas-python-sam.md`](../../decisions/0002-backend-lambdas-python-sam.md)

## Contexto

El prompt maestro pide una arquitectura "multi-país, multi-almacén,
multi-cliente, autónoma, configurable, escalable, auditable" pero también
advierte explícitamente contra la sobreingeniería (§44): no 50
microservicios, no Kafka innecesario, no Kubernetes sin necesidad, no CQRS
por moda, no event sourcing completo sin justificación. El backend actual ya
es un monolito Express razonablemente simple.

## Decisión

Evolucionar el backend actual hacia un **modular monolith**: mismo proceso
Express, pero con bounded contexts explícitos como carpetas/paquetes con
reglas de import controladas (Identity, Master Data, OMS, Rules, Planning,
Routing, Fleet, Carriers, Pricing, TMS Execution, Tracking, Settlement,
Integrations, Analytics — §44). Se diseñan los límites de dominio para que
una futura extracción a servicio independiente (ej. el motor de ruteo, si
demuestra necesitar escalar aparte) sea posible sin rediseñar el dominio.

## Consecuencias

- Un solo despliegue, un solo pipeline CI/CD, consistente con el stack ya
  `DECIDED` en `project.md` (SAM por módulo, `common-services` compartido).
- Requiere disciplina de imports (lint de dependencias entre contextos) para
  no degradar en un monolito no-modular con el tiempo.
- Extracción a microservicio se evalúa por evidencia (carga real, necesidad
  de escalar independientemente), no por defecto.

## Alternativas rechazadas

- **Microservicios desde el día 1**: rechazado explícitamente por el prompt
  maestro y por la escala actual del negocio (Costa Rica, 2 clientes) — el
  costo operativo de N servicios no está justificado todavía.
- **Event sourcing completo**: rechazado por la misma razón — se deja la
  puerta abierta a eventos de dominio (§29) sin construir la infraestructura
  pesada hasta que el análisis demuestre que la complejidad lo justifica.
