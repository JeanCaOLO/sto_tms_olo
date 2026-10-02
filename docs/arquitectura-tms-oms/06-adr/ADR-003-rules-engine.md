# ADR-003 — Motor de Reglas compartido (OMS + TMS)

**Estado:** Propuesto

## Contexto

El repositorio ya contiene, en `src/lib/tarifas/types.ts` y `cost.ts`, un
motor de reglas maduro (AST versionado, condiciones tipadas, *stages*
ordenados, *stacking*, trazabilidad `TraceLine`, snapshots inmutables
`Proforma`) usado para tarifas/liquidación. El OMS necesita un motor de
reglas equivalente para priorización de pedidos, pero hoy solo tiene texto
descriptivo en `oms/mockData.ts`.

## Decisión

Generalizar el AST existente en un paquete de dominio compartido, con un
campo `domain` (`TARIFF` | `OMS_PRIORITY` | ...) y un vocabulario de
variables (`VarKey`) específico por dominio. Persistir en `rules` /
`rule_versions` / `rule_scopes` / `rule_execution_logs` (Postgres), en vez de
en memoria/`localData/`.

## Consecuencias

- Un solo motor de reglas para mantener, testear y auditar, en vez de dos.
- Requiere extraer el AST de `src/lib/tarifas/` sin romper Liquidaciones,
  que ya lo usa — tests de regresión obligatorios antes de reutilizarlo en
  OMS (ver `05-roadmap.md` Fase 4).
- El vocabulario (`VarKey`) de OMS (prioridad de pedido) es distinto al de
  Tarifas (costo de viaje) — el AST debe parametrizarse por dominio, no
  compartir literalmente el mismo enum de variables.

## Alternativas rechazadas

- **Construir un motor de reglas nuevo para el OMS desde cero**: rechazado
  — duplicaría exactamente las propiedades (versionado, trazabilidad,
  *stages*, overrides auditados) que `src/lib/tarifas/` ya resuelve
  correctamente.
- **Reglas de negocio en componentes React** (patrón implícito de
  `oms/mockData.ts` hoy): rechazado explícitamente por el prompt maestro
  (§11) y por el propio código actual, que ya reconoce esto como limitación
  ("la lógica de cada regla está implementada en código... solo lectura").
