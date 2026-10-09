// Funciones de escalones para evaluación de reglas de tarificación.

import Decimal from 'decimal.js';
import type { Tier } from '../types';
import { toDecimal, ZERO } from '../money';

/**
 * Ordena los tramos de menor a mayor, con el abierto (`upTo: null`) al final.
 *
 * Es defensivo a propósito: si los tramos llegan desordenados, la búsqueda "el primero que cubre"
 * elige el equivocado y el importe sale mal sin ninguna señal. Ordenar acá hace que el resultado no
 * dependa del orden en que se escribieron ni del que devolvió la base.
 */
export function sortTiers(tiers: Tier[]): Tier[] {
  return [...tiers].sort((a, b) => {
    if (a.upTo === null) return 1;
    if (b.upTo === null) return -1;
    return a.upTo - b.upTo;
  });
}

/**
 * Escalón marginal: cada tramo cobra su tarifa solo por las unidades que caen DENTRO de él.
 * Es la forma en que se calcula un impuesto por tramos, y la que produce 425 en el ejemplo del
 * tipo `TierMode` mientras que `RATE` produce 375.
 */
export function progressiveAmount(qty: Decimal, tiers: Tier[]): Decimal {
  let total = ZERO;
  let lower = ZERO;

  for (const tier of sortTiers(tiers)) {
    // El tramo abierto se extiende hasta donde llegue la cantidad.
    const upper = tier.upTo === null ? qty : toDecimal(tier.upTo);
    const top = Decimal.min(qty, upper);
    const span = top.minus(lower);

    if (span.greaterThan(0)) total = total.plus(span.times(toDecimal(tier.amount)));

    lower = upper;
    if (qty.lessThanOrEqualTo(upper)) break;
  }

  return total;
}

/** Tramo que cubre una cantidad, ya con los tramos ordenados. */
export function findTier(qty: Decimal, tiers: Tier[]): Tier | undefined {
  return sortTiers(tiers).find((t) => t.upTo === null || qty.lessThanOrEqualTo(t.upTo));
}
