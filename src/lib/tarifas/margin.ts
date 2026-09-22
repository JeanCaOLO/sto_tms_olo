// Margen + semáforo. amount = liquidado - costo; pct = amount / liquidado. El status y la action
// derivan de compararlos contra la MarginPolicy del país — así "cuándo alertar" es un dato
// configurable, no una constante en el código.
//
// En este dominio no hay "cobrado a cliente": el primer parámetro es `totalLiquidado` (lo que se
// le paga al transportista/conductor por el viaje, ya calculado por el motor de reglas) — el
// margen resultante es "margen vs. costo operativo", no un margen de venta.
// Puerto (con esa reinterpretación de dominio) de vista-tarifas-fase1/src/kernel/margin.ts.

import Decimal from 'decimal.js';
import type { Country, MarginPolicy, MarginResult } from './types';
import { isNegative, roundToMoney, ZERO } from './money';

export function computeMargin(
  totalLiquidado: Decimal,
  costTotal: Decimal,
  policy: MarginPolicy,
  country: Pick<Country, 'roundingDecimals' | 'roundingMode'>,
): MarginResult {
  const amount = totalLiquidado.minus(costTotal);
  const pct = totalLiquidado.isZero() ? ZERO : amount.dividedBy(totalLiquidado);

  const status: MarginResult['status'] = isNegative(amount)
    ? 'LOSS'
    : pct.lessThan(policy.criticalBelow)
      ? 'CRITICAL'
      : pct.lessThan(policy.warnBelow)
        ? 'WARN'
        : 'OK';

  const action: MarginResult['action'] =
    status === 'LOSS' && policy.blockOnLoss
      ? 'BLOCK'
      : pct.lessThan(policy.requireReasonBelow)
        ? 'REQUIRE_REASON'
        : 'NONE';

  return {
    amount: roundToMoney(amount, country),
    pct: pct.toFixed(4),
    status,
    action,
  };
}
