// Infraestructura de dinero — único lugar del kernel que convierte Money (string) <-> Decimal.
// Puerto literal de vista-tarifas-fase1/src/kernel/money.ts.

import Decimal from 'decimal.js';
import type { Country, Money, RoundingMode } from './types';

// Precisión de trabajo interna (no es el redondeo final): el margen para que operaciones
// intermedias (porcentajes, prorrateos) no pierdan precisión antes de llegar al redondeo de país.
Decimal.set({ precision: 34 });

export const ZERO: Decimal = new Decimal(0);

const PERCENT_SCALE = 100;
const DEFAULT_PERCENT_DECIMALS = 2;

export function toDecimal(value: Money | number): Decimal {
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new Error(`Valor numérico inválido: ${String(value)}`);
  return decimal;
}

/** Interpreta texto de un formulario ("1.234,50" no; "12,5" sí) como Decimal, o null si no es válido. */
export function parseMoneyInput(text: string): Decimal | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return new Decimal(normalized);
}

/**
 * Valor numérico para el motor sin perder precisión: devuelve `number` cuando el texto cabe EXACTO
 * en un float (el caso de siempre) y el string decimal cuando no (más de ~15 cifras). null si no es número.
 */
export function exactNumber(value: string | number | null | undefined): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Estricto: sin coma. "1,234" es ambiguo (¿mil doscientos o uno coma dos?) y es mejor un error de campo.
  const text = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const parsed = new Decimal(text);
  const asNumber = parsed.toNumber();
  return Number.isFinite(asNumber) && new Decimal(asNumber).equals(parsed) ? asNumber : parsed.toFixed();
}

/** Suma montos (strings) sin pasar por `number`. */
export function sumMoney(values: Money[]): Decimal {
  return values.reduce((acc, v) => acc.plus(toDecimal(v)), ZERO);
}

/** Compara dos montos: -1, 0 o 1. */
export function cmpMoney(a: Money, b: Money): number {
  return toDecimal(a).comparedTo(toDecimal(b));
}

/** Fracción ("0.155") a porcentaje para mostrar ("15.50"). */
export function pctToDisplay(fraction: Money, decimals = DEFAULT_PERCENT_DECIMALS): string {
  return toDecimal(fraction).times(PERCENT_SCALE).toFixed(decimals);
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
