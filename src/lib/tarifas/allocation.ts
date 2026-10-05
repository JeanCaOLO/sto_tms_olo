// Reparto del total de un viaje entre las casas comerciales que lo cargan.
//
// Proceso real (BPMN del liquidador): "cada casa paga un porcentaje del viaje según el valor de la
// mercancía transportada" y se genera una factura por casa. A futuro también por volumen y peso.
//
// Módulo PURO. Reparte con decimales exactos y el redondeo cuadra al centavo: la suma de lo que le
// toca a cada casa es EXACTAMENTE el total, sin perder ni inventar un centavo. El residuo del
// redondeo se le da a la casa de mayor parte (la que menos lo siente).

import Decimal from 'decimal.js';
import { addAll, roundToMoney, toDecimal } from './money';
import type {
  Allocation, AllocationCriterion, AllocationShare, CargoPart, CargoSummary, Country, Money,
} from './types';

const SHARE_DECIMALS = 6;

function weightOf(part: CargoPart, criterion: AllocationCriterion): Decimal {
  switch (criterion) {
    case 'VALUE': return toDecimal(part.value);
    case 'WEIGHT': return toDecimal(part.weightKg);
    case 'VOLUME': return toDecimal(part.volumeM3);
  }
}

/**
 * Reparte `total` entre las casas de `cargo` según `criterion`.
 *
 * Si la base elegida suma cero (pedidos sin valor, por ejemplo) NO se inventa un reparto: se cae a
 * repartir por cantidad de pedidos y `basis` lo dice, para que la pantalla lo avise. Sin mercancía
 * cargada no hay reparto (null).
 */
export function allocateTotal(
  total: Money,
  cargo: CargoSummary | null | undefined,
  criterion: AllocationCriterion,
  country: Pick<Country, 'roundingDecimals' | 'roundingMode' | 'localCurrency'>,
): Allocation | null {
  const parts = cargo?.parts ?? [];
  if (parts.length === 0) return null;

  let basis: Allocation['basis'] = criterion;
  let weights = parts.map((p) => weightOf(p, criterion));
  let denominator = addAll(weights);

  if (!denominator.greaterThan(0)) {
    basis = 'ORDERS';
    weights = parts.map((p) => new Decimal(Math.max(p.orders, 0)));
    denominator = addAll(weights);
    if (!denominator.greaterThan(0)) {
      // Ni pedidos hay que contar: partes iguales.
      weights = parts.map(() => new Decimal(1));
      denominator = new Decimal(parts.length);
    }
  }

  const totalDec = toDecimal(total);
  const shares = weights.map((w) => w.dividedBy(denominator));
  const amounts = shares.map((s) => roundToMoney(totalDec.times(s), country));

  // El redondeo puede dejar la suma a unos centavos del total: se corrige en la casa de mayor parte.
  const rounded = amounts.map(toDecimal);
  const residue = roundToMoney(totalDec.minus(addAll(rounded)), country);
  if (!toDecimal(residue).isZero()) {
    let biggest = 0;
    shares.forEach((s, i) => { if (s.greaterThan(shares[biggest])) biggest = i; });
    amounts[biggest] = roundToMoney(rounded[biggest].plus(residue), country);
  }

  const result: AllocationShare[] = parts.map((part, i) => ({
    customerId: part.customerId,
    code: part.code,
    name: part.name,
    share: shares[i].toFixed(SHARE_DECIMALS),
    amount: amounts[i],
    value: part.value,
    weightKg: part.weightKg,
    volumeM3: part.volumeM3,
    orders: part.orders,
  }));

  return {
    criterion,
    basis,
    total: roundToMoney(totalDec, country),
    currency: country.localCurrency,
    shares: result,
  };
}

/** ¿Cuadra el reparto? Para tests y para verificar un reparto guardado. */
export function allocationAddsUp(allocation: Allocation): boolean {
  return addAll(allocation.shares.map((s) => toDecimal(s.amount))).equals(toDecimal(allocation.total));
}
