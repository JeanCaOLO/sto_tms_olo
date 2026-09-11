# Constraint Register — Devoluciones/Pickups (FR16)

Restricciones que acotan el diseño de FR16, derivadas de
`../intent-capture/intent-statement.md`, del código existente y de las
reuniones de levantamiento.

## Restricciones técnicas

| ID | Restricción | Impacto |
|----|-------------|---------|
| CT-1 | La optimización de la ruta es previa al despacho, no en tiempo real. | FR16.4 (recálculo en vivo) necesita un flujo nuevo, no una extensión del actual. |
| CT-2 | El módulo consume la asignación viaje↔pedidos como fuente de verdad y **no la recalcula** (regla de la Reunión 2026-08-18). | La recolección conocida debe llegar ya asignada a un viaje; el TMS no decide a qué viaje va. |
| CT-3 | Stack fijo: Vite + React + Supabase + TypeScript. | Sin cambios de plataforma. |
| CT-4 | La tabla `trips`/`trip_orders` real aún no existe en Supabase; hoy el módulo trabaja con mocks (`MOCKING.md`). | El diseño describe el modelo objetivo; la implementación real espera esas tablas. |
| CT-5 | No hay infraestructura AWS propia de Planificación. | Nada que provisionar; la feature viaja en el despliegue de la app existente. |

## Restricciones organizacionales

| ID | Restricción | Impacto |
|----|-------------|---------|
| CO-1 | El módulo de Devoluciones no tiene responsable asignado y está en levantamiento. | El sync para cerrar OQ-4 no está agendado; bloquea FR16.1 (forma del dato) y FR16.4. |
| CO-2 | La base de datos de Planificación es compartida con el resto del equipo. | Las pruebas contra datos reales son frágiles; se usa el snapshot de eflow QA en los fallbacks. |
| CO-3 | Decisión de alcance/prioridad conjunta Ana + Jesús. | Cambios de alcance requieren ambas aprobaciones. |

## Restricciones regulatorias

| ID | Restricción | Impacto |
|----|-------------|---------|
| CR-1 | No aplica ningún marco regulatorio formal (PCI/HIPAA/GDPR/SOC2). Herramienta interna. | Sin controles de compliance obligatorios. |
| CR-2 | Los datos de choferes (nombre, cédula, teléfono) son datos personales que ya se manejan hoy en el TMS/WMS. | Cuidado interno: no exponerlos fuera del entorno interno (aplica al snapshot de QA y a cualquier demo). |

## Assumptions & Open Questions

- [assumption] La forma final del dato de la recolección se confirmará en
  `requirements-analysis`; hasta entonces se asume "una parada más con tipo =
  devolución, con peso y volumen".
- Open question: OQ-4 (contrato de datos con Devoluciones) — ver
  `feasibility-assessment.md` y `raid-log.md`.
