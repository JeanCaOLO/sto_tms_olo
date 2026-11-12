// Mapeo de una fila de costo (dominio) a columnas de la tabla. Una sola definición: antes estaba
// copiada en `template.ts`, `import.ts` y `mutations.ts`, y la de `updateRow` olvidaba la
// frecuencia, las unidades y el costo por km.

import type { Row } from '../data';
import type { CostRowInput } from './types';

/** Todas las columnas de una fila nueva. */
export function rowValues(structureId: string, input: CostRowInput, order: number): Row {
  return {
    structure_id: structureId,
    code: input.code,
    label: input.label,
    driver: input.driver,
    amount: input.amount,
    sign: input.sign,
    applies_when: input.appliesWhen,
    unit: input.unit,
    row_order: order,
    active: input.active,
    cost_group: input.group ?? null,
    frequency: input.frequency ?? null,
    frequency_qty: input.frequencyQty ?? null,
    unit_qty: input.unitQty ?? null,
    cost_per_km: input.costPerKm ?? null,
    truck_type: input.truckType ?? null,
  };
}

/** Solo las columnas que el cambio trae (undefined = no tocar). */
export function rowPatch(input: Partial<CostRowInput>): Row {
  const values: Row = {};
  if (input.code !== undefined) values.code = input.code;
  if (input.label !== undefined) values.label = input.label;
  if (input.driver !== undefined) values.driver = input.driver;
  if (input.amount !== undefined) values.amount = input.amount;
  if (input.sign !== undefined) values.sign = input.sign;
  if (input.appliesWhen !== undefined) values.applies_when = input.appliesWhen;
  if (input.unit !== undefined) values.unit = input.unit;
  if (input.active !== undefined) values.active = input.active;
  if (input.truckType !== undefined) values.truck_type = input.truckType;
  if (input.group !== undefined) values.cost_group = input.group;
  if (input.frequency !== undefined) values.frequency = input.frequency;
  if (input.frequencyQty !== undefined) values.frequency_qty = input.frequencyQty;
  if (input.unitQty !== undefined) values.unit_qty = input.unitQty;
  if (input.costPerKm !== undefined) values.cost_per_km = input.costPerKm;
  return values;
}
