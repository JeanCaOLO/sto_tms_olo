// calculate(): el único punto de entrada del kernel. Orquesta resolver -> cost -> evaluator ->
// margin/reparto y devuelve un CalcResult completo: cuánto se le debe LIQUIDAR (pagar) por el viaje.
//
// Qué se liquida:
//   - Flota propia: la acumulación de gastos de la estructura de costos (es la base del total) más
//     lo que las reglas activas sumen o resten encima.
//   - Terceros: lo que dicen las reglas y los tarifarios.
// La ganancia o pérdida NO entra en la liquidación: se calcula aparte, para auditoría, contra el
// valor de la mercancía del viaje. El reparto entre casas comerciales tampoco cambia el total.
//
// Es una función pura: recibe todo lo que necesita como parámetro (CalculateInput), no lee nada
// del entorno.

import { allocateTotal } from './allocation';
import { describeBaseMethods, type BaseMethodOption } from './baseMethods';
import { activeBaseMethod, filterByBaseMethod } from './baseInheritance';
import { applyBaseOverride } from './baseOverride';
import { computeCost } from './cost';
import { runChargePipeline } from './evaluator';
import { computeMargin } from './margin';
import { deriveContext, resolveRules } from './resolver';
import type { CalculateInput, CalcResult } from './types';
import { toDecimal } from './money';

export function calculate(input: CalculateInput): CalcResult {
  const derived = deriveContext(input);
  const { applied, candidates, discarded, warnings: resolverWarnings } = resolveRules(input, derived);

  // Los gastos van primero: son la base del total de la flota propia.
  const costWarnings: string[] = [];
  const cost = computeCost(input, derived.overnightNights, derived.vars, (m) => costWarnings.push(m));

  // Base del tercero según el catálogo (carriers.rate_type): reemplaza los gastos sembrados y las
  // reglas BASE, y omite lo que cobraría lo mismo en otra fase. La flota propia nunca la usa: su base
  // es siempre la estructura de costos.
  const chosen = input.baseOverride && input.trip.fleetType !== 'OWN'
    ? applyBaseOverride(input, input.baseOverride, applied, candidates, cost.breakdown, derived.vars)
    : null;

  // Los ajustes ligados a otra forma de cobro no aplican a este viaje.
  const inherited = filterByBaseMethod(
    chosen?.rules ?? applied,
    activeBaseMethod(input.trip.fleetType, chosen?.base?.method),
  );

  const charge = runChargePipeline(
    inherited.rules, derived.vars, derived.originZoneId, derived.destZoneId, input,
    { lines: chosen ? chosen.seed : cost.breakdown },
  );

  const margin = computeMargin(
    toDecimal(input.cargo?.value ?? '0'),
    toDecimal(charge.totalLiquidado),
    input.marginPolicy,
    input.country,
  );
  const allocation = allocateTotal(
    charge.totalLiquidado, input.cargo, input.allocationCriterion ?? 'VALUE', input.country,
  );

  return {
    trace: charge.trace,
    // Los descartes salen de dos momentos: el resolver (condición, alcance, exclusividad) y el
    // pipeline (perdedores de un grupo MAX, que solo se conocen con los montos reales).
    discarded: [...discarded, ...(chosen?.discarded ?? []), ...inherited.discarded, ...charge.discarded],
    stageSubtotals: charge.stageSubtotals,
    totalLiquidado: charge.totalLiquidado,
    currency: input.country.localCurrency,
    cost,
    margin,
    allocation,
    warnings: [...resolverWarnings, ...(chosen?.warnings ?? []), ...charge.warnings, ...costWarnings],
    blockingIssues: [...(chosen?.issues ?? []), ...charge.blockingIssues],
    ...(chosen?.base ? { base: chosen.base } : {}),
  };
}

/** Formas de cobro que el catálogo de reglas puede resolver para este viaje, con su fuente o el motivo del bloqueo. */
export function listBaseMethods(input: CalculateInput): BaseMethodOption[] {
  const derived = deriveContext(input);
  const { candidates } = resolveRules(input, derived);
  return describeBaseMethods(input, candidates, derived.vars);
}

export * from './types';
export { evaluateExpr, evaluatePred } from './evaluator';
export { computeOvernightNights, computeWeekday, deriveContext, resolveRules } from './resolver';
export { computeCost } from './cost';
export { BASE_METHODS, BASE_METHOD_ORDER, classifyExpr, structureCostPerKm } from './baseMethods';
export type { BaseMethodOption } from './baseMethods';
export { computeMargin } from './margin';
export { allocateTotal, allocationAddsUp } from './allocation';
export * from './money';
