// Herencia de la base: un ajuste (recargo, descuento, modificador…) puede quedar ligado a una o más
// formas de cobro (`appliesToBase`) y solo aplica cuando la base del viaje es una de ellas. Sin ligar
// (null o vacío) es transversal: aplica con cualquier base, como todas las reglas hasta ahora.
//
// Lógica pura, como el resto del kernel.

import { BASE_METHODS } from './baseMethods';
import type { BaseMethodId, DiscardedRule, Rule } from './types';

/**
 * Forma de cobro con que se liquida el viaje, o null si no se conoce (un tercero sin base del
 * catálogo): sin modalidad activa no se descarta nada.
 *
 * - Tercero con base del catálogo: la elegida (`baseOverride.method`).
 * - Flota propia: por km, porque su base es la estructura de costos (costo por km).
 */
export function activeBaseMethod(
  fleetType: string,
  chosenMethod: BaseMethodId | undefined,
): BaseMethodId | null {
  if (fleetType === 'OWN') return 'PER_KM';
  return chosenMethod ?? null;
}

const labels = (methods: BaseMethodId[]) => methods.map((m) => BASE_METHODS[m].label.toLowerCase()).join(' o ');

/** Quita los ajustes ligados a otra forma de cobro; devuelve los que quedan y los descartados con el motivo. */
export function filterByBaseMethod(
  rules: Rule[],
  active: BaseMethodId | null,
): { rules: Rule[]; discarded: DiscardedRule[] } {
  if (!active) return { rules, discarded: [] };
  const kept: Rule[] = [];
  const discarded: DiscardedRule[] = [];
  for (const rule of rules) {
    const linked = rule.appliesToBase ?? [];
    if (rule.stage === 'BASE' || linked.length === 0 || linked.includes(active)) {
      kept.push(rule);
      continue;
    }
    discarded.push({
      ruleCode: rule.code,
      reason: 'MODALIDAD_DISTINTA',
      detail: `Aplica solo a base ${labels(linked)}; este viaje se cobra por ${BASE_METHODS[active].label.toLowerCase()}.`,
    });
  }
  return { rules: kept, discarded };
}
