// Modelo de costo por km en TRES valores separados (mandato del gerente general, 2026-09-16):
//
//   operatingPerKm  costo operativo real por km recorrido (fijo + variable + diésel).
//   billablePerKm   costo por km FACTURABLE: el operativo cargado con los km vacíos, porque el
//                   transportista recorre km sin carga que alguien tiene que pagar.
//                       billable = operating ÷ loadedKmRatio       (ratio = km con carga ÷ km totales)
//   salePerKm       tarifa de venta por km:  billable ÷ (1 − margen)
//
// Módulo PURO y todavía NO conectado al cálculo de liquidar (esa es una decisión abierta de negocio:
// qué entra en "facturable" y de dónde sale el % de margen). Es la base para cuando se cierre.
//
// Nota: el `margen` de acá es un margen sobre la VENTA (markup de tarifa) y no tiene nada que ver con
// `margin.ts`, que es la ganancia de auditoría del viaje contra el valor de la mercancía.

import Decimal from 'decimal.js';
import { tryDecimal } from '../money';

export interface PerKmInput {
  /** Costo operativo por km (≥ 0). */
  operatingPerKm: Decimal | string | number;
  /** Fracción de los km totales que van con carga, en (0, 1]. Sin dato = 1 (no hay km vacíos). */
  loadedKmRatio?: Decimal | string | number | null;
  /** Margen de utilidad sobre la venta, en [0, 1). Sin dato = 0. */
  margin?: Decimal | string | number | null;
}

export interface PerKmValues {
  operatingPerKm: Decimal;
  billablePerKm: Decimal;
  salePerKm: Decimal;
}

export class PerKmInputError extends Error {}

const ONE = new Decimal(1);

function dec(value: Decimal | string | number, label: string): Decimal {
  const d = value instanceof Decimal ? value : tryDecimal(value);
  if (d === null || !d.isFinite()) throw new PerKmInputError(`${label} no es un número válido.`);
  return d;
}

/** Los tres valores de costo por km, o lanza `PerKmInputError` con un mensaje accionable. */
export function computePerKm(input: PerKmInput): PerKmValues {
  const operating = dec(input.operatingPerKm, 'El costo operativo por km');
  if (operating.isNegative()) throw new PerKmInputError('El costo operativo por km no puede ser negativo.');

  const ratio = input.loadedKmRatio === null || input.loadedKmRatio === undefined
    ? ONE
    : dec(input.loadedKmRatio, 'La proporción de km con carga');
  if (!ratio.greaterThan(0) || ratio.greaterThan(1)) {
    throw new PerKmInputError('La proporción de km con carga debe estar entre 0 (excluido) y 1.');
  }

  const margin = input.margin === null || input.margin === undefined
    ? new Decimal(0)
    : dec(input.margin, 'El margen');
  if (margin.isNegative() || margin.greaterThanOrEqualTo(1)) {
    throw new PerKmInputError('El margen debe ser al menos 0 y menor que 1 (100 %): con 1 la tarifa de venta no existe.');
  }

  const billable = operating.dividedBy(ratio);
  return {
    operatingPerKm: operating,
    billablePerKm: billable,
    salePerKm: billable.dividedBy(ONE.minus(margin)),
  };
}
