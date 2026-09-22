// Infraestructura de dinero — único lugar del kernel que convierte Money (string) <-> Decimal.
// Puerto literal de vista-tarifas-fase1/src/kernel/money.ts.

import Decimal from 'decimal.js';
import type { Country, Money, RoundingMode } from './types';

// Precisión de trabajo interna (no es el redondeo final): el margen para que operaciones
// intermedias (porcentajes, prorrateos) no pierdan precisión antes de llegar al redondeo de país.
Decimal.set({ precision: 34 });

export const ZERO: Decimal = new Decimal(0);

export function toDecimal(value: Money | number): Decimal {
  return new Decimal(value);
}

export function toMoney(value: Decimal): Money {
  return value.toFixed();
}

const ROUNDING_MODE_MAP: Record<RoundingMode, Decimal.Rounding> = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  UP: Decimal.ROUND_UP,
  DOWN: Decimal.ROUND_DOWN,
};

// Único punto de redondeo del sistema. Todo lo demás opera con la precisión interna completa;
// solo al presentar/persistir un total se pasa por aquí.
export function roundMoney(value: Decimal, country: Pick<Country, 'roundingDecimals' | 'roundingMode'>): Decimal {
  return value.toDecimalPlaces(country.roundingDecimals, ROUNDING_MODE_MAP[country.roundingMode]);
}

// Redondea Y fija la cantidad de decimales en el string resultante (a diferencia de `toMoney`,
// que preserva la precisión exacta sin rellenar ceros): "510.00", no "510".
export function roundToMoney(value: Decimal, country: Pick<Country, 'roundingDecimals' | 'roundingMode'>): Money {
  return roundMoney(value, country).toFixed(country.roundingDecimals);
}

export function addAll(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}

export function isNegative(value: Decimal): boolean {
  return value.isNegative() && !value.isZero();
}
