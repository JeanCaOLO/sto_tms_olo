// Ganancia o pérdida del viaje, para AUDITORÍA: el valor de la mercancía que lleva (los pedidos de
// sus guías de despacho) contra los gastos operativos (lo que se liquida).
//
//   amount = valor de la mercancía − gastos      pct = amount ÷ valor de la mercancía
//
// NO es parte de la liquidación: no bloquea, no pide motivo y no cambia lo que se paga. El
// liquidador responde "¿cuánto se le paga al transportista?"; esto responde "¿valió la pena el
// viaje?". Los umbrales de la política solo deciden el color de la alerta.
//
// Sin valor de mercancía cargado (pedidos sin monto) NO se inventa un margen: `basis` es 'NONE'.

import Decimal from 'decimal.js';
import type { Country, MarginPolicy, MarginResult } from './types';
import { roundToMoney, ZERO } from './money';

export function computeMargin(
  cargoValue: Decimal,
  expense: Decimal,
  policy: MarginPolicy,
  country: Pick<Country, 'roundingDecimals' | 'roundingMode' | 'localCurrency'>,
): MarginResult {
  const base = {
    cargoValue: roundToMoney(cargoValue, country),
    expense: roundToMoney(expense, country),
    currency: country.localCurrency,
  };

  if (!cargoValue.greaterThan(0)) {
    return { ...base, amount: roundToMoney(ZERO, country), pct: '0.0000', status: 'OK', basis: 'NONE' };
  }

  const amount = cargoValue.minus(expense);
  const pct = amount.dividedBy(cargoValue);

  const status: MarginResult['status'] = amount.isNegative()
    ? 'LOSS'
    : pct.lessThan(policy.criticalBelow)
      ? 'CRITICAL'
      : pct.lessThan(policy.warnBelow)
        ? 'WARN'
        : 'OK';

  return { ...base, amount: roundToMoney(amount, country), pct: pct.toFixed(4), status, basis: 'CARGO' };
}
