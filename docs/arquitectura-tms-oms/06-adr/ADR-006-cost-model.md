# ADR-006 — Modelo de Costos (Cost Engine)

**Estado:** Propuesto (fórmula ya `DECIDED` en `project.md`; este ADR cubre
solo el aspecto de arquitectura de software, no la fórmula de negocio)

## Contexto

El mandato de Jean Carlo (`project.md`, 2026-09-16/21) ya fija la fórmula de
negocio: costo operativo/km = fijo distribuido/km productivos + variable/km;
costo facturable/km ajustado por km vacíos; tarifa de venta = facturable /
(1 − margen); todo calculado por vehículo o tipo de vehículo, nunca un único
valor para toda la empresa. `src/lib/tarifas/cost.ts` ya implementa una
versión de esto (`computeCost()`), pero en memoria, no conectada a Aurora.

## Decisión

Formalizar `computeCost()` como `CostEngine`, operando sobre `vehicles` /
`rates` / `settlements` reales, con snapshot inmutable de las variables
usadas en cada cálculo (igual que `Proforma` ya hace) — un viaje histórico
nunca se recalcula con el precio de combustible actual (§23, ya resuelto en
diseño, falta conectarlo a datos reales).

## Consecuencias

- `settlements` necesita columnas nuevas para el desglose (ver
  `03-modelo-datos-erd.md` §8) — hoy ese desglose vive en
  `settlementSnapshots.ts`, fuera de la base de datos.
- Dos decisiones de negocio siguen abiertas y bloquean el cierre de esta
  fase: base de `occupancy_pct`, y origen/alcance del % de margen.

## Alternativas rechazadas

- **Costo único por km para toda la empresa** (patrón que existía antes del
  mandato de Jean Carlo): rechazado explícitamente por el negocio.
- **Recalcular retroactivamente costos históricos con parámetros actuales**:
  rechazado — rompe la auditabilidad de liquidaciones ya emitidas.
