// Resolución de unidades según el driver (PER_KM, PER_DAY, etc.) y cálculo de costo por km.

import Decimal from 'decimal.js';
import type { BuiltinCostDriver, CalculateInput, CostStructureRow, VarBag } from '../types';
import { toDecimal } from '../money';

/**
 * Cuántas unidades le corresponden a una fila en ESTE viaje, según su driver.
 * Es el único lugar donde se decide qué significa "por km", "por día" o "mensual prorrateado".
 *
 * Un driver `custom:*` es una variable numérica de la compañía ("peajes", "bultos").
 */
export function unitsForDriver(
  driver: string,
  trip: CalculateInput['trip'],
  days: number,
  operatingDaysPerMonth: number,
  vars?: VarBag,
  warn?: (message: string) => void,
): Decimal {
  if (driver.startsWith('custom:')) {
    const raw = (vars as Record<string, unknown> | undefined)?.[driver];
    if (raw === undefined || raw === null) {
      warn?.(`La variable "${driver}" no tiene valor en este viaje: la fila de costo vale 0.`);
      return new Decimal(0);
    }
    return toDecimal(raw as number | string);
  }

  const builtinDriver = driver as BuiltinCostDriver;
  switch (builtinDriver) {
    case 'FIXED':
      return new Decimal(1);
    case 'PER_KM':
      return toDecimal(trip.km);
    case 'PER_DAY':
      return toDecimal(days);
    case 'PER_MONTH_PRORATED':
      // Reparte el costo mensual entre los días operativos y multiplica por duración.
      if (operatingDaysPerMonth <= 0) return new Decimal(0);
      return toDecimal(days).dividedBy(operatingDaysPerMonth);
    case 'PER_CLIENT':
      return toDecimal(trip.clientCount);
    case 'PER_HOUR':
      return toDecimal(trip.durationHours);
    default:
      warn?.(`El driver "${driver}" no se reconoce: la fila de costo vale 0.`);
      return new Decimal(0);
  }
}

/** Etiquetas legibles para cada tipo de driver. */
export const COST_DRIVER_LABELS: Record<BuiltinCostDriver, string> = {
  FIXED: 'Fijo por viaje',
  PER_KM: 'Por kilómetro',
  PER_DAY: 'Por día de viaje',
  PER_MONTH_PRORATED: 'Mensual (prorrateado por día)',
  PER_CLIENT: 'Por parada/cliente',
  PER_HOUR: 'Por hora',
};

/**
 * Costo por kilómetro de un componente que se repite (mantenimiento, llantas…).
 * Nulo si faltan datos.
 */
export function componentCostPerKm(
  row: Pick<CostStructureRow, 'amount' | 'frequency' | 'frequencyQty'>,
  kmPerYear: number | null,
): Decimal | null {
  const qty = row.frequencyQty;
  if (!row.frequency || qty === null || qty === undefined || !(qty > 0)) return null;

  const amount = toDecimal(row.amount);
  switch (row.frequency) {
    case 'km':
      return amount.dividedBy(qty);
    case 'year':
      return kmPerYear && kmPerYear > 0
        ? amount.dividedBy(new Decimal(qty).times(kmPerYear))
        : null;
    case 'month':
      return kmPerYear && kmPerYear > 0
        ? amount.dividedBy(new Decimal(qty).times(kmPerYear).dividedBy(12))
        : null;
    default:
      return null;
  }
}
