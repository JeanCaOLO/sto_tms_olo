// Piezas compartidas por el cálculo de costos de viaje (`structure.ts`) y el costo por km de la
// estructura (`baseMethods.ts`): antes cada uno tenía su copia y podían divergir.

import type { CalculateInput, CostStructure, CostStructureRow } from '../types';
import { normalizeText } from '../../text';

type StructureInput = Pick<
  CalculateInput,
  'costStructure' | 'costStructureRows' | 'defaultCostStructure' | 'defaultCostStructureRows'
>;

/** ¿La estructura está activa y tiene filas? */
export const hasRows = (
  structure: CostStructure | null | undefined,
  rows: CostStructureRow[] | undefined,
): boolean => !!structure?.active && !!rows?.length;

/** Estructura de la compañía; si no tiene filas activas, la del país. null si no hay ninguna. */
export function pickStructure(
  input: StructureInput,
): { structure: CostStructure; rows: CostStructureRow[] } | null {
  if (hasRows(input.costStructure, input.costStructureRows)) {
    return { structure: input.costStructure!, rows: input.costStructureRows! };
  }
  if (hasRows(input.defaultCostStructure, input.defaultCostStructureRows)) {
    return { structure: input.defaultCostStructure!, rows: input.defaultCostStructureRows! };
  }
  return null;
}

/** Mismo tipo de camión sin distinguir mayúsculas, acentos ni espacios en los extremos. */
export function sameTruckType(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeText(a) === normalizeText(b);
}

/** ¿La fila de costo aplica a este camión? Sin tipo de camión en la fila = aplica a todos. */
export function rowAppliesToTruck(row: Pick<CostStructureRow, 'truckType'>, truckTypeId: string | null | undefined): boolean {
  return !row.truckType || sameTruckType(row.truckType, truckTypeId);
}

/** Rendimiento (km por litro) del camión, buscando el tipo sin distinguir mayúsculas ni acentos. */
export function fuelEfficiencyFor(
  fuelEfficiency: Record<string, string>,
  truckTypeId: string | null | undefined,
): string | undefined {
  if (!truckTypeId) return undefined;
  if (fuelEfficiency[truckTypeId] !== undefined) return fuelEfficiency[truckTypeId];
  const key = Object.keys(fuelEfficiency).find((k) => sameTruckType(k, truckTypeId));
  return key === undefined ? undefined : fuelEfficiency[key];
}
