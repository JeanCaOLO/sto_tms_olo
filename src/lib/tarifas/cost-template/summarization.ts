// Generación de resúmenes de estructuras de costos.
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`.

import Decimal from 'decimal.js';
import { toDecimal } from '../money';
import type { CostRowInput } from '../costStructureDataSource';
import type { CostStructureParams } from '../types';

/** Costo del viaje tipo de cada camión, para que quien carga vea si las cifras tienen sentido. */
export interface TruckSummary {
  truckType: string | null;
  /** Suma de importes mensuales fijos. */
  fixedMonthly: string;
  /** Fijo mensual ÷ días operativos. */
  fixedDaily: string;
  /** Suma del costo por km de los componentes. */
  variablePerKm: string;
  /** Combustible por km (si hay precio y rendimiento). */
  fuelPerKm: string | null;
}

/** Totales por tipo de camión: lo mínimo para que quien carga vea si las cifras tienen sentido. */
export function summarize(rows: CostRowInput[], params: CostStructureParams, operatingDays: number): TruckSummary[] {
  const types = new Set<string | null>(rows.map((r) => r.truckType ?? null));
  for (const truck of Object.keys(params.fuelEfficiency)) types.add(truck);
  const generic = rows.filter((r) => !r.truckType);

  const result: TruckSummary[] = [];
  for (const truck of types) {
    if (truck === null && types.size > 1 && generic.length === 0) continue;
    const mine = rows.filter((r) => (truck === null ? !r.truckType : !r.truckType || r.truckType === truck));
    const fixedMonthly = mine
      .filter((r) => r.driver === 'PER_MONTH_PRORATED')
      .reduce((sum, r) => sum.plus(r.amount), new Decimal(0));
    const variablePerKm = mine
      .filter((r) => r.frequency)
      .reduce((sum, r) => sum.plus(r.costPerKm ?? 0), new Decimal(0));
    const efficiency = truck ? params.fuelEfficiency[truck] : undefined;
    const fuelPerKm = params.fuelPrice && efficiency && toDecimal(efficiency).greaterThan(0)
      ? toDecimal(params.fuelPrice).dividedBy(efficiency)
      : null;
    result.push({
      truckType: truck,
      fixedMonthly: fixedMonthly.toFixed(2),
      fixedDaily: operatingDays > 0 ? fixedMonthly.dividedBy(operatingDays).toFixed(2) : '0.00',
      variablePerKm: variablePerKm.toFixed(4),
      fuelPerKm: fuelPerKm ? fuelPerKm.toFixed(4) : null,
    });
  }
  return result;
}
